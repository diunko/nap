import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS nepics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS napkins (
  id TEXT PRIMARY KEY,
  nepic_id TEXT NOT NULL REFERENCES nepics(id),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backlog',
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  nepic_id TEXT REFERENCES nepics(id),
  napkin_slug TEXT,
  name TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  cc_session_uuid TEXT,
  parent_id TEXT REFERENCES sessions(id),
  command TEXT,
  cwd TEXT,
  done_message TEXT,
  created_at INTEGER NOT NULL,
  exited_at INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ui_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_nepic_id TEXT,
  active_terminal_id TEXT,
  sidebar_visible INTEGER NOT NULL DEFAULT 1
);
`;

export function getDbPath(projectCwd: string): string {
  return path.join(projectCwd, '.nap', 'nap.db');
}

export function initDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
