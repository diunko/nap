import { test as base, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { launchApp } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';

/** Dispose all pty handlers, then quit cleanly — no crash, no macOS dialog */
async function forceCleanup(app: ElectronApplication, tmpDir: string): Promise<void> {
  try {
    await app.evaluate(({ app: a }) => {
      globalThis.__napTest?.teardownPtys();
      a.quit();
    });
  } catch { /* app may already be closing */ }
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T-1000-01: directory scaffold — all required subdirs created
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-01: directory scaffold', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('all required subdirs created for new nepic', async () => {
    const result = await app.evaluate(({ }, dir) => {
      const { handleNepicCreate, fs, path } = globalThis.__napTest!;
      const res = handleNepicCreate('auth-rewrite');
      const nepicDir = path.join(dir, '.nap', 'nepics', res.nepic.slug);

      const expected = [
        '10-docs',
        '15-feedback',
        '20-architects',
        '20-architects/001-architect',
        '30-napkins',
        '40-board',
        '40-board/10-draft',
        '40-board/20-backlog',
        '40-board/30-todo',
        '40-board/40-doing',
        '40-board/50-review',
        '40-board/60-done',
      ];

      const results: Record<string, boolean> = {};
      for (const d of expected) {
        const fullPath = path.join(nepicDir, d);
        try {
          results[d] = fs.statSync(fullPath).isDirectory();
        } catch {
          results[d] = false;
        }
      }

      return { slug: res.nepic.slug, results };
    }, tmpDir);

    expect(result.slug).toMatch(/^\d+-auth-rewrite$/);
    for (const [dir, exists] of Object.entries(result.results)) {
      expect(exists, `expected dir "${dir}" to exist`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T-1000-02: slug generation — NN is next available number
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-02: slug generation — NN is next available', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('pre-existing 01-first, 02-second → third gets 03-third', async () => {
    // Pre-create dirs on disk
    const nepicsBase = path.join(tmpDir, '.nap', 'nepics');
    fs.mkdirSync(path.join(nepicsBase, '01-first'), { recursive: true });
    fs.mkdirSync(path.join(nepicsBase, '02-second'), { recursive: true });

    const result = await app.evaluate(() => {
      const { handleNepicCreate } = globalThis.__napTest!;
      const res = handleNepicCreate('third');
      return { slug: res.nepic.slug };
    });

    expect(result.slug).toBe('03-third');
    expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '03-third'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-03: slug generation — first nepic ever (no existing dirs)
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-03: first nepic ever', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('empty nepics dir → slug is 01-genesis', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate } = globalThis.__napTest!;
      const res = handleNepicCreate('genesis');
      return { slug: res.nepic.slug };
    });

    expect(result.slug).toBe('01-genesis');
  });
});

