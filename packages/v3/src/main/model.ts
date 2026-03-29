import type { FileSystem } from './filesystem';
import type { NapkinState, AgentState, NapkinStatus } from '../shared/bridge-types';

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
  setNapkinStatus(slug: string, status: string): Promise<void>;
  saveUiState(state: unknown): Promise<void>;
}

const DEBOUNCE_MS = 200;

export function createModel(fs: FileSystem): NapModel {
  let napkins: NapkinState[] = [];
  let architects: AgentState[] = [];
  let nepicDir = '';
  const listeners = new Set<() => void>();
  let hasPendingWrite = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchUnsubs: (() => void)[] = [];

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
        parent?: string | null;
        parent_id?: string | null;
        napkin?: string;
        nepic?: string;
      } | null;

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
        done: false,
        homePath: agentPath,
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

      loadedNapkins.push({
        id: slug,
        slug,
        nepicId: napkinNepicId,
        status,
        path: napkinPath,
        agents,
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
          parent?: string | null;
          parent_id?: string | null;
          nepic?: string;
        } | null;

        if (marker) {
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
            done: false,
            homePath: archPath,
          });
        }
      }
    }

    architects = loadedArchitects.sort((a, b) => a.createdAt - b.createdAt);

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
    const napkinsDir = dir + '/30-napkins';
    const unsub = fs.watch(napkinsDir, () => {
      handleWatchEvent();
    });
    watchUnsubs.push(unsub);
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
        homePath: agentHomePath,
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

    // Update in-memory state first (sync)
    agent.exited = true;
    agent.running = false;
    notify();

    // Then write to disk (async)
    const markerPath = agent.homePath + '/.agent.nap.json';
    const existing = (await fs.readJSON(markerPath)) as Record<string, unknown> | null;
    const updated = { ...existing, exited: true };
    hasPendingWrite = true;
    await fs.writeJSON(markerPath, updated);
  }

  function setAgentRunning(agentId: string, running: boolean): void {
    const agent = findAgentById(agentId);
    if (agent) {
      agent.running = running;
      notify();
    }
  }

  function setAgentDone(agentId: string): void {
    const agent = findAgentById(agentId);
    if (agent) {
      agent.done = true;
      notify();
    }
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
    setNapkinStatus,
    saveUiState,
  };
}

function isValidStatus(s: unknown): s is NapkinStatus {
  return s === 'backlog' || s === 'todo' || s === 'doing' || s === 'review' || s === 'done';
}
