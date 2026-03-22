import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const VALID_STATUSES = ['backlog', 'todo', 'doing', 'review', 'done'] as const;
type NapkinStatus = (typeof VALID_STATUSES)[number];

const STATUS_TO_DIR: Record<NapkinStatus, string> = {
  backlog: '20-backlog',
  todo: '30-todo',
  doing: '40-doing',
  review: '50-review',
  done: '60-done',
};

export function statusToDir(status: string): string {
  if (!VALID_STATUSES.includes(status as NapkinStatus)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return STATUS_TO_DIR[status as NapkinStatus];
}

let db: Database.Database | null = null;
let cwd = '';

export function initNapkinStore(database: Database.Database, projectCwd: string): void {
  db = database;
  cwd = projectCwd;
}

export function closeNapkinStore(): void {
  db = null;
}

function ensureDb(): Database.Database {
  if (!db) throw new Error('Napkin store not initialized — call initNapkinStore() first');
  return db;
}

function findNapkinDir(slug: string): { nepicDir: string; napkinDir: string } | null {
  const nepicsBase = path.join(cwd, '.nap', 'nepics');
  if (!fs.existsSync(nepicsBase)) return null;

  for (const nepicSlug of fs.readdirSync(nepicsBase)) {
    const napkinDir = path.join(nepicsBase, nepicSlug, '30-napkins', slug);
    try {
      if (fs.statSync(napkinDir).isDirectory()) {
        return { nepicDir: path.join(nepicsBase, nepicSlug), napkinDir };
      }
    } catch {
      // not found in this nepic, continue
    }
  }
  return null;
}

function ensureNepic(nepicSlug: string): string {
  const d = ensureDb();
  const row = d.prepare('SELECT id FROM nepics WHERE slug = ?').get(nepicSlug) as
    | { id: string }
    | undefined;
  if (row) return row.id;

  const id = nepicSlug;
  d.prepare('INSERT INTO nepics (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    nepicSlug,
    nepicSlug,
    Date.now(),
  );
  return id;
}

export function getAllNapkinStatuses(): { slug: string; status: string }[] {
  const d = ensureDb();
  return d.prepare('SELECT slug, status FROM napkins').all() as { slug: string; status: string }[];
}

export function changeNapkinStatus(slug: string, newStatus: string): void {
  if (!VALID_STATUSES.includes(newStatus as NapkinStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const found = findNapkinDir(slug);
  if (!found) {
    throw new Error(`Napkin not found: ${slug}`);
  }

  const d = ensureDb();
  const nepicSlug = path.basename(found.nepicDir);

  // Upsert napkin row in SQLite
  const existing = d.prepare('SELECT id FROM napkins WHERE slug = ?').get(slug) as
    | { id: string }
    | undefined;
  if (existing) {
    d.prepare('UPDATE napkins SET status = ? WHERE slug = ?').run(newStatus, slug);
  } else {
    const nepicId = ensureNepic(nepicSlug);
    d.prepare(
      'INSERT INTO napkins (id, nepic_id, slug, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(slug, nepicId, slug, newStatus, Date.now());
  }

  // Move board symlink — SQLite is authoritative, so log warning on failure
  try {
    const boardBase = path.join(found.nepicDir, '40-board');

    // Remove old symlink from any status dir
    if (fs.existsSync(boardBase)) {
      for (const dirName of fs.readdirSync(boardBase)) {
        const symlinkPath = path.join(boardBase, dirName, slug);
        try {
          fs.lstatSync(symlinkPath);
          fs.unlinkSync(symlinkPath);
        } catch {
          // no symlink here
        }
      }
    }

    // Create new symlink
    const newDir = path.join(boardBase, statusToDir(newStatus));
    fs.mkdirSync(newDir, { recursive: true });
    fs.symlinkSync(`../../30-napkins/${slug}`, path.join(newDir, slug));
  } catch (err) {
    console.warn(`[napkin-store] symlink update failed for ${slug}:`, err);
  }
}