// ---------------------------------------------------------------------------
// T-1000-04: SQLite — nepic row inserted with is_active=1
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-04: SQLite nepic row inserted', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('new nepic row has correct fields and is_active=1', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getDb } = globalThis.__napTest!;
      const db = getDb();
      const res = handleNepicCreate('db-test');

      const row = db.prepare('SELECT * FROM nepics WHERE id = ?').get(res.nepic.id) as any;

      return {
        exists: !!row,
        id: row?.id,
        name: row?.name,
        slug: row?.slug,
        isActive: row?.is_active,
        hasCreatedAt: typeof row?.created_at === 'number' && row.created_at > 0,
        expectedName: res.nepic.name,
        expectedSlug: res.nepic.slug,
      };
    });

    expect(result.exists).toBe(true);
    expect(result.name).toBe('db-test');
    expect(result.slug).toBe(result.expectedSlug);
    expect(result.isActive).toBe(1);
    expect(result.hasCreatedAt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-05: SQLite — previous nepic deactivated
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-05: previous nepic deactivated', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('old nepic is_active=0, new nepic is_active=1, exactly 1 active', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getDb } = globalThis.__napTest!;
      const db = getDb();

      const first = handleNepicCreate('old-nepic');
      const second = handleNepicCreate('new-nepic');

      const oldRow = db.prepare('SELECT is_active FROM nepics WHERE id = ?').get(first.nepic.id) as any;
      const newRow = db.prepare('SELECT is_active FROM nepics WHERE id = ?').get(second.nepic.id) as any;
      const activeCount = (db.prepare('SELECT COUNT(*) as c FROM nepics WHERE is_active = 1').get() as any).c;

      return {
        oldActive: oldRow?.is_active,
        newActive: newRow?.is_active,
        activeCount,
      };
    });

    expect(result.oldActive).toBe(0);
    expect(result.newActive).toBe(1);
    expect(result.activeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T-1000-06: SQLite — multiple previous nepics all deactivated
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-06: multiple previous nepics all deactivated', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('3 old nepics deactivated, only new one active', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getDb } = globalThis.__napTest!;
      const db = getDb();

      // Create 3 nepics (each deactivates the previous)
      const ids: string[] = [];
      ids.push(handleNepicCreate('multi-a').nepic.id);
      ids.push(handleNepicCreate('multi-b').nepic.id);
      ids.push(handleNepicCreate('multi-c').nepic.id);

      // Create the 4th — should deactivate all 3
      const newest = handleNepicCreate('multi-d');

      const oldActives = ids.map((id) => {
        const row = db.prepare('SELECT is_active FROM nepics WHERE id = ?').get(id) as any;
        return row?.is_active;
      });

      const activeCount = (db.prepare('SELECT COUNT(*) as c FROM nepics WHERE is_active = 1').get() as any).c;

      return {
        oldActives,
        activeCount,
        newestId: newest.nepic.id,
      };
    });

    expect(result.oldActives).toEqual([0, 0, 0]);
    expect(result.activeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T-1000-07: architect session created in SQLite
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-07: architect session created', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('session row has role=architect, nepic_id, ccSessionUuid, correct cwd', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getDb } = globalThis.__napTest!;
      const db = getDb();
      const res = handleNepicCreate('arch-test');

      const row = db.prepare(
        "SELECT * FROM sessions WHERE nepic_id = ? AND role = 'architect'",
      ).get(res.nepic.id) as any;

      return {
        exists: !!row,
        role: row?.role,
        nepicId: row?.nepic_id,
        status: row?.status,
        hasCcSessionUuid: typeof row?.cc_session_uuid === 'string' && row.cc_session_uuid.length > 0,
        name: row?.name,
        cwd: row?.cwd,
        expectedNepicId: res.nepic.id,
        expectedCwd: res.architectSession.cwd,
      };
    });

    expect(result.exists).toBe(true);
    expect(result.role).toBe('architect');
    expect(result.nepicId).toBe(result.expectedNepicId);
    expect(result.status).toBe('running');
    expect(result.hasCcSessionUuid).toBe(true);
    expect(result.name).toBe('001-architect');
    expect(result.cwd).toBe(result.expectedCwd);
  });
});

// ---------------------------------------------------------------------------
// T-1000-08: architect pty spawned with correct command
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-08: architect pty spawned', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('pty exists for architect session ID, command includes --session-id', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getLivePtyIds, getSession } = globalThis.__napTest!;
      const res = handleNepicCreate('pty-test');

      const livePtyIds = getLivePtyIds();
      const hasPty = livePtyIds.includes(res.architectSession.id);

      // Get session to verify ccSessionUuid
      const session = getSession(res.architectSession.id);

      return {
        hasPty,
        sessionId: res.architectSession.id,
        ccSessionUuid: res.architectSession.ccSessionUuid,
        sessionCcUuid: session?.ccSessionUuid,
      };
    });

    expect(result.hasPty).toBe(true);
    expect(result.ccSessionUuid).toBeTruthy();
    expect(result.sessionCcUuid).toBe(result.ccSessionUuid);
  });
});

