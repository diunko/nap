import { test as base, expect } from '@playwright/test';
import type { ElectronApplication } from 'playwright-core';
import { launchApp, cleanupApp } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create the nepic dir structure and return the nepic dir path */
function createNepicDir(tmpDir: string): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');
  fs.mkdirSync(nepicDir, { recursive: true });
  return nepicDir;
}

/** Create a napkin dir on disk */
function createNapkinDir(
  tmpDir: string,
  slug: string,
  agents?: string[],
): void {
  const napkinDir = path.join(
    tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins', slug,
  );
  fs.mkdirSync(napkinDir, { recursive: true });
  if (agents) {
    for (const agent of agents) {
      fs.mkdirSync(path.join(napkinDir, 'agents', agent), { recursive: true });
    }
  }
}

/** Remove a napkin dir from disk */
function removeNapkinDir(tmpDir: string, slug: string): void {
  const napkinDir = path.join(
    tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins', slug,
  );
  fs.rmSync(napkinDir, { recursive: true, force: true });
}

// =========================================================================
// T-0900-01: happy path — all dirs match SQLite
// =========================================================================
base.describe.serial('T-0900-01: happy path — all dirs match SQLite', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('all existing rows preserved, no new rows, no rows hidden', async () => {
    createNapkinDir(tmpDir, '0101-alpha', ['001-fs-eng', '002-test-arch']);
    createNapkinDir(tmpDir, '0102-beta', ['001-fs-eng', '002-test-arch']);
    createNapkinDir(tmpDir, '0103-gamma', ['001-fs-eng', '002-test-arch']);

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      // Run reconcile to seed the rows
      reconcile(dir, db);

      // Snapshot the state
      const napkinsBefore = db
        .prepare("SELECT * FROM napkins WHERE nepic_id = '02-nepic-spaces'")
        .all() as any[];
      const sessionsBefore = db
        .prepare("SELECT * FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug IS NOT NULL")
        .all() as any[];

      // Run reconcile again — nothing changed on disk
      reconcile(dir, db);

      const napkinsAfter = db
        .prepare("SELECT * FROM napkins WHERE nepic_id = '02-nepic-spaces'")
        .all() as any[];
      const sessionsAfter = db
        .prepare("SELECT * FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug IS NOT NULL")
        .all() as any[];

      return {
        napkinCountBefore: napkinsBefore.length,
        napkinCountAfter: napkinsAfter.length,
        sessionCountBefore: sessionsBefore.length,
        sessionCountAfter: sessionsAfter.length,
        napkinsMatch: JSON.stringify(napkinsBefore) === JSON.stringify(napkinsAfter),
        sessionsMatch: JSON.stringify(sessionsBefore) === JSON.stringify(sessionsAfter),
        anyHidden: napkinsAfter.some((n: any) => n.hidden) || sessionsAfter.some((s: any) => s.hidden),
      };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.napkinCountBefore).toBe(3);
    expect(result.napkinCountAfter).toBe(3);
    expect(result.sessionCountBefore).toBe(6);
    expect(result.sessionCountAfter).toBe(6);
    expect(result.napkinsMatch).toBe(true);
    expect(result.sessionsMatch).toBe(true);
    expect(result.anyHidden).toBe(false);
  });
});

// =========================================================================
// T-0900-02: new napkin dir — no SQLite entry
// =========================================================================
base.describe.serial('T-0900-02: new napkin dir — no SQLite entry', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('new napkin row inserted with status=backlog and correct nepic_id', async () => {
    createNepicDir(tmpDir);
    createNapkinDir(tmpDir, '0999-new-feature');

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      reconcile(dir, db);

      const row = db
        .prepare("SELECT * FROM napkins WHERE slug = '0999-new-feature'")
        .get() as any;

      return {
        exists: !!row,
        status: row?.status,
        nepicId: row?.nepic_id,
        hidden: row?.hidden,
        hasId: typeof row?.id === 'string' && row.id.length > 0,
      };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.exists).toBe(true);
    expect(result.status).toBe('backlog');
    expect(result.nepicId).toBe('02-nepic-spaces');
    expect(result.hidden).toBe(0);
    expect(result.hasId).toBe(true);
  });
});

