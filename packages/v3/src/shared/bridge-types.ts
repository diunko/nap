// ── State types shared between main and renderer ──

export type NapkinStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

export interface AgentState {
  name: string;
  role: string;
  ccSessionUuid?: string;
  exited?: boolean;
  createdAt: number;
}

export interface NapkinState {
  slug: string;
  status: NapkinStatus;
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
