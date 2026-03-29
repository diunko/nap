import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';

interface NapkinRow {
  id: string;
  slug: string;
  hidden: number;
}

interface SessionRow {
  id: string;
  napkin_slug: string;
  name: string;
  hidden: number;
}

export function reconcile(nepicDir: string, db: Database.Database): void {
  const nepicSlug = path.basename(nepicDir);
  const napkinsPath = path.join(nepicDir, '30-napkins');

  // Ensure nepic row exists
  const nepicRow = db.prepare('SELECT id FROM nepics WHERE slug = ?').get(nepicSlug) as
    | { id: string }
    | undefined;
  let nepicId: string;
  if (nepicRow) {
    nepicId = nepicRow.id;
  } else {
    nepicId = nepicSlug;
    db.prepare('INSERT INTO nepics (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
      nepicId,
      nepicSlug,
      nepicSlug,
      Date.now(),
    );
  }

  // Walk filesystem: napkin dirs
  let fsNapkinSlugs: string[] = [];
  try {
    fsNapkinSlugs = fs.readdirSync(napkinsPath).filter((d) => {
      try {
        return fs.statSync(path.join(napkinsPath, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    // 30-napkins/ doesn't exist or can't be read — treat as empty
  }

  const fsNapkinSet = new Set(fsNapkinSlugs);

  // Walk filesystem: agent dirs per napkin
  const fsAgentMap = new Map<string, string[]>();
  for (const slug of fsNapkinSlugs) {
    const agentsPath = path.join(napkinsPath, slug, 'agents');
    const agents: string[] = [];
    try {
      for (const a of fs.readdirSync(agentsPath)) {
        try {
          if (fs.statSync(path.join(agentsPath, a)).isDirectory()) {
            agents.push(a);
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      // no agents/ dir
    }
    fsAgentMap.set(slug, agents);
  }

  // Build set of all fs agent keys: "napkinSlug\0agentName"
  const fsAgentKeys = new Set<string>();
  for (const [napkinSlug, agents] of fsAgentMap) {
    for (const agent of agents) {
      fsAgentKeys.add(`${napkinSlug}\0${agent}`);
    }
  }

  // Query existing napkins for this nepic
  const dbNapkins = db
    .prepare('SELECT id, slug, hidden FROM napkins WHERE nepic_id = ?')
    .all(nepicId) as NapkinRow[];
  const dbNapkinBySlug = new Map(dbNapkins.map((n) => [n.slug, n]));

  // Query existing sessions for this nepic (only napkin-scoped agents)
  const dbSessions = db
    .prepare(
      'SELECT id, napkin_slug, name, hidden FROM sessions WHERE nepic_id = ? AND napkin_slug IS NOT NULL',
    )
    .all(nepicId) as SessionRow[];
  const dbSessionByKey = new Map(
    dbSessions.map((s) => [`${s.napkin_slug}\0${s.name}`, s]),
  );

  // All writes in a single transaction for atomicity + performance
  const txn = db.transaction(() => {
    // Reconcile napkins: new dirs → INSERT, matches → unhide
    for (const slug of fsNapkinSlugs) {
      const existing = dbNapkinBySlug.get(slug);
      if (existing) {
        if (existing.hidden) {
          db.prepare('UPDATE napkins SET hidden = 0 WHERE id = ?').run(existing.id);
        }
      } else {
        db.prepare(
          'INSERT INTO napkins (id, nepic_id, slug, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, 0)',
        ).run(randomUUID(), nepicId, slug, 'backlog', Date.now());
      }
    }

    // Orphaned napkins → mark hidden
    for (const dbNapkin of dbNapkins) {
      if (!fsNapkinSet.has(dbNapkin.slug) && !dbNapkin.hidden) {
        db.prepare('UPDATE napkins SET hidden = 1 WHERE id = ?').run(dbNapkin.id);
      }
    }

    // Reconcile sessions: new agent dirs → INSERT, matches → unhide
    for (const [napkinSlug, agents] of fsAgentMap) {
      for (const agentName of agents) {
        const key = `${napkinSlug}\0${agentName}`;
        const existing = dbSessionByKey.get(key);
        if (existing) {
          if (existing.hidden) {
            db.prepare('UPDATE sessions SET hidden = 0 WHERE id = ?').run(existing.id);
          }
        } else {
          db.prepare(
            'INSERT INTO sessions (id, nepic_id, napkin_slug, name, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)',
          ).run(randomUUID(), nepicId, napkinSlug, agentName, 'new', Date.now());
        }
      }
    }

    // Orphaned sessions → mark hidden
    for (const [key, dbSession] of dbSessionByKey) {
      if (!fsAgentKeys.has(key) && !dbSession.hidden) {
        db.prepare('UPDATE sessions SET hidden = 1 WHERE id = ?').run(dbSession.id);
      }
    }
  });

  txn();
}