// =========================================================================
// T-0900-03: new agent dir — no SQLite session
// =========================================================================
base.describe.serial('T-0900-03: new agent dir — no SQLite session', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('new session row created with correct defaults', async () => {
    createNepicDir(tmpDir);
    createNapkinDir(tmpDir, '0301-existing', ['001-test-arch']);

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      reconcile(dir, db);

      const row = db
        .prepare("SELECT * FROM sessions WHERE napkin_slug = '0301-existing' AND name = '001-test-arch'")
        .get() as any;

      return {
        exists: !!row,
        status: row?.status,
        napkinSlug: row?.napkin_slug,
        ccSessionUuid: row?.cc_session_uuid,
        hidden: row?.hidden,
      };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.exists).toBe(true);
    expect(result.status).toBe('new');
    expect(result.napkinSlug).toBe('0301-existing');
    expect(result.ccSessionUuid).toBeNull();
    expect(result.hidden).toBe(0);
  });
});

// =========================================================================
// T-0900-04: orphaned napkin — SQLite row, no dir
// =========================================================================
base.describe.serial('T-0900-04: orphaned napkin — SQLite row, no dir', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('row preserved with hidden=1, original fields intact', async () => {
    createNepicDir(tmpDir);
    // Create 30-napkins dir but NOT the 0888-gone dir
    fs.mkdirSync(
      path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins'),
      { recursive: true },
    );

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      // Ensure nepic row exists
      const nepicSlug = '02-nepic-spaces';
      const existing = db.prepare('SELECT id FROM nepics WHERE slug = ?').get(nepicSlug) as any;
      if (!existing) {
        db.prepare('INSERT INTO nepics (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
          nepicSlug, nepicSlug, nepicSlug, Date.now(),
        );
      }

      // Pre-populate orphan napkin
      db.prepare(
        "INSERT INTO napkins (id, nepic_id, slug, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, 0)",
      ).run('orphan-napkin-id', nepicSlug, '0888-gone', 'doing', 1000000);

      // Run reconcile — 0888-gone dir doesn't exist
      reconcile(dir, db);

      const row = db.prepare("SELECT * FROM napkins WHERE id = 'orphan-napkin-id'").get() as any;

      return {
        exists: !!row,
        hidden: row?.hidden,
        id: row?.id,
        status: row?.status,
        createdAt: row?.created_at,
      };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.exists).toBe(true);
    expect(result.hidden).toBe(1);
    expect(result.id).toBe('orphan-napkin-id');
    expect(result.status).toBe('doing');
    expect(result.createdAt).toBe(1000000);
  });
});

// =========================================================================
// T-0900-05: orphaned session — SQLite row, no agent dir
// =========================================================================
base.describe.serial('T-0900-05: orphaned session — SQLite row, no agent dir', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('session row preserved with hidden=1, UUID and metadata intact', async () => {
    createNepicDir(tmpDir);
    // Create napkin dir but no agent dir for 002-fs-eng
    createNapkinDir(tmpDir, '0200-sqlite');

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      const nepicSlug = '02-nepic-spaces';
      const existing = db.prepare('SELECT id FROM nepics WHERE slug = ?').get(nepicSlug) as any;
      if (!existing) {
        db.prepare('INSERT INTO nepics (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
          nepicSlug, nepicSlug, nepicSlug, Date.now(),
        );
      }

      // Ensure napkin row exists
      const napkinExists = db.prepare("SELECT id FROM napkins WHERE slug = '0200-sqlite' AND nepic_id = ?").get(nepicSlug);
      if (!napkinExists) {
        db.prepare(
          "INSERT INTO napkins (id, nepic_id, slug, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, 0)",
        ).run('napkin-0200', nepicSlug, '0200-sqlite', 'doing', Date.now());
      }

      // Pre-populate orphan session
      db.prepare(
        "INSERT INTO sessions (id, nepic_id, napkin_slug, name, status, cc_session_uuid, created_at, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
      ).run('orphan-session-id', nepicSlug, '0200-sqlite', '002-fs-eng', 'running', 'uuid-abc-123', 2000000);

      reconcile(dir, db);

      const row = db.prepare("SELECT * FROM sessions WHERE id = 'orphan-session-id'").get() as any;

      return {
        exists: !!row,
        hidden: row?.hidden,
        ccSessionUuid: row?.cc_session_uuid,
        status: row?.status,
        createdAt: row?.created_at,
      };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.exists).toBe(true);
    expect(result.hidden).toBe(1);
    expect(result.ccSessionUuid).toBe('uuid-abc-123');
    expect(result.status).toBe('running');
    expect(result.createdAt).toBe(2000000);
  });
});

