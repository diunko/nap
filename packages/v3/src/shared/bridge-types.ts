// ── State types shared between main and renderer ──

export type NapkinStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

export interface AgentState {
  id: string;              // cc_session_uuid — THE identity
  name: string;
  role: string;
  nepicId: string;
  napkinId: string | null; // null for architects
  parentName: string | null;
  parentId: string | null;
  createdAt: number;
  started: boolean;
  exited: boolean;
  running: boolean;        // ephemeral — pty currently alive
  done: boolean;           // ephemeral — called nap done
  homePath: string;
}

export interface NapkinState {
  id: string;              // = slug
  slug: string;
  nepicId: string;
  status: NapkinStatus;
  path: string;
  agents: AgentState[];
}

// ── Bridge protocol ──

export interface AppSnapshot {
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
}

export type AppIntent =
  | { type: 'setActiveTerminal'; id: string };