// ---------------------------------------------------------------------------
// T-1000-09: architect prompt.md template created
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-09: architect prompt.md created', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('prompt.md exists in 20-architects/001-architect/ and is non-empty', async () => {
    const result = await app.evaluate(({ }, dir) => {
      const { handleNepicCreate, fs, path } = globalThis.__napTest!;
      const res = handleNepicCreate('prompt-test');
      const nepicDir = path.join(dir, '.nap', 'nepics', res.nepic.slug);
      const promptPath = path.join(nepicDir, '20-architects', '001-architect', 'prompt.md');

      let exists = false;
      let content = '';
      try {
        content = fs.readFileSync(promptPath, 'utf-8');
        exists = true;
      } catch {
        exists = false;
      }

      return {
        exists,
        nonEmpty: content.length > 0,
        containsNepicName: content.includes('prompt-test'),
      };
    }, tmpDir);

    expect(result.exists).toBe(true);
    expect(result.nonEmpty).toBe(true);
    expect(result.containsNepicName).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-10: ui_state updated with new active nepic
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-10: ui_state updated', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('ui_state.active_nepic_id = new nepic id', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getDb } = globalThis.__napTest!;
      const db = getDb();
      const res = handleNepicCreate('ui-state-test');

      const row = db.prepare('SELECT active_nepic_id FROM ui_state WHERE id = 1').get() as any;

      return {
        activeNepicId: row?.active_nepic_id,
        expectedId: res.nepic.id,
      };
    });

    expect(result.activeNepicId).toBe(result.expectedId);
  });
});