// =========================================================================
// T-0900-06: branch switch round-trip — orphan then reconnect
// =========================================================================
base.describe.serial('T-0900-06: branch switch round-trip', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('orphan → reconnect restores all metadata, clears hidden', async () => {
    createNepicDir(tmpDir);
    createNapkinDir(tmpDir, '0601-stay', ['001-fs-eng']);
    createNapkinDir(tmpDir, '0602-leave', ['001-fs-eng']);
    createNapkinDir(tmpDir, '0603-leave', ['001-fs-eng']);
    const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb, fs, path } = globalThis.__napTest!;
      const db = getDb();

      // Step 1: initial reconcile — all 3 matched
      reconcile(dir, db);

      const snapshotBefore = db
        .prepare("SELECT * FROM napkins WHERE nepic_id = '02-nepic-spaces' ORDER BY slug")
        .all() as any[];
      const sessionsBefore = db
        .prepare("SELECT * FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug IS NOT NULL ORDER BY napkin_slug, name")
        .all() as any[];

      // Step 2: remove 2 napkin dirs (simulates git checkout other-branch)
      const napkinsPath = path.join(dir, '30-napkins');
      fs.rmSync(path.join(napkinsPath, '0602-leave'), { recursive: true, force: true });
      fs.rmSync(path.join(napkinsPath, '0603-leave'), { recursive: true, force: true });

      // Step 3: reconcile — 2 orphaned, 1 matched
      reconcile(dir, db);

      const afterOrphan = db
        .prepare("SELECT slug, hidden FROM napkins WHERE nepic_id = '02-nepic-spaces' ORDER BY slug")
        .all() as any[];

      // Step 4: restore dirs (simulates git checkout main)
      fs.mkdirSync(path.join(napkinsPath, '0602-leave', 'agents', '001-fs-eng'), { recursive: true });
      fs.mkdirSync(path.join(napkinsPath, '0603-leave', 'agents', '001-fs-eng'), { recursive: true });

      // Step 5: reconcile again — all 3 matched
      reconcile(dir, db);

      const snapshotAfter = db
        .prepare("SELECT * FROM napkins WHERE nepic_id = '02-nepic-spaces' ORDER BY slug")
        .all() as any[];
      const sessionsAfter = db
        .prepare("SELECT * FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug IS NOT NULL ORDER BY napkin_slug, name")
        .all() as any[];

      return {
        afterOrphan,
        napkinIdsBefore: snapshotBefore.map((n: any) => n.id).sort(),
        napkinIdsAfter: snapshotAfter.map((n: any) => n.id).sort(),
        napkinStatusesBefore: snapshotBefore.map((n: any) => n.status).sort(),
        napkinStatusesAfter: snapshotAfter.map((n: any) => n.status).sort(),
        allUnhiddenAfter: snapshotAfter.every((n: any) => n.hidden === 0),
        sessionIdsBefore: sessionsBefore.map((s: any) => s.id).sort(),
        sessionIdsAfter: sessionsAfter.map((s: any) => s.id).sort(),
        sessionCountBefore: sessionsBefore.length,
        sessionCountAfter: sessionsAfter.length,
        allSessionsUnhidden: sessionsAfter.every((s: any) => s.hidden === 0),
      };
    }, nepicDir);

    // After step 3: 2 orphaned
    const orphaned = result.afterOrphan.filter((n: any) => n.hidden === 1);
    expect(orphaned.length).toBe(2);
    expect(result.afterOrphan.find((n: any) => n.slug === '0601-stay')!.hidden).toBe(0);

    // After step 5: all restored — same IDs, same statuses, no hidden
    expect(result.napkinIdsAfter).toEqual(result.napkinIdsBefore);
    expect(result.napkinStatusesAfter).toEqual(result.napkinStatusesBefore);
    expect(result.allUnhiddenAfter).toBe(true);
    expect(result.sessionIdsAfter).toEqual(result.sessionIdsBefore);
    expect(result.sessionCountAfter).toBe(result.sessionCountBefore);
    expect(result.allSessionsUnhidden).toBe(true);
  });
});

