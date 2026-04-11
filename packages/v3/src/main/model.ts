import type { FileSystem } from './filesystem';
import type { NapkinState, AgentState, NapkinStatus, NepicInfo, Entry, FileEntry, DirEntry, WatcherEvent, PendingApproval } from '../shared/bridge-types';
import type { PtySpawner } from './pty-spawner';
import { resolveByName } from './name-resolver';
import * as crypto from 'crypto';

// ── Return types for new model methods ──

export interface CreateNapkinResult {
  slug: string;
  status: NapkinStatus;
  dir: string;
  nepic: string;
}

export interface CreateAgentResult {
  id: string;
  name: string;
  role: string;
  dir: string;
  napkin: string;
  nepic: string;
}

export interface CreateArchitectResult {
  id: string;
  name: string;
  role: string;
  dir: string;
  nepic: string;
}

export interface CreateNepicResult {
  slug: string;
  name: string;
  dir: string;
  architectId: string;
  architectDir: string;
}

export interface StartAgentResult {
  id: string;
  name: string;
  pid: number | null;
}

export interface StatusResult {
  // napkin query
  phase?: NapkinStatus;
  agentCount?: number;
  agents?: Array<{ name: string; role: string; running: boolean; done: boolean; exited: boolean }>;
  // agent query
  running?: boolean;
  done?: boolean;
  exited?: boolean;
  started?: boolean;
  archived?: boolean;
  role?: string;
  napkin?: string | null;
  sessionId?: string;
  // overview (no query)
  napkinsByPhase?: Record<string, number>;
  runningAgentsCount?: number;
  // nepic query
  napkinCount?: number;
  architectStatus?: string;
}

export interface AgentTreeNode {
  name: string;
  status: string;
  napkin: string | null;
  role: string;
  id: string;
  children: AgentTreeNode[];
}

// ── NapModel — owns the app's business state ──

export interface NapModel {
  loadFromFilesystem(nepicDir: string): Promise<void>;
  getNapkins(): NapkinState[];
  getArchitects(): AgentState[];
  getAllAgents(): AgentState[];
  onChange(listener: () => void): () => void;
  startWatching(nepicDir: string): void;
  stopWatching(): void;
  createAgent(napkinSlug: string, agentData: { name: string; role: string; cc_session_uuid?: string }): Promise<void>;
  setAgentExited(napkinSlug: string, agentName: string): Promise<void>;
  setAgentExitedById(agentId: string): Promise<void>;
  setAgentRunning(agentId: string, running: boolean): void;
  setAgentDone(agentId: string): void;
  setAgentStarted(agentId: string): Promise<void>;
  setAgentArchived(agentId: string): Promise<void>;
  spawnSuccessor(agentId: string, ptySpawner: PtySpawner): Promise<string | null>;
  setNapkinStatus(slug: string, status: string): Promise<void>;
  saveUiState(state: unknown): Promise<void>;

  // ── New methods for 0210 ──
  createNapkin(slug: string, status?: NapkinStatus, nepicId?: string): Promise<CreateNapkinResult>;
  createAgentStub(napkinSlug: string, name: string, role: string, nepicId?: string): Promise<CreateAgentResult>;
  createArchitectStub(name: string, nepicId?: string): Promise<CreateArchitectResult>;
  createNepic(slug: string, displayName: string): Promise<CreateNepicResult>;
  startAgentByName(name: string, prompt: string | null, ptySpawner: PtySpawner, nepicId?: string): Promise<StartAgentResult>;
  getStatus(query: { napkin?: string; agent?: string; nepic?: string }): StatusResult;
  getAllAgentsTree(): AgentTreeNode[];
  getNepicDir(): string;
  getWatcherEvents(): WatcherEvent[];
  getNepics(): NepicInfo[];
  getActiveNepicId(): string;
  switchNepic(slug: string): Promise<void>;

  // ── Permission hook methods ──
  setAgentPendingApproval(agentId: string, approval: PendingApproval): void;
  clearPendingApproval(agentId: string): void;
  findAgentByRole(role: string): AgentState | null;
}

