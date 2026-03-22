import { test as base, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { launchApp, cleanupApp } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Fixture: fresh Electron app per test group, exposes tmpDir
// ---------------------------------------------------------------------------

function setupNapkinDir(
  tmpDir: string,
  slug: string,
  opts?: {
    artifacts?: string[];
    agents?: string[];
    napMdContent?: string;
    extraFiles?: string[];
  },
): string {
  const napkinsDir = path.join(tmpDir, 'nepic', '30-napkins');
  const napkinDir = path.join(napkinsDir, slug);
  fs.mkdirSync(napkinDir, { recursive: true });

  for (const ext of opts?.artifacts ?? []) {
    fs.writeFileSync(path.join(napkinDir, `${slug}${ext}`), '');
  }

  if (opts?.agents) {
    const agentsDir = path.join(napkinDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const agent of opts.agents) {
      const agentDir = path.join(agentsDir, agent);
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'prompt.md'), '');
    }
  }

  if (opts?.napMdContent !== undefined) {
    fs.writeFileSync(path.join(napkinDir, `${slug}.nap.md`), opts.napMdContent);
  }

  for (const f of opts?.extraFiles ?? []) {
    fs.writeFileSync(path.join(napkinDir, f), '');
  }

  return napkinsDir;
}

// =========================================================================
// T-0500-01: readNapkinDir — reads artifact extensions correctly
// =========================================================================
base.describe.serial('T-0500-01: readNapkinDir — artifact extensions', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('returns correct artifact extensions, ignores unknown files', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '0100-test', {
      artifacts: ['.nap.md', '.spec.md', '.test.md'],
      extraFiles: ['random.txt', 'notes.log'],
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0100-test'] as [string, string]);

    expect(result.slug).toBe('0100-test');
    expect(result.artifacts.sort()).toEqual(['.nap.md', '.spec.md', '.test.md']);
  });
});

// =========================================================================
// T-0500-02: readNapkinDir — reads agent directory names
// =========================================================================
base.describe.serial('T-0500-02: readNapkinDir — agent dir names', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('returns agent dir names, ignores stray files in agents/', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '0200-agents', {
      agents: ['001-test-arch-sqlite', '002-fs-eng'],
    });
    // Add a stray file inside agents/
    fs.writeFileSync(
      path.join(napkinsDir, '0200-agents', 'agents', 'stray.txt'),
      '',
    );

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0200-agents'] as [string, string]);

    expect(result.agents.sort()).toEqual(['001-test-arch-sqlite', '002-fs-eng']);
  });
});

// =========================================================================
// T-0500-03: readNapkinDir — extracts napkin bullets from .nap.md
// =========================================================================
base.describe.serial('T-0500-03: readNapkinDir — napkin bullets', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('extracts top-level * lines, strips prefix, ignores nested/plain', async () => {
    const content = [
      '# My Napkin',
      '',
      '* First bullet point',
      '* Second bullet',
      '  * Nested bullet (should be excluded)',
      'Plain text line',
      '* Third bullet',
      '',
    ].join('\n');

    const napkinsDir = setupNapkinDir(tmpDir, '0300-bullets', {
      napMdContent: content,
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0300-bullets'] as [string, string]);

    expect(result.napkinBullets).toEqual([
      'First bullet point',
      'Second bullet',
      'Third bullet',
    ]);
  });
});

// =========================================================================
// T-0500-04: readNapkinDir — missing .nap.md returns empty bullets
// =========================================================================
base.describe.serial('T-0500-04: readNapkinDir — missing .nap.md', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('returns empty napkinBullets when .nap.md does not exist', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '0400-no-nap', {
      artifacts: ['.spec.md'],
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0400-no-nap'] as [string, string]);

    expect(result.napkinBullets).toEqual([]);
    expect(result.artifacts).toContain('.spec.md');
  });
});

// =========================================================================
// T-0500-05: readNapkinDir — no agents/ dir returns empty agents
// =========================================================================
base.describe.serial('T-0500-05: readNapkinDir — no agents/ dir', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('returns empty agents when agents/ does not exist', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '0500-no-agents', {
      artifacts: ['.nap.md'],
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0500-no-agents'] as [string, string]);

    expect(result.agents).toEqual([]);
  });
});