// =========================================================================
// T-0900-07: empty 30-napkins/ — no dirs at all
// =========================================================================
base.describe.serial('T-0900-07: empty 30-napkins/ — no dirs at all', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('no crash, pre-existing rows orphaned', async () => {
    const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');
    fs.mkdirSync(path.join(nepicDir, '30-napkins'), { recursive: true });

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      const nepicSlug = '02-nepic-spaces';
      const existing = db.prepare('SELECT id FROM nepics WHERE slug = ?').get(nepicSlug) as any;
      if (!existing) {
        db.prepare('INSERT INTO nepics (id, name, slug, created_at) VALUES (?, ?, ?, ?)').run(
          nepicSlug, nepicSlug, nepicSlug, Date.now(),
        );
      }

      // Pre-populate 2 napkins
      db.prepare(
        "INSERT OR IGNORE INTO napkins (id, nepic_id, slug, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, 0)",
      ).run('empty-07-a', nepicSlug, '0701-aaa', 'backlog', Date.now());
      db.prepare(
        "INSERT OR IGNORE INTO napkins (id, nepic_id, slug, status, created_at, hidden) VALUES (?, ?, ?, ?, ?, 0)",
      ).run('empty-07-b', nepicSlug, '0702-bbb', 'backlog', Date.now());

      let error: string | null = null;
      try {
        reconcile(dir, db);
      } catch (e: any) {
        error = e.message;
      }

      const napkins = db
        .prepare("SELECT * FROM napkins WHERE nepic_id = ? AND id IN ('empty-07-a', 'empty-07-b')")
        .all(nepicSlug) as any[];

      return {
        error,
        count: napkins.length,
        allHidden: napkins.every((n: any) => n.hidden === 1),
      };
    }, nepicDir);

    expect(result.error).toBeNull();
    expect(result.count).toBe(2);
    expect(result.allHidden).toBe(true);
  });
});

// =========================================================================
// T-0900-08: missing 30-napkins/ — dir doesn't exist
// =========================================================================
base.describe.serial('T-0900-08: missing 30-napkins/ — dir doesn\'t exist', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('no crash, graceful ENOENT handling', async () => {
    // Create nepic dir but NOT 30-napkins/
    const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');
    fs.mkdirSync(nepicDir, { recursive: true });

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      let error: string | null = null;
      try {
        reconcile(dir, db);
      } catch (e: any) {
        error = e.message;
      }

      return { error };
    }, nepicDir);

    expect(result.error).toBeNull();
  });
});

// =========================================================================
// T-0900-09: agent dir with no prompt.md
// =========================================================================
base.describe.serial('T-0900-09: agent dir with no prompt.md', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('session row created for empty agent dir', async () => {
    createNepicDir(tmpDir);
    // Create napkin with an empty agent dir (no prompt.md)
    const napkinDir = path.join(
      tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins', '0901-empty-agent',
    );
    fs.mkdirSync(napkinDir, { recursive: true });
    const agentDir = path.join(napkinDir, 'agents', '003-empty');
    fs.mkdirSync(agentDir, { recursive: true });
    // Deliberately NO prompt.md

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      reconcile(dir, db);

      const row = db
        .prepare("SELECT * FROM sessions WHERE napkin_slug = '0901-empty-agent' AND name = '003-empty'")
        .get() as any;

      return { exists: !!row };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.exists).toBe(true);
  });
});

// =========================================================================
// T-0900-10: reconciliation runs before UI renders
// =========================================================================
base.describe.serial('T-0900-10: reconciliation runs before UI renders', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    // Create dirs BEFORE launching the app
    const tmpDirBase = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nap-test-cwd-'));
    const nepicDir = path.join(tmpDirBase, '.nap', 'nepics', '02-nepic-spaces');
    fs.mkdirSync(path.join(nepicDir, '30-napkins', '0910-pre-launch', 'agents', '001-fs-eng'), { recursive: true });
    fs.mkdirSync(path.join(nepicDir, '30-napkins', '0911-pre-launch', 'agents', '001-fs-eng'), { recursive: true });

    // Now launch the app with this tmpDir
    const { _electron: electron } = require('@playwright/test');
    const helpers = require('../helpers');
    app = await electron.launch({
      args: [...helpers.ELECTRON_LAUNCH_ARGS, '--cwd', tmpDirBase],
      env: { ...process.env, NAP_TEST: '1', NAP_SOCKET: helpers.testSocketPath() },
    });
    tmpDir = tmpDirBase;
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('SQLite has rows for pre-existing dirs by first window load', async () => {
    const page = await app.firstWindow();
    // Wait for app to be ready
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );

    // Check SQLite directly — rows should already exist from startup reconciliation
    const result = await app.evaluate(() => {
      const { getDb } = globalThis.__napTest!;
      const db = getDb();

      const napkins = db
        .prepare("SELECT slug FROM napkins WHERE slug IN ('0910-pre-launch', '0911-pre-launch')")
        .all() as any[];

      const sessions = db
        .prepare("SELECT name FROM sessions WHERE napkin_slug IN ('0910-pre-launch', '0911-pre-launch')")
        .all() as any[];

      return {
        napkinSlugs: napkins.map((n: any) => n.slug).sort(),
        sessionCount: sessions.length,
      };
    });

    expect(result.napkinSlugs).toEqual(['0910-pre-launch', '0911-pre-launch']);
    expect(result.sessionCount).toBe(2);
  });
});