const DEBOUNCE_MS = 200;

const ARCHITECT_PROMPT = `You're the architect for this project. Read your role in \`.nap/00-org/40-roles/architect.md\` — every line matters.

Then read the rest of \`.nap/00-org/\` — the promise, workflow, and structure docs. This is how the team works.

Explore the codebase. Understand what's here. Take your time.

If there's no seed napkin, talk to the human. They have an idea. Brainstorm with them using /napkin — stress-test the idea, chase rabbit holes, compress what survives into a mega napkin. That napkin becomes the seed for everything that follows.
`;


export function createModel(fs: FileSystem): NapModel {
  let napkins: NapkinState[] = [];
  let architects: AgentState[] = [];
  let nepicDir = '';
  let nepicList: NepicInfo[] = [];
  const listeners = new Set<() => void>();
  let hasPendingWrite = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchUnsubs: (() => void)[] = [];

  // Ephemeral state kept separate — never wiped by filesystem reloads
  const runningAgents = new Set<string>();
  const doneAgents = new Set<string>();
  const pendingApprovals = new Map<string, PendingApproval>();

  // Watcher events for debug panel
  const watcherEventLog: WatcherEvent[] = [];

  function notify(): void {
    for (const fn of listeners) {
      fn();
    }
  }

  function getNepicSlug(): string {
    const parts = nepicDir.split('/');
    return parts[parts.length - 1] || '';
  }

  function findAgentById(agentId: string): AgentState | null {
    for (const napkin of napkins) {
      const agent = napkin.agents.find(a => a.id === agentId);
      if (agent) return agent;
    }
    return architects.find(a => a.id === agentId) ?? null;
  }

  async function readEntries(
    dir: string,
    options?: { slug?: string; excludeDirs?: string[] },
  ): Promise<Entry[]> {
    const names = await fs.readdir(dir);
    const entries: Entry[] = [];
    const excludeDirs = options?.excludeDirs ?? [];

    for (const name of names) {
      if (name.startsWith('.')) continue;
      if (excludeDirs.includes(name)) continue;

      const absPath = dir + '/' + name;
      if (await fs.isDirectory(absPath)) {
        const children = await readEntries(absPath);
        entries.push({ type: 'dir', name, absPath, children });
      } else {
        const isMain = options?.slug ? name === `${options.slug}.nap.md` : false;
        const entry: FileEntry = { type: 'file', name, absPath };
        if (isMain) entry.isMain = true;
        entries.push(entry);
      }
    }

    return entries;
  }

  async function loadAgents(
    agentsDir: string,
    defaultNepicId: string,
    napkinSlug: string | null,
  ): Promise<AgentState[]> {
    const agentDirs = await fs.readdir(agentsDir);
    const agents: AgentState[] = [];

    for (const name of agentDirs) {
      const agentPath = agentsDir + '/' + name;
      if (!(await fs.isDirectory(agentPath))) continue;

      const markerPath = agentPath + '/.agent.nap.json';
      const marker = (await fs.readJSON(markerPath)) as {
        cc_session_uuid?: string;
        role?: string;
        name?: string;
        created_at?: number;
        exited?: boolean;
        started?: boolean;
        done?: boolean;
        archived?: boolean;
        parent?: string | null;
        parent_id?: string | null;
        napkin?: string;
        nepic?: string;
      } | null;

      const agentEntries = await readEntries(agentPath);
      agents.push({
        id: marker?.cc_session_uuid ?? '',
        name: marker?.name ?? name,
        role: marker?.role ?? '',
        nepicId: marker?.nepic ?? defaultNepicId,
        napkinId: napkinSlug,
        parentName: marker?.parent ?? null,
        parentId: marker?.parent_id ?? null,
        createdAt: marker?.created_at ?? 0,
        started: marker?.started ?? false,
        exited: marker?.exited ?? false,
        running: false,
        done: marker?.done ?? false,
        archived: marker?.archived ?? false,
        pendingApproval: null,
        homePath: agentPath,
        entries: agentEntries,
      });
    }

    return agents.sort((a, b) => a.createdAt - b.createdAt);
  }

  async function loadFromFilesystem(dir: string): Promise<void> {
    nepicDir = dir;
    const defaultNepicId = getNepicSlug();

    // Load napkins from 30-napkins/
    const napkinsDir = dir + '/30-napkins';
    const napkinDirs = await fs.readdir(napkinsDir);
    const loadedNapkins: NapkinState[] = [];

    for (const slug of napkinDirs) {
      const napkinPath = napkinsDir + '/' + slug;
      if (!(await fs.isDirectory(napkinPath))) continue;

      const markerPath = napkinPath + '/.napkin.nap.json';
      const marker = (await fs.readJSON(markerPath)) as { status?: string; nepic?: string } | null;

      const status: NapkinStatus = isValidStatus(marker?.status)
        ? (marker!.status as NapkinStatus)
        : 'backlog';

      const napkinNepicId = marker?.nepic ?? defaultNepicId;

      const agentsDir = napkinPath + '/agents';
      const agents = (await fs.isDirectory(agentsDir))
        ? await loadAgents(agentsDir, napkinNepicId, slug)
        : [];

      // Read napkin-level file entries (exclude agents/ dir and hidden files)
      const napkinEntries = await readEntries(napkinPath, {
        slug,
        excludeDirs: ['agents'],
      });

      // Read raw napkin content from .nap.md
      const napMdPath = napkinPath + '/' + slug + '.nap.md';
      const napkinContent = await fs.readFile(napMdPath) ?? '';

      loadedNapkins.push({
        id: slug,
        slug,
        nepicId: napkinNepicId,
        status,
        path: napkinPath,
        agents,
        entries: napkinEntries,
        napkinContent,
      });
    }

    napkins = loadedNapkins;

    // Load architects from 20-architects/
    const architectsDir = dir + '/20-architects';
    const loadedArchitects: AgentState[] = [];

    if (await fs.isDirectory(architectsDir)) {
      const archDirs = await fs.readdir(architectsDir);
      for (const name of archDirs) {
        const archPath = architectsDir + '/' + name;
        if (!(await fs.isDirectory(archPath))) continue;

        const markerPath = archPath + '/.agent.nap.json';
        const marker = (await fs.readJSON(markerPath)) as {
          cc_session_uuid?: string;
          role?: string;
          name?: string;
          created_at?: number;
          exited?: boolean;
          started?: boolean;
          done?: boolean;
          archived?: boolean;
          parent?: string | null;
          parent_id?: string | null;
          nepic?: string;
        } | null;

        if (marker) {
          const archEntries = await readEntries(archPath);
          loadedArchitects.push({
            id: marker.cc_session_uuid ?? '',
            name: marker.name ?? name,
            role: marker.role ?? 'architect',
            nepicId: marker.nepic ?? defaultNepicId,
            napkinId: null,
            parentName: marker.parent ?? null,
            parentId: marker.parent_id ?? null,
            createdAt: marker.created_at ?? 0,
            started: marker.started ?? false,
            exited: marker.exited ?? false,
            running: false,
            done: marker.done ?? false,
            archived: marker.archived ?? false,
            pendingApproval: null,
            homePath: archPath,
            entries: archEntries,
          });
        }
      }
    }

    architects = loadedArchitects.sort((a, b) => a.createdAt - b.createdAt);

    // Apply ephemeral flags from persistent sets
    for (const agent of getAllAgents()) {
      if (runningAgents.has(agent.id)) agent.running = true;
      if (doneAgents.has(agent.id)) agent.done = true;
      const pa = pendingApprovals.get(agent.id);
      if (pa) agent.pendingApproval = pa;
    }

    // Load nepic list from parent dir
    const nepicsBase = dir.replace(/\/[^/]+$/, '');
    const allNepicDirs = await fs.readdir(nepicsBase);
    const loadedNepics: NepicInfo[] = [];
    for (const d of allNepicDirs) {
      if (d.startsWith('.') || d === 'ui-state.json') continue;
      if (await fs.isDirectory(nepicsBase + '/' + d)) {
        loadedNepics.push({
          id: d,
          slug: d,
          name: d.replace(/^\d+-/, ''),
        });
      }
    }
    nepicList = loadedNepics;

    // Guardian cross-load: if no guardian in active nepic, load from first nepic
    if (nepicList.length > 0 && !architects.some(a => a.role === 'guardian')) {
      const firstNepicId = nepicList[0].id;
      if (firstNepicId !== defaultNepicId) {
        const firstArchDir = nepicsBase + '/' + firstNepicId + '/20-architects';
        if (await fs.isDirectory(firstArchDir)) {
          const firstArchAgents = await loadAgents(firstArchDir, firstNepicId, null);
          const guardian = firstArchAgents.find(a => a.role === 'guardian');
          if (guardian) {
            if (runningAgents.has(guardian.id)) guardian.running = true;
            if (doneAgents.has(guardian.id)) guardian.done = true;
            const pa = pendingApprovals.get(guardian.id);
            if (pa) guardian.pendingApproval = pa;
            architects.push(guardian);
          }
        }
      }
    }

    notify();
  }

  // ── Watch ──

  function handleWatchEvent(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      if (hasPendingWrite) {
        hasPendingWrite = false;
        return;
      }
      await loadFromFilesystem(nepicDir);
    }, DEBOUNCE_MS);
  }

  function startWatching(dir: string): void {
    function watchDir(subdir: string): void {
      const fullDir = dir + '/' + subdir;
      const unsub = fs.watch(fullDir, (event, filename) => {
        watcherEventLog.unshift({
          timestamp: Date.now(),
          event,
          filename,
        });
        if (watcherEventLog.length > 100) watcherEventLog.length = 100;
        handleWatchEvent();
      });
      watchUnsubs.push(unsub);
    }

    watchDir('30-napkins');
    watchDir('20-architects');
  }

  function stopWatching(): void {
    for (const unsub of watchUnsubs) {
      unsub();
    }
    watchUnsubs.length = 0;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // ── Write-back ──

  async function createAgent(
    napkinSlug: string,
    agentData: { name: string; role: string; cc_session_uuid?: string },
  ): Promise<void> {
    const agentHomePath =
      nepicDir + '/30-napkins/' + napkinSlug + '/agents/' + agentData.name;
    const markerPath = agentHomePath + '/.agent.nap.json';

    const markerData = {
      cc_session_uuid: agentData.cc_session_uuid,
      role: agentData.role,
      name: agentData.name,
      created_at: Date.now(),
    };

    hasPendingWrite = true;
    await fs.writeJSON(markerPath, markerData);

    // Update internal state
    const napkin = napkins.find((n) => n.slug === napkinSlug);
    if (napkin) {
      napkin.agents.push({
        id: agentData.cc_session_uuid ?? '',
        name: agentData.name,
        role: agentData.role,
        nepicId: napkin.nepicId,
        napkinId: napkinSlug,
        parentName: null,
        parentId: null,
        createdAt: markerData.created_at,
        started: false,
        exited: false,
        running: false,
        done: false,
        archived: false,
        pendingApproval: null,
        homePath: agentHomePath,
        entries: [],
      });
    }

    notify();
  }

  async function setAgentExited(napkinSlug: string, agentName: string): Promise<void> {
    const markerPath =
      nepicDir + '/30-napkins/' + napkinSlug + '/agents/' + agentName + '/.agent.nap.json';

    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, exited: true };

    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);

    // Update internal state
    const napkin = napkins.find((n) => n.slug === napkinSlug);
    if (napkin) {
      const agent = napkin.agents.find((a) => a.name === agentName);
      if (agent) {
        agent.exited = true;
        agent.running = false;
      }
    }

    notify();
  }

  async function setAgentExitedById(agentId: string): Promise<void> {
    const agent = findAgentById(agentId);
    if (!agent) return;

    // Update ephemeral sets — keep doneAgents (done + exited is valid)
    runningAgents.delete(agentId);
    pendingApprovals.delete(agentId);
    agent.pendingApproval = null;

    // Write to disk FIRST — prevents race where file watcher reload
    // happens before the write and loses both exited and done flags
    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, exited: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);

    // Update in-memory state after disk write
    agent.exited = true;
    agent.running = false;
    notify();
  }

  function setAgentRunning(agentId: string, running: boolean): void {
    if (running) {
      runningAgents.add(agentId);
    } else {
      runningAgents.delete(agentId);
    }
    const agent = findAgentById(agentId);
    if (agent) {
      agent.running = running;
      notify();
    }
  }

  async function setAgentDone(agentId: string): Promise<void> {
    doneAgents.add(agentId);
    const agent = findAgentById(agentId);
    if (!agent) return;

    agent.done = true;
    notify();

    // Persist to disk so done survives app restart
    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, done: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);
  }

  async function setAgentStarted(agentId: string): Promise<void> {
    const agent = findAgentById(agentId);
    if (!agent) return;

    agent.started = true;
    notify();

    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, started: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);
  }

  async function setAgentArchived(agentId: string): Promise<void> {
    const agent = findAgentById(agentId);
    if (!agent) return;

    agent.archived = true;
    agent.running = false;
    runningAgents.delete(agentId);
    notify();

    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, archived: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);
  }

  async function spawnSuccessor(agentId: string, ptySpawner: PtySpawner): Promise<string | null> {
    const agent = findAgentById(agentId);
    if (!agent) return null;

    const newId = crypto.randomUUID();
    const prompt = generateSuccessorPrompt(agent);

    // Spawn fresh Claude with generated prompt as first message
    const command = `claude --verbose --session-id ${newId} '${prompt.replace(/'/g, "'\\''")}'`;
    ptySpawner.spawn({ id: newId, command, cwd: '' });

    ptySpawner.onExit(newId, () => {
      return setAgentExitedById(newId);
    });

    // Update agent in-memory: new UUID, clear archived, mark done+started+running
    const oldId = agent.id;
    agent.id = newId;
    agent.archived = false;
    agent.done = true;
    agent.exited = false;
    agent.started = true;
    agent.running = true;
    runningAgents.delete(oldId);
    doneAgents.delete(oldId);
    runningAgents.add(newId);
    doneAgents.add(newId);

    // Write updated marker to disk
    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = {
      ...existing,
      cc_session_uuid: newId,
      archived: false,
      started: true,
      done: true,
      exited: false,
    };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);

    notify();
    return newId;
  }

  async function setNapkinStatus(slug: string, status: string): Promise<void> {
    const markerPath = nepicDir + '/30-napkins/' + slug + '/.napkin.nap.json';

    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), status };

    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);

    // Update internal state
    const napkin = napkins.find((n) => n.slug === slug);
    if (napkin && isValidStatus(status)) {
      napkin.status = status as NapkinStatus;
    }

    notify();
  }

  async function saveUiState(state: unknown): Promise<void> {
    const uiStatePath = nepicDir + '/ui-state.json';
    hasPendingWrite = true;
    await fs.writeJSON(uiStatePath, state);
  }

  function getAllAgents(): AgentState[] {
    const all: AgentState[] = [];
    for (const napkin of napkins) {
      all.push(...napkin.agents);
    }
    all.push(...architects);
    return all;
  }

  // ── New methods for 0210 ──

  async function createNapkin(
    slug: string,
    status: NapkinStatus = 'backlog',
    _nepicId?: string,
  ): Promise<CreateNapkinResult> {
    const currentNepicId = _nepicId ?? getNepicSlug();
    const napkinPath = nepicDir + '/30-napkins/' + slug;
    const markerPath = napkinPath + '/.napkin.nap.json';

    const markerData = { status, nepic: currentNepicId };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, markerData);

    // Create agents subdir marker so isDirectory works in MemoryFileSystem
    const agentsDirMarker = napkinPath + '/agents/.placeholder';
    await fs.writeJSON(agentsDirMarker, null as unknown as object);

    const newNapkin: NapkinState = {
      id: slug,
      slug,
      nepicId: currentNepicId,
      status,
      path: napkinPath,
      agents: [],
      entries: [],
      napkinContent: '',
    };
    napkins.push(newNapkin);
    notify();

    return { slug, status, dir: napkinPath, nepic: currentNepicId };
  }

  async function createAgentStub(
    napkinSlug: string,
    name: string,
    role: string,
    _nepicId?: string,
  ): Promise<CreateAgentResult> {
    const currentNepicId = _nepicId ?? getNepicSlug();

    // Check uniqueness within napkin
    const napkin = napkins.find((n) => n.slug === napkinSlug);
    if (napkin) {
      const existing = napkin.agents.find((a) => a.name === name);
      if (existing) {
        throw new Error(`agent '${name}' already exists in napkin ${napkinSlug}`);
      }
    } else {
      throw new Error(`napkin '${napkinSlug}' not found`);
    }

    const agentHomePath = nepicDir + '/30-napkins/' + napkinSlug + '/agents/' + name;
    const markerPath = agentHomePath + '/.agent.nap.json';
    const id = crypto.randomUUID();
    const now = Date.now();

    // Get parent info from NAP_SESSION_ID if available
    const markerData = {
      cc_session_uuid: id,
      role,
      name,
      napkin: napkinSlug,
      nepic: currentNepicId,
      parent: null as string | null,
      parent_id: null as string | null,
      created_at: now,
      started: false,
      exited: false,
    };

    hasPendingWrite = true;
    await fs.writeJSON(markerPath, markerData);

    const agentState: AgentState = {
      id,
      name,
      role,
      nepicId: currentNepicId,
      napkinId: napkinSlug,
      parentName: null,
      parentId: null,
      createdAt: now,
      started: false,
      exited: false,
      running: false,
      done: false,
      archived: false,
      pendingApproval: null,
      homePath: agentHomePath,
      entries: [],
    };
    napkin.agents.push(agentState);
    notify();

    return { id, name, role, dir: agentHomePath, napkin: napkinSlug, nepic: currentNepicId };
  }

  async function createArchitectStub(
    name: string,
    _nepicId?: string,
  ): Promise<CreateArchitectResult> {
    const currentNepicId = _nepicId ?? getNepicSlug();
    const archPath = nepicDir + '/20-architects/' + name;
    const markerPath = archPath + '/.agent.nap.json';
    const id = crypto.randomUUID();
    const now = Date.now();

    const markerData = {
      cc_session_uuid: id,
      role: 'architect',
      name,
      nepic: currentNepicId,
      parent: null,
      parent_id: null,
      created_at: now,
      started: false,
      exited: false,
    };

    hasPendingWrite = true;
    await fs.writeJSON(markerPath, markerData);

    const agentState: AgentState = {
      id,
      name,
      role: 'architect',
      nepicId: currentNepicId,
      napkinId: null,
      parentName: null,
      parentId: null,
      createdAt: now,
      started: false,
      exited: false,
      running: false,
      done: false,
      archived: false,
      pendingApproval: null,
      homePath: archPath,
      entries: [],
    };
    architects.push(agentState);
    notify();

    return { id, name, role: 'architect', dir: archPath, nepic: currentNepicId };
  }

  async function createNepicFn(
    slug: string,
    displayName: string,
  ): Promise<CreateNepicResult> {
    // nepicDir points to current nepic, go up to nepics/ base
    const nepicsBase = nepicDir.replace(/\/[^/]+$/, '');
    const newNepicDir = nepicsBase + '/' + slug;

    // Scaffold directory structure using placeholder files
    await fs.writeJSON(newNepicDir + '/10-docs/.placeholder', null as unknown as object);
    await fs.writeJSON(newNepicDir + '/30-napkins/.placeholder', null as unknown as object);

    // Create architect stub
    const archName = '001-architect';
    const archPath = newNepicDir + '/20-architects/' + archName;
    const archId = crypto.randomUUID();
    const now = Date.now();

    const archMarker = {
      cc_session_uuid: archId,
      role: 'architect',
      name: archName,
      nepic: slug,
      parent: null,
      parent_id: null,
      created_at: now,
      started: false,
      exited: false,
    };

    hasPendingWrite = true;
    await fs.writeJSON(archPath + '/.agent.nap.json', archMarker);
    await fs.writeFile(archPath + '/prompt.md', ARCHITECT_PROMPT);
    notify();

    return {
      slug,
      name: displayName,
      dir: newNepicDir,
      architectId: archId,
      architectDir: archPath,
    };
  }

  async function startAgentByName(
    name: string,
    prompt: string | null,
    ptySpawner: PtySpawner,
    _nepicId?: string,
  ): Promise<StartAgentResult> {
    const allAgents = getAllAgents();
    const result = resolveByName(allAgents, name);

    if (!result.ok) {
      throw new Error(result.error);
    }

    const agent = result.agent;

    if (agent.running) {
      throw new Error(`agent '${name}' is already running`);
    }

    // Build command
    let command = `claude --verbose --session-id ${agent.id}`;
    if (prompt) {
      command += ` '${prompt.replace(/'/g, "'\\''")}'`;
    }

    ptySpawner.spawn({
      id: agent.id,
      command,
      cwd: '',
    });

    ptySpawner.onExit(agent.id, () => {
      return setAgentExitedById(agent.id);
    });

    agent.started = true;
    agent.running = true;
    runningAgents.add(agent.id);

    // Write started=true to marker
    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, started: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);

    notify();

    return { id: agent.id, name: agent.name, pid: null };
  }

  function getStatus(query: { napkin?: string; agent?: string; nepic?: string }): StatusResult {
    if (query.napkin) {
      const napkin = napkins.find((n) => n.slug === query.napkin);
      if (!napkin) {
        return {};
      }
      return {
        phase: napkin.status,
        agentCount: napkin.agents.length,
        agents: napkin.agents.map((a) => ({
          name: a.name,
          role: a.role,
          running: a.running,
          done: a.done,
          exited: a.exited,
        })),
      };
    }

    if (query.agent) {
      const allAgents = getAllAgents();
      const agent = allAgents.find((a) => a.name === query.agent);
      if (!agent) {
        return {};
      }
      return {
        running: agent.running,
        done: agent.done,
        exited: agent.exited,
        started: agent.started,
        archived: agent.archived,
        role: agent.role,
        napkin: agent.napkinId,
        sessionId: agent.id,
      };
    }

    // Overview — no query
    const byPhase: Record<string, number> = {};
    for (const n of napkins) {
      byPhase[n.status] = (byPhase[n.status] || 0) + 1;
    }
    const running = getAllAgents().filter((a) => a.running).length;

    return {
      napkinsByPhase: byPhase,
      runningAgentsCount: running,
    };
  }

  function getAllAgentsTree(): AgentTreeNode[] {
    const allAgents = getAllAgents();

    function agentStatus(a: AgentState): string {
      if (a.archived) return 'archived';
      if (a.exited) return 'exited';
      if (a.pendingApproval) return 'pending';
      if (a.done) return 'done';
      if (a.running) return 'running';
      if (a.started) return 'started';
      return 'created';
    }

    // Build tree by parentId
    const byParent = new Map<string | null, AgentState[]>();
    for (const a of allAgents) {
      const key = a.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(a);
    }

    function buildNode(agent: AgentState): AgentTreeNode {
      const children = (byParent.get(agent.id) || []).map(buildNode);
      return {
        name: agent.name,
        status: agentStatus(agent),
        napkin: agent.napkinId,
        role: agent.role,
        id: agent.id,
        children,
      };
    }

    // Root nodes: agents with no parent or parent not in the set
    const allIds = new Set(allAgents.map((a) => a.id));
    const roots = allAgents.filter(
      (a) => a.parentId === null || !allIds.has(a.parentId),
    );

    return roots.map(buildNode);
  }

  async function switchNepicFn(slug: string): Promise<void> {
    const base = nepicDir.replace(/\/[^/]+$/, '');
    const newDir = base + '/' + slug;
    if (!(await fs.isDirectory(newDir))) {
      throw new Error(`cannot switch to '${slug}': not a directory`);
    }
    stopWatching();
    // Reset write guard — stale flag from previous nepic must not
    // suppress watcher reloads in the new nepic
    hasPendingWrite = false;
    await loadFromFilesystem(newDir);
    startWatching(newDir);
    // Persist activeNepicId (outside watched dirs — no guard needed)
    await fs.writeJSON(base + '/ui-state.json', { activeNepicId: slug });
  }

  // ── Permission hook methods ──

  function setAgentPendingApproval(agentId: string, approval: PendingApproval): void {
    pendingApprovals.set(agentId, approval);
    const agent = findAgentById(agentId);
    if (agent) {
      agent.pendingApproval = approval;
      notify();
    }
  }

  function clearPendingApproval(agentId: string): void {
    pendingApprovals.delete(agentId);
    const agent = findAgentById(agentId);
    if (agent) {
      agent.pendingApproval = null;
      notify();
    }
  }

  function findAgentByRole(role: string): AgentState | null {
    // Search architects first (guardian lives at architect level)
    const arch = architects.find(a => a.role === role);
    if (arch) return arch;
    // Then napkin agents
    for (const napkin of napkins) {
      const agent = napkin.agents.find(a => a.role === role);
      if (agent) return agent;
    }
    return null;
  }

  return {
    loadFromFilesystem,
    getNapkins: () => napkins,
    getArchitects: () => architects,
    getAllAgents,
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startWatching,
    stopWatching,
    createAgent,
    setAgentExited,
    setAgentExitedById,
    setAgentRunning,
    setAgentDone,
    setAgentStarted,
    setAgentArchived,
    spawnSuccessor,
    setNapkinStatus,
    saveUiState,
    createNapkin,
    createAgentStub,
    createArchitectStub,
    createNepic: createNepicFn,
    startAgentByName,
    getStatus,
    getAllAgentsTree,
    getNepicDir: () => nepicDir,
    getWatcherEvents: () => watcherEventLog,
    getNepics: () => nepicList,
    getActiveNepicId: () => getNepicSlug(),
    switchNepic: switchNepicFn,
    setAgentPendingApproval,
    clearPendingApproval,
    findAgentByRole,
  };
}

