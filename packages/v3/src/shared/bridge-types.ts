// ── State types shared between main and renderer ──

export type NapkinStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'archived';

// ── File tree entry types for focused/extended views ──

export interface FileEntry {
  type: 'file';
  name: string;
  absPath: string;
  isMain?: boolean;  // true for <slug>.nap.md
}

export interface DirEntry {
  type: 'dir';
  name: string;
  absPath: string;
  children: (FileEntry | DirEntry)[];
}

export type Entry = FileEntry | DirEntry;

export interface WatcherEvent {
  timestamp: number;
  event: string;
  filename: string;
}

export interface NepicInfo {
  id: string;
  slug: string;
  name: string;
}

// ── Permission types ──

export interface PendingApproval {
  tool: string;
  command: string;
  timestamp: number;
  payload: object;  // full hook stdin JSON
}

// ── Core state types ──

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
  archived: boolean;       // imported or dead session — needs successor
  pendingApproval: PendingApproval | null;  // ephemeral — permission request waiting
  homePath: string;
  entries: Entry[];        // home dir files for focused/extended views
}

export interface NapkinState {
  id: string;              // = slug
  slug: string;
  nepicId: string;
  status: NapkinStatus;
  path: string;
  agents: AgentState[];
  entries: Entry[];        // napkin dir files for focused/extended views
  napkinContent: string;   // raw .nap.md text
}

// ── Bridge protocol ──

export interface AppSnapshot {
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  nepics: NepicInfo[];
  watcherEvents?: WatcherEvent[];
}

export type AppIntent =
  | { type: 'setActiveTerminal'; id: string };