// =========================================================================
// T-0900-11: performance — 40 napkins x 3 agents under 100ms
// =========================================================================
base.describe.serial('T-0900-11: performance — 40 napkins x 3 agents < 100ms', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('reconciliation of 120 dirs completes under 100ms', async () => {
    createNepicDir(tmpDir);

    // Create 40 napkins x 3 agents = 120 dirs
    for (let i = 0; i < 40; i++) {
      const slug = `perf-${String(i).padStart(4, '0')}`;
      createNapkinDir(tmpDir, slug, ['001-agent-a', '002-agent-b', '003-agent-c']);
    }

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb } = globalThis.__napTest!;
      const db = getDb();

      const start = performance.now();
      reconcile(dir, db);
      const elapsed = performance.now() - start;

      const napkinCount = (db
        .prepare("SELECT COUNT(*) as c FROM napkins WHERE nepic_id = '02-nepic-spaces'")
        .get() as any).c;
      const sessionCount = (db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug IS NOT NULL")
        .get() as any).c;

      return { elapsed, napkinCount, sessionCount };
    }, path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces'));

    expect(result.napkinCount).toBeGreaterThanOrEqual(40);
    expect(result.sessionCount).toBeGreaterThanOrEqual(120);
    expect(result.elapsed).toBeLessThan(100);
  });
});

// =========================================================================
// T-0900-12: reconciliation is additive — never deletes rows
// =========================================================================
base.describe.serial('T-0900-12: never deletes rows, never deletes files', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('row counts unchanged after orphaning — hidden, not deleted', async () => {
    createNepicDir(tmpDir);
    // Create 5 napkins with 2 agents each = 10 sessions
    for (let i = 1; i <= 5; i++) {
      createNapkinDir(tmpDir, `1200-add-${String(i).padStart(2, '0')}`, ['001-fs-eng', '002-test-arch']);
    }
    const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');

    const result = await app.evaluate(({ }, dir) => {
      const { reconcile, getDb, fs, path } = globalThis.__napTest!;
      const db = getDb();

      // Initial reconcile to seed all rows
      reconcile(dir, db);

      const napkinCountBefore = (db
        .prepare("SELECT COUNT(*) as c FROM napkins WHERE nepic_id = '02-nepic-spaces' AND slug LIKE '1200-add-%'")
        .get() as any).c;
      const sessionCountBefore = (db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug LIKE '1200-add-%'")
        .get() as any).c;

      // Remove 3 napkin dirs
      const napkinsPath = path.join(dir, '30-napkins');
      fs.rmSync(path.join(napkinsPath, '1200-add-01'), { recursive: true, force: true });
      fs.rmSync(path.join(napkinsPath, '1200-add-02'), { recursive: true, force: true });
      fs.rmSync(path.join(napkinsPath, '1200-add-03'), { recursive: true, force: true });

      // Reconcile again
      reconcile(dir, db);

      const napkinCountAfter = (db
        .prepare("SELECT COUNT(*) as c FROM napkins WHERE nepic_id = '02-nepic-spaces' AND slug LIKE '1200-add-%'")
        .get() as any).c;
      const sessionCountAfter = (db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug LIKE '1200-add-%'")
        .get() as any).c;
      const hiddenNapkins = (db
        .prepare("SELECT COUNT(*) as c FROM napkins WHERE nepic_id = '02-nepic-spaces' AND slug LIKE '1200-add-%' AND hidden = 1")
        .get() as any).c;
      const hiddenSessions = (db
        .prepare("SELECT COUNT(*) as c FROM sessions WHERE nepic_id = '02-nepic-spaces' AND napkin_slug LIKE '1200-add-%' AND hidden = 1")
        .get() as any).c;

      // Verify no files were deleted by reconciliation (the remaining 2 dirs still exist)
      const remainingDirs = fs.readdirSync(napkinsPath).filter((d: string) => d.startsWith('1200-add-'));

      return {
        napkinCountBefore,
        napkinCountAfter,
        sessionCountBefore,
        sessionCountAfter,
        hiddenNapkins,
        hiddenSessions,
        remainingDirCount: remainingDirs.length,
      };
    }, nepicDir);

    // Row counts unchanged
    expect(result.napkinCountBefore).toBe(5);
    expect(result.napkinCountAfter).toBe(5);
    expect(result.sessionCountBefore).toBe(10);
    expect(result.sessionCountAfter).toBe(10);
    // Orphaned rows are hidden
    expect(result.hiddenNapkins).toBe(3);
    expect(result.hiddenSessions).toBe(6);
    // Remaining dirs not deleted
    expect(result.remainingDirCount).toBe(2);
  });
});