export function generateSuccessorPrompt(agent: AgentState): string {
  const rolePath = `.nap/00-org/40-roles/${agent.role}.md`;
  const promptPath = agent.homePath + '/prompt.md';
  const responsePath = agent.homePath + '/response.md';

  // Find napkin .nap.md path from napkinId
  let napkinContext = '';
  if (agent.napkinId) {
    // Derive napkin dir from agent homePath: .../30-napkins/<slug>/agents/<name> → .../30-napkins/<slug>/<slug>.nap.md
    const napkinDir = agent.homePath.replace(/\/agents\/[^/]+$/, '');
    const napMdPath = napkinDir + '/' + agent.napkinId + '.nap.md';
    napkinContext = `\nRead the napkin for context on the feature vision: ${napMdPath}`;
  }

  return `You are taking over this work as a successor maintainer.

Read your role: ${rolePath}

Read ${promptPath} — this is what was originally asked of the previous agent.

Read ${responsePath} — this is what the previous agent delivered.
${napkinContext}
Explore the code in and around ${agent.homePath} — understand what was built.

You have full context. The human may ask you questions about the work, ask you to fix bugs, or continue the task. Introduce yourself briefly, then wait for instructions.`;
}

function isValidStatus(s: unknown): s is NapkinStatus {
  return s === 'backlog' || s === 'todo' || s === 'doing' || s === 'review' || s === 'done' || s === 'archived';
}
