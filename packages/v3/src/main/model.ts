import type { FileSystemReader } from './filesystem';
import type { NapkinState, AgentState, NapkinStatus } from '../shared/bridge-types';

// ── NapModel — owns the app's business state ──

export interface NapModel {
  loadFromFilesystem(nepicDir: string): void;
  getNapkins(): NapkinState[];
  getArchitects(): AgentState[];
  onChange(listener: () => void): () => void;
}

export function createModel(fs: FileSystemReader): NapModel {
  let napkins: NapkinState[] = [];
  let architects: AgentState[] = [];
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) {
      fn();
    }
  }

  function loadAgents(agentsDir: string): AgentState[] {
    const agentDirs = fs.readdir(agentsDir);
    const agents: AgentState[] = [];

    for (const name of agentDirs) {
      const agentPath = agentsDir + '/' + name;
      if (!fs.isDirectory(agentPath)) continue;

      const markerPath = agentPath + '/.agent.nap.json';
      const marker = fs.readJSON(markerPath) as {
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

  function loadFromFilesystem(nepicDir: string): void {
    // Load napkins from 30-napkins/
    const napkinsDir = nepicDir + '/30-napkins';
    const napkinDirs = fs.readdir(napkinsDir);
    const loadedNapkins: NapkinState[] = [];

    for (const slug of napkinDirs) {
      const napkinPath = napkinsDir + '/' + slug;
      if (!fs.isDirectory(napkinPath)) continue;

      const markerPath = napkinPath + '/.napkin.nap.json';
      const marker = fs.readJSON(markerPath) as { status?: string } | null;

      const status: NapkinStatus = isValidStatus(marker?.status)
        ? marker!.status as NapkinStatus
        : 'backlog';

      // Load agents from agents/ subdir
      const agentsDir = napkinPath + '/agents';
      const agents = fs.isDirectory(agentsDir) ? loadAgents(agentsDir) : [];

      loadedNapkins.push({ slug, status, agents });
    }

    napkins = loadedNapkins;

    // Load architects from 20-architects/
    const architectsDir = nepicDir + '/20-architects';
    const loadedArchitects: AgentState[] = [];

    if (fs.isDirectory(architectsDir)) {
      const archDirs = fs.readdir(architectsDir);
      for (const name of archDirs) {
        const archPath = architectsDir + '/' + name;
        if (!fs.isDirectory(archPath)) continue;

        const markerPath = archPath + '/.agent.nap.json';
        const marker = fs.readJSON(markerPath) as {
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

  return {
    loadFromFilesystem,
    getNapkins: () => napkins,
    getArchitects: () => architects,
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

function isValidStatus(s: unknown): s is NapkinStatus {
  return s === 'backlog' || s === 'todo' || s === 'doing' || s === 'review' || s === 'done';
}