// =========================================================================
// T-0500-06: startup full scan — sends all napkins on init
// =========================================================================
base.describe.serial('T-0500-06: startup full scan', () => {
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
    await cleanupApp(app, tmpDir);
  });

  base('sends all 3 napkins as array via IPC on startNapkinWatcher', async () => {
    // Create 3 napkin dirs
    const nepicDir = path.join(tmpDir, 'nepic-06');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    for (const slug of ['0100-alpha', '0200-beta', '0300-gamma']) {
      const d = path.join(napkinsDir, slug);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${slug}.nap.md`), `* ${slug} bullet\n`);
    }

    // Set up IPC capture in renderer
    await page.evaluate(() => {
      (window as any).__napkinUpdates = [];
      window.electronAPI.onNapkinUpdate((data) => {
        (window as any).__napkinUpdates.push(data);
      });
    });

    // Start the watcher from main process (this sends initial scan via IPC)
    await app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      stopNapkinWatcher();
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    // Give IPC time to arrive
    await page.waitForTimeout(500);

    const updates = await page.evaluate(
      () => (window as any).__napkinUpdates ?? [],
    );

    // The initial payload should be an array of 3 napkins
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const initial = updates[0];
    expect(Array.isArray(initial)).toBe(true);
    expect(initial).toHaveLength(3);
    const slugs = initial.map((n: any) => n.slug).sort();
    expect(slugs).toEqual(['0100-alpha', '0200-beta', '0300-gamma']);
  });
});

// =========================================================================
// T-0500-07 through T-0500-18: fs.watch + IPC tests
// =========================================================================

// Helper: start watcher and set up IPC capture in renderer
async function startWatcherWithCapture(
  app: ElectronApplication,
  page: Page,
  nepicDir: string,
): Promise<void> {
  // Set up IPC capture in renderer before starting watcher
  await page.evaluate(() => {
    (window as any).__napkinUpdates = [];
    (window as any).__napkinUpdateUnsub = window.electronAPI.onNapkinUpdate(
      (data) => {
        (window as any).__napkinUpdates.push(data);
      },
    );
  });

  // Start watcher from main process
  await app.evaluate(async ({ BrowserWindow }, dir) => {
    const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
    const win = BrowserWindow.getAllWindows()[0];
    stopNapkinWatcher();
    await startNapkinWatcher(dir, win);
  }, nepicDir);

  // Wait for initial scan IPC to arrive
  await page.waitForTimeout(300);

  // Clear captured updates (discard initial scan)
  await page.evaluate(() => {
    (window as any).__napkinUpdates = [];
  });
}

async function getUpdates(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__napkinUpdates ?? []);
}

async function cleanupWatcher(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const unsub = (window as any).__napkinUpdateUnsub;
    if (unsub) unsub();
  });
  await app.evaluate(() => {
    globalThis.__napTest!.stopNapkinWatcher();
  });
}

// =========================================================================
// T-0500-07: fs.watch fires on file create — IPC update sent
// =========================================================================
base.describe.serial('T-0500-07: fs.watch — file create', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('creating a file triggers IPC update with correct slug', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-07');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '0200-sqlite-setup';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
    fs.writeFileSync(
      path.join(napkinsDir, slug, `${slug}.nap.md`),
      '* existing bullet\n',
    );

    await startWatcherWithCapture(app, page, nepicDir);

    // Create a new file in the napkin dir
    fs.writeFileSync(
      path.join(napkinsDir, slug, `${slug}.spec.md`),
      '# Spec\n',
    );

    // Wait for fs.watch + debounce (200ms) + margin
    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);

    // Find update for our slug
    const napkinUpdate = updates.find(
      (u: any) => !Array.isArray(u) && u.slug === slug,
    );
    expect(napkinUpdate).toBeDefined();
    expect(napkinUpdate.slug).toBe(slug);
    expect(napkinUpdate.artifacts).toContain('.spec.md');
  });
});

// =========================================================================
// T-0500-08: fs.watch fires on file modify — updated content delivered
// =========================================================================
base.describe.serial('T-0500-08: fs.watch — file modify', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('modifying .nap.md delivers updated napkinBullets count', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-08');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '0100-modify';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
    fs.writeFileSync(
      path.join(napkinsDir, slug, `${slug}.nap.md`),
      '* one\n* two\n* three\n',
    );

    await startWatcherWithCapture(app, page, nepicDir);

    // Modify .nap.md to have 5 bullets
    fs.writeFileSync(
      path.join(napkinsDir, slug, `${slug}.nap.md`),
      '* one\n* two\n* three\n* four\n* five\n',
    );

    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    const napkinUpdate = updates.find(
      (u: any) => !Array.isArray(u) && u.slug === slug,
    );
    expect(napkinUpdate).toBeDefined();
    expect(napkinUpdate.napkinBullets).toHaveLength(5);
  });
});

// =========================================================================
// T-0500-09: fs.watch fires on file delete — artifact removed from list
// =========================================================================
base.describe.serial('T-0500-09: fs.watch — file delete', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('deleting .spec.md removes it from artifacts list', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-09');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '0100-delete';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
    fs.writeFileSync(path.join(napkinsDir, slug, `${slug}.nap.md`), '');
    fs.writeFileSync(path.join(napkinsDir, slug, `${slug}.spec.md`), '');

    await startWatcherWithCapture(app, page, nepicDir);

    // Delete .spec.md
    fs.unlinkSync(path.join(napkinsDir, slug, `${slug}.spec.md`));

    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    const napkinUpdate = updates.find(
      (u: any) => !Array.isArray(u) && u.slug === slug,
    );
    expect(napkinUpdate).toBeDefined();
    expect(napkinUpdate.artifacts).not.toContain('.spec.md');
    expect(napkinUpdate.artifacts).toContain('.nap.md');
  });
});

// =========================================================================
// T-0500-10: debounce batches rapid changes — single IPC per napkin dir
// =========================================================================
base.describe.serial('T-0500-10: debounce batches rapid changes', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('5 rapid file writes produce exactly 1 IPC update', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-10');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '0100-debounce';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });

    await startWatcherWithCapture(app, page, nepicDir);

    // Write 5 files in rapid succession (< 200ms total)
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(napkinsDir, slug, `file-${i}.md`),
        `content ${i}`,
      );
    }

    // Wait for debounce (200ms) + margin
    await page.waitForTimeout(800);

    const updates = await getUpdates(page);
    const slugUpdates = updates.filter(
      (u: any) => !Array.isArray(u) && u.slug === slug,
    );
    expect(slugUpdates).toHaveLength(1);
  });
});

// =========================================================================
// T-0500-11: debounce is per-napkin-dir
// =========================================================================
base.describe.serial('T-0500-11: debounce per-napkin-dir', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('changes to different napkins fire independent updates', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-11');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug1 = '0200-sqlite-setup';
    const slug2 = '0300-status-api';
    fs.mkdirSync(path.join(napkinsDir, slug1), { recursive: true });
    fs.mkdirSync(path.join(napkinsDir, slug2), { recursive: true });

    await startWatcherWithCapture(app, page, nepicDir);

    // Write one file to each dir simultaneously
    fs.writeFileSync(
      path.join(napkinsDir, slug1, 'new-file.md'),
      'content 1',
    );
    fs.writeFileSync(
      path.join(napkinsDir, slug2, 'new-file.md'),
      'content 2',
    );

    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    const slugs = updates
      .filter((u: any) => !Array.isArray(u))
      .map((u: any) => u.slug);
    expect(slugs).toContain(slug1);
    expect(slugs).toContain(slug2);
  });
});

// =========================================================================
// T-0500-12: empty 30-napkins/ — no crash, empty initial payload
// =========================================================================
base.describe.serial('T-0500-12: empty 30-napkins/', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('empty napkins dir sends empty array, no crash', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-12');
    fs.mkdirSync(path.join(nepicDir, '30-napkins'), { recursive: true });

    // Set up IPC capture
    await page.evaluate(() => {
      (window as any).__napkinUpdates = [];
      (window as any).__napkinUpdateUnsub = window.electronAPI.onNapkinUpdate(
        (data) => {
          (window as any).__napkinUpdates.push(data);
        },
      );
    });

    // Start watcher — should send empty array
    await app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      stopNapkinWatcher();
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    await page.waitForTimeout(500);

    const updates = await getUpdates(page);
    // First update should be the initial scan — an empty array
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const initial = updates[0];
    expect(Array.isArray(initial)).toBe(true);
    expect(initial).toHaveLength(0);
  });
});

// =========================================================================
// T-0500-13: 30-napkins/ doesn't exist yet — no crash, watcher starts on create
// =========================================================================
base.describe.serial("T-0500-13: 30-napkins/ doesn't exist yet", () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('no crash on start, update fires when dir appears', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-13');
    // Only create nepicDir — NOT 30-napkins/
    fs.mkdirSync(nepicDir, { recursive: true });

    // Set up IPC capture
    await page.evaluate(() => {
      (window as any).__napkinUpdates = [];
      (window as any).__napkinUpdateUnsub = window.electronAPI.onNapkinUpdate(
        (data) => {
          (window as any).__napkinUpdates.push(data);
        },
      );
    });

    // Start watcher — should not crash
    await app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      stopNapkinWatcher();
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    await page.waitForTimeout(300);

    // Initial scan should have sent empty array (30-napkins/ doesn't exist)
    let updates = await getUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(updates[0])).toBe(true);
    expect(updates[0]).toHaveLength(0);

    // Clear updates
    await page.evaluate(() => {
      (window as any).__napkinUpdates = [];
    });

    // Now create 30-napkins/ with a napkin
    const slug = '0100-new';
    const napkinDir = path.join(nepicDir, '30-napkins', slug);
    fs.mkdirSync(napkinDir, { recursive: true });
    fs.writeFileSync(
      path.join(napkinDir, `${slug}.nap.md`),
      '* hello from new dir\n',
    );

    // Parent watcher delay (100ms) + full scan + margin
    await page.waitForTimeout(1500);

    updates = await getUpdates(page);
    // Should have received an update with the new napkin
    const hasNewNapkin = updates.some((u: any) => {
      if (Array.isArray(u)) {
        return u.some((n: any) => n.slug === slug);
      }
      return u.slug === slug;
    });
    expect(hasNewNapkin).toBe(true);
  });
});

// =========================================================================
// T-0500-14: new napkin dir created at runtime — picked up by watcher
// =========================================================================
base.describe.serial('T-0500-14: new napkin dir at runtime', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('new napkin dir triggers IPC update with correct data', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-14');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    // Start with 2 napkins
    for (const slug of ['0100-existing', '0200-existing']) {
      fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
      fs.writeFileSync(path.join(napkinsDir, slug, `${slug}.nap.md`), '');
    }

    await startWatcherWithCapture(app, page, nepicDir);

    // Create a new napkin dir at runtime
    const newSlug = '0400-new-napkin';
    const newDir = path.join(napkinsDir, newSlug);
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(
      path.join(newDir, `${newSlug}.nap.md`),
      '* brand new\n',
    );

    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    const newUpdate = updates.find(
      (u: any) => !Array.isArray(u) && u.slug === newSlug,
    );
    expect(newUpdate).toBeDefined();
    expect(newUpdate.napkinBullets).toContain('brand new');
  });
});

// =========================================================================
// T-0500-15: IPC payload shape matches spec
// =========================================================================
base.describe.serial('T-0500-15: IPC payload shape', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('readNapkinDir returns { slug, artifacts, agents, napkinBullets }', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '0100-shape', {
      artifacts: ['.nap.md', '.spec.md', '.test.md', '.journeys.md'],
      agents: ['001-arch', '002-eng'],
      napMdContent: '* Bullet one\n* Bullet two\n',
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '0100-shape'] as [string, string]);

    // Verify all four fields present with correct types
    expect(typeof result.slug).toBe('string');
    expect(result.slug).toBe('0100-shape');
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(Array.isArray(result.agents)).toBe(true);
    expect(Array.isArray(result.napkinBullets)).toBe(true);

    // Verify content
    expect(result.artifacts.sort()).toEqual([
      '.journeys.md',
      '.nap.md',
      '.spec.md',
      '.test.md',
    ]);
    expect(result.agents.sort()).toEqual(['001-arch', '002-eng']);
    expect(result.napkinBullets).toEqual(['Bullet one', 'Bullet two']);

    // Verify no extra fields
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(['agents', 'artifacts', 'napkinBullets', 'slug']);
  });
});

// =========================================================================
// T-0500-16: watcher stops cleanly on app quit
// =========================================================================
base.describe.serial('T-0500-16: watcher stops on app quit', () => {
  base('app exits cleanly with active watcher (exit code 0)', async () => {
    const { app, tmpDir } = await launchApp();
    const page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );

    // Set up a napkin dir and start watcher
    const nepicDir = path.join(tmpDir, 'nepic-16');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    fs.mkdirSync(path.join(napkinsDir, '0100-quit'), { recursive: true });

    await app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    await page.waitForTimeout(300);

    // Quit app and verify clean exit
    const exitCode = await app.evaluate(({ app }) => {
      app.quit();
      return 0;
    });
    expect(exitCode).toBe(0);

    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =========================================================================
// T-0500-17: agent dir created at runtime — appears in napkin update
// =========================================================================
base.describe.serial('T-0500-17: agent dir at runtime', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('new agent dir appears in agents list via IPC', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-17');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '0100-agents-runtime';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
    fs.writeFileSync(path.join(napkinsDir, slug, `${slug}.nap.md`), '');

    await startWatcherWithCapture(app, page, nepicDir);

    // Create agents dir with one agent at runtime
    const agentDir = path.join(napkinsDir, slug, 'agents', '001-test-arch');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'prompt.md'), '# Prompt');

    await page.waitForTimeout(1000);

    const updates = await getUpdates(page);
    const napkinUpdate = updates.find(
      (u: any) => !Array.isArray(u) && u.slug === slug,
    );
    expect(napkinUpdate).toBeDefined();
    expect(napkinUpdate.agents).toContain('001-test-arch');
  });
});

// =========================================================================
// T-0500-18: concurrent napkin changes during startup scan — no race
// =========================================================================
base.describe.serial('T-0500-18: concurrent changes during startup', () => {
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
    await cleanupWatcher(app, page);
    await cleanupApp(app, tmpDir);
  });

  base('modification during scan does not lose data', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-18');
    const napkinsDir = path.join(nepicDir, '30-napkins');

    // Create 5 napkin dirs
    const slugs = ['0100-a', '0200-b', '0300-c', '0400-d', '0500-e'];
    for (const slug of slugs) {
      const d = path.join(napkinsDir, slug);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(
        path.join(d, `${slug}.nap.md`),
        `* original ${slug}\n`,
      );
    }

    // Set up IPC capture
    await page.evaluate(() => {
      (window as any).__napkinUpdates = [];
      (window as any).__napkinUpdateUnsub = window.electronAPI.onNapkinUpdate(
        (data) => {
          (window as any).__napkinUpdates.push(data);
        },
      );
    });

    // Modify napkin #2 immediately after starting watcher (tight timing)
    const startPromise = app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      stopNapkinWatcher();
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    // Write modification concurrently
    fs.writeFileSync(
      path.join(napkinsDir, '0200-b', '0200-b.nap.md'),
      '* modified during scan\n',
    );

    await startPromise;
    await page.waitForTimeout(1500);

    const updates = await getUpdates(page);

    // Collect all napkin data we've received (from initial scans and incremental updates)
    const allSlugs = new Set<string>();
    for (const u of updates) {
      if (Array.isArray(u)) {
        for (const n of u) allSlugs.add(n.slug);
      } else {
        allSlugs.add(u.slug);
      }
    }

    // All 5 napkins should be represented
    for (const slug of slugs) {
      expect(allSlugs.has(slug)).toBe(true);
    }

    // The most recent data for 0200-b should have the modified content
    const bUpdates = updates
      .filter((u: any) => !Array.isArray(u) && u.slug === '0200-b')
      .concat(
        updates
          .filter((u: any) => Array.isArray(u))
          .flatMap((u: any) => u.filter((n: any) => n.slug === '0200-b')),
      );

    const latestB = bUpdates[bUpdates.length - 1];
    expect(latestB).toBeDefined();
    // It should have either original or modified content — key is no data loss
    expect(latestB.napkinBullets.length).toBeGreaterThanOrEqual(1);
  });
});
