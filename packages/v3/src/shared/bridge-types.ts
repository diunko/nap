// ── State types shared between main and renderer ──

export type NapkinStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

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
}

// ── Bridge protocol ──

export interface AppSnapshot {
  napkins: NapkinState[];
  architects: AgentState[];
  activeNepicId: string;
  watcherEvents?: WatcherEvent[];
}

export type AppIntent =
  | { type: 'setActiveTerminal'; id: string };
