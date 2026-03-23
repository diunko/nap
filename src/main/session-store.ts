import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

export interface Session {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'done';
  command?: string;
  cwd: string;
  parentId: string | null;
  createdAt: number;
  doneMessage?: string;
  ccSessionUuid?: string;
  role?: string;
  nepicId?: string;
  napkinSlug?: string;
  exitedAt?: number;
}

let db: Database.Database | null = null;
let agentCounter = 0;

export function initSessionStore(database: Database.Database): void {
  db = database;
}

export function closeSessionStore(): void {
  db = null;
}

function ensureDb(): Database.Database {
  if (!db) throw new Error('Session store not initialized — call initSessionStore() first');
  return db;
}

interface SessionRow {
  id: string;
  name: string;
  status: string;
  command: string | null;
  cwd: string;
  parent_id: string | null;
  created_at: number;
  done_message: string | null;
  cc_session_uuid: string | null;
  role: string | null;
  nepic_id: string | null;
  napkin_slug: string | null;
  exited_at: number | null;
}

function rowToSession(row: SessionRow): Session {
  const session: Session = {
    id: row.id,
    name: row.name,
    status: row.status as Session['status'],
    cwd: row.cwd,
    parentId: row.parent_id ?? null,
    createdAt: row.created_at,
  };
  if (row.command != null) session.command = row.command;
  if (row.done_message != null) session.doneMessage = row.done_message;
  if (row.cc_session_uuid != null) session.ccSessionUuid = row.cc_session_uuid;
  if (row.role != null) session.role = row.role;
  if (row.nepic_id != null) session.nepicId = row.nepic_id;
  if (row.napkin_slug != null) session.napkinSlug = row.napkin_slug;
  if (row.exited_at != null) session.exitedAt = row.exited_at;
  return session;
}

export function createSession(opts: {
  id?: string;
  command?: string;
  name?: string;
  cwd: string;
  parentId?: string | null;
  role?: string;
  nepicId?: string;
  napkinSlug?: string;
}): Session {
  const d = ensureDb();
  const id = opts.id || randomUUID();
  const name = opts.name || `agent-${++agentCounter}`;
  const ccSessionUuid = randomUUID();
  const createdAt = Date.now();

  d.prepare(`
    INSERT INTO sessions (id, name, status, command, cwd, parent_id, created_at, cc_session_uuid, role, nepic_id, napkin_slug)
    VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    opts.command ?? null,
    opts.cwd,
    opts.parentId ?? null,
    createdAt,
    ccSessionUuid,
    opts.role ?? null,
    opts.nepicId ?? null,
    opts.napkinSlug ?? null,
  );

  const session: Session = {
    id,
    name,
    status: 'running',
    cwd: opts.cwd,
    parentId: opts.parentId ?? null,
    createdAt,
    ccSessionUuid,
  };
  if (opts.command != null) session.command = opts.command;
  if (opts.role != null) session.role = opts.role;
  if (opts.nepicId != null) session.nepicId = opts.nepicId;
  if (opts.napkinSlug != null) session.napkinSlug = opts.napkinSlug;
  return session;
}

export function getSession(id: string): Session | undefined {
  const d = ensureDb();
  const row = d.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function getAllSessions(): Session[] {
  const d = ensureDb();
  const rows = d.prepare('SELECT * FROM sessions ORDER BY created_at').all() as SessionRow[];
  return rows.map(rowToSession);
}

export function setSessionStatus(id: string, status: Session['status']): void {
  const d = ensureDb();
  if (status === 'exited') {
    d.prepare('UPDATE sessions SET status = ?, exited_at = ? WHERE id = ?').run(status, Date.now(), id);
  } else {
    d.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id);
  }
}

export function setSessionDone(id: string, message: string): void {
  const d = ensureDb();
  d.prepare("UPDATE sessions SET status = 'done', done_message = ? WHERE id = ? AND status != 'done'").run(message, id);
}

export function removeSession(id: string): void {
  const d = ensureDb();
  d.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getArchitectForNepic(nepicId: string): Session | undefined {
  const d = ensureDb();
  const row = d.prepare(
    "SELECT * FROM sessions WHERE role = 'architect' AND nepic_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
  ).get(nepicId) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

// ── Nepic operations ──

export function createNepicRow(opts: { id: string; name: string; slug: string }): void {
  const d = ensureDb();
  d.prepare('UPDATE nepics SET is_active = 0 WHERE is_active = 1').run();
  d.prepare(
    'INSERT INTO nepics (id, name, slug, created_at, is_active) VALUES (?, ?, ?, ?, 1)',
  ).run(opts.id, opts.name, opts.slug, Date.now());
}

export function setNepicActive(id: string): void {
  const d = ensureDb();
  d.prepare('UPDATE nepics SET is_active = 0 WHERE is_active = 1').run();
  d.prepare('UPDATE nepics SET is_active = 1 WHERE id = ?').run(id);
}

export function getNepicById(id: string): { id: string; name: string; slug: string } | undefined {
  const d = ensureDb();
  const row = d.prepare('SELECT id, name, slug FROM nepics WHERE id = ?').get(id) as
    | { id: string; name: string; slug: string }
    | undefined;
  return row ?? undefined;
}

export function getAllNepics(): { id: string; name: string; slug: string; isActive: boolean }[] {
  const d = ensureDb();
  const rows = d.prepare('SELECT id, name, slug, is_active FROM nepics ORDER BY slug').all() as {
    id: string;
    name: string;
    slug: string;
    is_active: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isActive: !!r.is_active,
  }));
}

// ── UI State persistence ──

export interface UiState {
  activeNepicId: string | null;
  activeTerminalId: string | null;
  sidebarVisible: boolean;
}

export function saveUiState(state: UiState): void {
  const d = ensureDb();
  d.prepare(`
    INSERT OR REPLACE INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible)
    VALUES (1, ?, ?, ?)
  `).run(state.activeNepicId, state.activeTerminalId, state.sidebarVisible ? 1 : 0);
}

export function loadUiState(): UiState | null {
  const d = ensureDb();
  const row = d.prepare('SELECT * FROM ui_state WHERE id = 1').get() as
    | { active_nepic_id: string | null; active_terminal_id: string | null; sidebar_visible: number }
    | undefined;
  if (!row) return null;

  // Validate active_terminal_id — fall back if session no longer exists
  let activeTerminalId = row.active_terminal_id;
  if (activeTerminalId) {
    const session = d.prepare('SELECT id FROM sessions WHERE id = ?').get(activeTerminalId);
    if (!session) activeTerminalId = null;
  }

  return {
    activeNepicId: row.active_nepic_id,
    activeTerminalId,
    sidebarVisible: !!row.sidebar_visible,
  };
}