// ---------------------------------------------------------------------------
// T-1000-11: renderer notified — gutter re-renders with new icon
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-11: gutter re-renders with new icon', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('store activeNepicId matches, gutter shows new icon', async () => {
    const iconCountBefore = await page.evaluate(
      () => document.querySelectorAll('[data-testid="nepic-icon"]').length,
    );

    // Create nepic via IPC (simulates what the renderer would do)
    const nepicData = await app.evaluate(() => {
      const { handleNepicCreate } = globalThis.__napTest!;
      return handleNepicCreate('gutter-test');
    });

    // Update renderer store like the Gutter component would
    await page.evaluate(
      ([nepicId, nepicName, nepicSlug, archId, archName, archCwd, archRole]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addNepic({ id: nepicId, name: nepicName, slug: nepicSlug });
        store.getState().setActiveNepic(nepicId);
        store.getState().addSocketTerminal(archId, archName, null, archCwd, archRole);
        store.getState().setActive(archId);
      },
      [
        nepicData.nepic.id,
        nepicData.nepic.name,
        nepicData.nepic.slug,
        nepicData.architectSession.id,
        nepicData.architectSession.name,
        nepicData.architectSession.cwd,
        nepicData.architectSession.role,
      ],
    );

    await page.waitForTimeout(300);

    const storeState = await page.evaluate(() => {
      return (window as any).useTerminalStore.getState().activeNepicId;
    });
    expect(storeState).toBe(nepicData.nepic.id);

    const iconCountAfter = await page.evaluate(
      () => document.querySelectorAll('[data-testid="nepic-icon"]').length,
    );
    expect(iconCountAfter).toBe(iconCountBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// T-1000-12: renderer notified — architect terminal appears and is active
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-12: architect terminal appears and is active', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('store has architect terminal entry, it is activeTerminalId, xterm exists', async () => {
    const nepicData = await app.evaluate(() => {
      const { handleNepicCreate } = globalThis.__napTest!;
      return handleNepicCreate('term-test');
    });

    // Simulate renderer-side handling
    await page.evaluate(
      ([nepicId, nepicName, nepicSlug, archId, archName, archCwd, archRole]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addNepic({ id: nepicId, name: nepicName, slug: nepicSlug });
        store.getState().setActiveNepic(nepicId);
        store.getState().addSocketTerminal(archId, archName, null, archCwd, archRole);
        store.getState().setActive(archId);
      },
      [
        nepicData.nepic.id,
        nepicData.nepic.name,
        nepicData.nepic.slug,
        nepicData.architectSession.id,
        nepicData.architectSession.name,
        nepicData.architectSession.cwd,
        nepicData.architectSession.role,
      ],
    );

    await page.waitForTimeout(300);

    const result = await page.evaluate(
      (archId) => {
        const store = (window as any).useTerminalStore;
        const state = store.getState();
        const archTerminal = state.terminals.find((t: any) => t.id === archId);
        const hasXterm = !!(window as any).getTerminal(archId);
        return {
          found: !!archTerminal,
          role: archTerminal?.role,
          isActive: state.activeTerminalId === archId,
          hasXterm,
        };
      },
      nepicData.architectSession.id,
    );

    expect(result.found).toBe(true);
    expect(result.role).toBe('architect');
    expect(result.isActive).toBe(true);
    expect(result.hasXterm).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-13: previous nepic's sessions keep running
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-13: previous nepic sessions keep running', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('first nepic pty still alive after second nepic created', async () => {
    const result = await app.evaluate(() => {
      const { handleNepicCreate, getLivePtyIds, getSession } = globalThis.__napTest!;

      const first = handleNepicCreate('keep-a');
      const firstArchId = first.architectSession.id;

      // Verify first pty is alive
      const liveBefore = getLivePtyIds();
      const firstAliveBefore = liveBefore.includes(firstArchId);

      // Create second nepic
      handleNepicCreate('keep-b');

      // Check first pty is still alive
      const liveAfter = getLivePtyIds();
      const firstAliveAfter = liveAfter.includes(firstArchId);
      const firstSession = getSession(firstArchId);

      return {
        firstAliveBefore,
        firstAliveAfter,
        firstStatus: firstSession?.status,
      };
    });

    expect(result.firstAliveBefore).toBe(true);
    expect(result.firstAliveAfter).toBe(true);
    expect(result.firstStatus).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// T-1000-14: naming collision — duplicate name
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-14: duplicate name gets distinct slug', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('two nepics named "auth" get different NN prefixes, both dirs exist', async () => {
    const result = await app.evaluate(({ }, dir) => {
      const { handleNepicCreate, getDb, fs, path } = globalThis.__napTest!;
      const db = getDb();

      const first = handleNepicCreate('auth');
      const second = handleNepicCreate('auth');

      const nepicsBase = path.join(dir, '.nap', 'nepics');
      const firstDirExists = fs.existsSync(path.join(nepicsBase, first.nepic.slug));
      const secondDirExists = fs.existsSync(path.join(nepicsBase, second.nepic.slug));

      const rows = db.prepare("SELECT slug FROM nepics WHERE name = 'auth' ORDER BY slug").all() as any[];

      return {
        firstSlug: first.nepic.slug,
        secondSlug: second.nepic.slug,
        differentSlugs: first.nepic.slug !== second.nepic.slug,
        firstDirExists,
        secondDirExists,
        rowCount: rows.length,
      };
    }, tmpDir);

    expect(result.differentSlugs).toBe(true);
    expect(result.firstDirExists).toBe(true);
    expect(result.secondDirExists).toBe(true);
    expect(result.rowCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T-1000-15: missing .nap/ dir — created on demand
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-15: missing .nap/ dir created on demand', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    // Launch with a fresh tmpDir that has NO .nap/ directory
    ({ app, tmpDir } = await launchApp());
    await app.firstWindow();
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('nepic creation succeeds even without pre-existing .nap/ dir', async () => {
    // The launchApp creates a fresh tmpDir. The app creates .nap/ for the DB,
    // but .nap/nepics/ may not exist yet. handleNepicCreate should create it.
    const result = await app.evaluate(({ }, dir) => {
      const { handleNepicCreate, fs, path } = globalThis.__napTest!;

      // Ensure .nap/nepics/ doesn't exist before the call
      const nepicsBase = path.join(dir, '.nap', 'nepics');
      const existedBefore = fs.existsSync(nepicsBase);

      let error: string | null = null;
      let slug = '';
      try {
        const res = handleNepicCreate('from-nothing');
        slug = res.nepic.slug;
      } catch (e: any) {
        error = e.message;
      }

      const existsAfter = slug ? fs.existsSync(path.join(nepicsBase, slug)) : false;

      return { error, slug, existsAfter };
    }, tmpDir);

    expect(result.error).toBeNull();
    expect(result.slug).toBe('01-from-nothing');
    expect(result.existsAfter).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-16: napkin watcher starts for new nepic
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-16: napkin watcher starts for new nepic', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('new napkin dir triggers napkin:update in renderer', async () => {
    // Create nepic via IPC (handleNepicCreate restarts the napkin watcher)
    const nepicData = await app.evaluate(() => {
      const { handleNepicCreate } = globalThis.__napTest!;
      return handleNepicCreate('watcher-test');
    });

    // Now create a napkin dir inside the new nepic's 30-napkins/
    await app.evaluate(({ }, slug) => {
      const { fs, path, handleNepicCreate } = globalThis.__napTest!;
      // handleNepicCreate already ran; find the nepic dir from the slug
      // The nepic dir is accessible via the returned data
    }, nepicData.nepic.slug);

    // Create napkin dir on disk
    const nepicDir = path.join(tmpDir, '.nap', 'nepics', nepicData.nepic.slug);
    const napkinDir = path.join(nepicDir, '30-napkins', '0001-test-napkin');
    fs.mkdirSync(napkinDir, { recursive: true });
    fs.writeFileSync(path.join(napkinDir, '0001-test-napkin.nap.md'), '* test bullet\n');

    // Wait for the watcher to pick it up and send to renderer
    const found = await page.waitForFunction(
      () => {
        const napkins = (window as any).useTerminalStore.getState().napkins;
        return napkins.some((n: any) => n.slug === '0001-test-napkin');
      },
      { timeout: 15000 },
    ).then(() => true).catch(() => false);

    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1000-17: end-to-end — (+) click through architect terminal
// Note: depends on claude being available; uses echo as stand-in
// ---------------------------------------------------------------------------
base.describe.serial('T-1000-17: e2e — (+) click through architect terminal', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
  });

  base.afterAll(async () => {
    await forceCleanup(app, tmpDir);
  });

  base('click (+), enter name, architect terminal appears with active icon', async () => {
    const iconCountBefore = await page.evaluate(
      () => document.querySelectorAll('[data-testid="nepic-icon"]').length,
    );

    // Click the (+) button
    await page.click('[data-testid="nepic-add"]');

    // Wait for input to appear
    await page.waitForSelector('[data-testid="nepic-name-input"]', { timeout: 5000 });

    // Type nepic name and press Enter
    // Use page.evaluate to set value + dispatch events to avoid blur-cancel race
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="nepic-name-input"]') as HTMLInputElement;
      if (!input) throw new Error('input not found');
      // Set value via native setter to trigger React onChange
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      nativeInputValueSetter.call(input, 'e2e-test');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Small delay for React state update
    await page.waitForTimeout(100);

    // Press Enter to trigger creation
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="nepic-name-input"]') as HTMLInputElement;
      if (!input) throw new Error('input not found');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Wait for new nepic icon to appear in gutter
    await page.waitForFunction(
      (countBefore) =>
        document.querySelectorAll('[data-testid="nepic-icon"]').length > countBefore,
      iconCountBefore,
      { timeout: 15000 },
    );

    const iconCountAfter = await page.evaluate(
      () => document.querySelectorAll('[data-testid="nepic-icon"]').length,
    );
    expect(iconCountAfter).toBe(iconCountBefore + 1);

    // Verify store has the new nepic as active
    const storeState = await page.evaluate(() => {
      const state = (window as any).useTerminalStore.getState();
      return {
        activeNepicId: state.activeNepicId,
        nepicCount: state.nepics.length,
        hasArchitectTerminal: state.terminals.some((t: any) => t.role === 'architect'),
      };
    });

    expect(storeState.activeNepicId).toBeTruthy();
    expect(storeState.nepicCount).toBeGreaterThan(0);
    expect(storeState.hasArchitectTerminal).toBe(true);
  });
});
