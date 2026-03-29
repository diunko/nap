import type { FileSystem } from './filesystem';
import type { NapkinState, AgentState, NapkinStatus } from '../shared/bridge-types';

// ── NapModel — owns the app's business state (v2: async + write-back + watching) ──

export interface NapModel {
  loadFromFilesystem(nepicDir: string): Promise<void>;
  getNapkins(): NapkinState[];
  getArchitects(): AgentState[];
  onChange(listener: () => void): () => void;
  startWatching(nepicDir: string): void;
  stopWatching(): void;
  createAgent(napkinSlug: string, agentData: { name: string; role: string; cc_session_uuid?: string }): Promise<void>;
  setAgentExited(napkinSlug: string, agentName: string): Promise<void>;
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

  async function loadAgents(agentsDir: string): Promise<AgentState[]> {
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
      } | null;

      agents.push({
        name: marker?.name ?? name,
        role: marker?.role ?? '',
        ccSessionUuid: marker?.cc_session_uuid,
        exited: marker?.exited,
        createdAt: marker?.created_at ?? 0,
      });
    }

    return agents.sort((a, b) => a.createdAt - b.createdAt);
  }

  async function loadFromFilesystem(dir: string): Promise<void> {
    nepicDir = dir;

    // Load napkins from 30-napkins/
    const napkinsDir = dir + '/30-napkins';
    const napkinDirs = await fs.readdir(napkinsDir);
    const loadedNapkins: NapkinState[] = [];

    for (const slug of napkinDirs) {
      const napkinPath = napkinsDir + '/' + slug;
      if (!(await fs.isDirectory(napkinPath))) continue;

      const markerPath = napkinPath + '/.napkin.nap.json';
      const marker = (await fs.readJSON(markerPath)) as { status?: string } | null;

      const status: NapkinStatus = isValidStatus(marker?.status)
        ? (marker!.status as NapkinStatus)
        : 'backlog';

      const agentsDir = napkinPath + '/agents';
      const agents = (await fs.isDirectory(agentsDir)) ? await loadAgents(agentsDir) : [];

      loadedNapkins.push({ slug, status, agents });
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
        } | null;

        if (marker) {
          loadedArchitects.push({
            name: marker.name ?? name,
            role: marker.role ?? 'architect',
            ccSessionUuid: marker.cc_session_uuid,
            exited: marker.exited,
            createdAt: marker.created_at ?? 0,
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
    const markerPath =
      nepicDir + '/30-napkins/' + napkinSlug + '/agents/' + agentData.name + '/.agent.nap.json';

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
        name: agentData.name,
        role: agentData.role,
        ccSessionUuid: agentData.cc_session_uuid,
        createdAt: markerData.created_at,
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
      if (agent) agent.exited = true;
    }

    notify();
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

  return {
    loadFromFilesystem,
    getNapkins: () => napkins,
    getArchitects: () => architects,
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
    setNapkinStatus,
    saveUiState,
  };
}

function isValidStatus(s: unknown): s is NapkinStatus {
  return s === 'backlog' || s === 'todo' || s === 'doing' || s === 'review' || s === 'done';
}
