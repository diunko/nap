import { test as base, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { launchApp, cleanupApp } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function setupNapkinDir(
  tmpDir: string,
  slug: string,
  opts?: {
    artifacts?: string[];
    agents?: Record<string, string[]>;
    napMdContent?: string;
    extraFiles?: string[];
    subdirs?: Record<string, string[]>;
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
    for (const [agent, files] of Object.entries(opts.agents)) {
      const agentDir = path.join(agentsDir, agent);
      fs.mkdirSync(agentDir, { recursive: true });
      for (const f of files) {
        fs.writeFileSync(path.join(agentDir, f), `# ${f}`);
      }
    }
  }

  if (opts?.subdirs) {
    for (const [dir, files] of Object.entries(opts.subdirs)) {
      const dirPath = path.join(napkinDir, dir);
      fs.mkdirSync(dirPath, { recursive: true });
      for (const f of files) {
        fs.writeFileSync(path.join(dirPath, f), `# ${f}`);
      }
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

async function startWatcher(
  app: ElectronApplication,
  page: Page,
  nepicDir: string,
): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }, dir) => {
    const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
    const win = BrowserWindow.getAllWindows()[0];
    stopNapkinWatcher();
    await startNapkinWatcher(dir, win);
  }, nepicDir);
  await page.waitForTimeout(500);
}

async function stopWatcher(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    globalThis.__napTest!.stopNapkinWatcher();
  });
}

// =========================================================================
// T-1200-01: readNapkinDir returns all files, not just known extensions
// =========================================================================
base.describe.serial('T-1200-01: readNapkinDir returns all files', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('entries include arbitrary files (random.txt, notes.log) as type=file', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1201-all-files', {
      artifacts: ['.nap.md', '.spec.md'],
      extraFiles: ['random.txt', 'notes.log'],
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1201-all-files'] as [string, string]);

    const fileEntries = result.entries.filter((e: any) => e.type === 'file');
    const fileNames = fileEntries.map((e: any) => e.name).sort();

    expect(fileNames).toContain('1201-all-files.nap.md');
    expect(fileNames).toContain('1201-all-files.spec.md');
    expect(fileNames).toContain('random.txt');
    expect(fileNames).toContain('notes.log');
    expect(fileEntries).toHaveLength(4);
  });
});

// =========================================================================
// T-1200-02: readNapkinDir sets absPath on every entry
// =========================================================================
base.describe.serial('T-1200-02: readNapkinDir sets absPath on every entry', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('every entry (file, agent, dir) has correct absolute absPath', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1202-abspath', {
      artifacts: ['.nap.md'],
      agents: { '001-test-arch': ['prompt.md', 'response.md'] },
      subdirs: { research: ['notes.md'] },
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1202-abspath'] as [string, string]);

    // Snapshot itself has absPath
    expect(result.absPath.startsWith('/')).toBe(true);
    expect(result.absPath).toContain('1202-abspath');

    // Every entry has absPath starting with snapshot absPath
    for (const entry of result.entries) {
      expect(typeof entry.absPath).toBe('string');
      expect(entry.absPath.startsWith('/')).toBe(true);
      expect(entry.absPath.startsWith(result.absPath)).toBe(true);

      // Agent and dir entries have nested files with absPath
      if (entry.type === 'agent' || entry.type === 'dir') {
        for (const f of (entry as any).files) {
          expect(f.absPath.startsWith('/')).toBe(true);
        }
      }
    }
  });
});

// =========================================================================
// T-1200-03: agent dirs promoted as type='agent' with nested files
// =========================================================================
base.describe.serial('T-1200-03: agent dirs promoted as type=agent with files', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('agents/ children are NapkinAgentEntry with files[], agents/ dir itself absent', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1203-agents', {
      agents: { '001-test-arch': ['prompt.md', 'response.md'] },
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1203-agents'] as [string, string]);

    // Agent entry exists
    const agent = result.entries.find((e: any) => e.name === '001-test-arch');
    expect(agent).toBeDefined();
    expect(agent.type).toBe('agent');
    expect(agent.files).toHaveLength(2);
    expect(agent.files.map((f: any) => f.name).sort()).toEqual(['prompt.md', 'response.md']);

    // Each file has absPath
    for (const f of agent.files) {
      expect(f.type).toBe('file');
      expect(f.absPath.startsWith('/')).toBe(true);
    }

    // agents/ dir itself should NOT appear in entries
    const agentsDir = result.entries.find((e: any) => e.name === 'agents');
    expect(agentsDir).toBeUndefined();
  });
});

// =========================================================================
// T-1200-04: non-agent subdirs captured as type='dir'
// =========================================================================
base.describe.serial('T-1200-04: non-agent subdirs as type=dir', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('research/ subdir captured as NapkinDirEntry with files', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1204-subdirs', {
      subdirs: { research: ['competitor-analysis.md'] },
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1204-subdirs'] as [string, string]);

    const researchDir = result.entries.find((e: any) => e.name === 'research');
    expect(researchDir).toBeDefined();
    expect(researchDir.type).toBe('dir');
    expect(researchDir.files).toHaveLength(1);
    expect(researchDir.files[0].name).toBe('competitor-analysis.md');
    expect(researchDir.files[0].type).toBe('file');
    expect(researchDir.files[0].absPath.startsWith('/')).toBe(true);
  });
});

// =========================================================================
// T-1200-05: napkinBullets still extracted from .nap.md
// =========================================================================
base.describe.serial('T-1200-05: napkinBullets extracted from .nap.md', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('top-level bullets extracted, nested excluded', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1205-bullets', {
      napMdContent: '* bullet one\n* bullet two\n  * nested\n',
    });

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1205-bullets'] as [string, string]);

    expect(result.napkinBullets).toEqual(['bullet one', 'bullet two']);
  });
});

// =========================================================================
// T-1200-06: empty napkin dir returns empty entries
// =========================================================================
base.describe.serial('T-1200-06: empty napkin dir', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('empty dir returns entries=[], napkinBullets=[], absPath set', async () => {
    const napkinsDir = setupNapkinDir(tmpDir, '1206-empty', {});

    const result = await app.evaluate(async (_electron, args) => {
      const [dir, slug] = args;
      return globalThis.__napTest!.readNapkinDir(dir, slug);
    }, [napkinsDir, '1206-empty'] as [string, string]);

    expect(result.entries).toEqual([]);
    expect(result.napkinBullets).toEqual([]);
    expect(result.absPath).toContain('1206-empty');
    expect(result.absPath.startsWith('/')).toBe(true);
  });
});

// =========================================================================
// T-1200-10: NapkinBrowser renders arbitrary files in focused view
// =========================================================================
base.describe.serial('T-1200-10: NapkinBrowser renders arbitrary files in focused view', () => {
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

  base('both random.txt and .nap.md visible as * bullet items when card focused', async () => {
    // Set store with NapkinSnapshot containing arbitrary files
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore;
      store.getState().setNapkinData({
        slug: '1210-arbitrary',
        absPath: '/tmp/1210-arbitrary',
        entries: [
          { name: '1210-arbitrary.nap.md', absPath: '/tmp/1210-arbitrary/1210-arbitrary.nap.md', type: 'file' },
          { name: 'random.txt', absPath: '/tmp/1210-arbitrary/random.txt', type: 'file' },
          { name: 'scratch.py', absPath: '/tmp/1210-arbitrary/scratch.py', type: 'file' },
        ],
        napkinBullets: [],
      });
      // Focus the card
      store.getState().expandCard('1210-arbitrary');
    });

    await page.waitForTimeout(300);

    // Query DOM for file names in the napkin card
    const fileTexts = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="napkin-card"]');
      for (const card of cards) {
        if (card.textContent?.includes('1210-arbitrary')) {
          // Collect all text content from the card body
          return card.textContent;
        }
      }
      return '';
    });

    expect(fileTexts).toContain('1210-arbitrary.nap.md');
    expect(fileTexts).toContain('random.txt');
    expect(fileTexts).toContain('scratch.py');
  });
});

// =========================================================================
// T-1200-11: extended view shows hover controls (copy, open) with absPath
// =========================================================================
base.describe.serial('T-1200-11: extended view hover controls with absPath', () => {
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

  base('extended view file rows have copy/open controls, copy writes absPath', async () => {
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore;
      store.getState().setNapkinData({
        slug: '1211-controls',
        absPath: '/tmp/1211-controls',
        entries: [
          { name: '1211-controls.nap.md', absPath: '/tmp/1211-controls/1211-controls.nap.md', type: 'file' },
        ],
        napkinBullets: [],
      });
      store.getState().expandCard('1211-controls');
      store.getState().extendCard(); // extend to show controls
    });

    await page.waitForTimeout(300);

    // Find data-file-controls elements — should exist in extended view
    const controlsExist = await page.evaluate(() => {
      const controls = document.querySelectorAll('[data-file-controls]');
      return controls.length;
    });

    expect(controlsExist).toBeGreaterThan(0);

    // Simulate hover to make controls visible, then click copy
    const clipboardText = await page.evaluate(async () => {
      const rows = document.querySelectorAll('[data-file-controls]');
      if (rows.length === 0) return 'no-controls';

      // Make controls visible (simulate hover)
      const parent = rows[0].closest('div')!;
      parent.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // Find the copy button (⎘ = &#x2398;)
      const controls = rows[0];
      const copyBtn = controls.querySelectorAll('span')[0];
      if (!copyBtn) return 'no-copy-btn';

      // Mock clipboard
      let written = '';
      const origClip = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (t: string) => { written = t; },
          readText: origClip?.readText?.bind(origClip),
        },
        configurable: true,
      });

      copyBtn.click();

      // Restore
      Object.defineProperty(navigator, 'clipboard', { value: origClip, configurable: true });

      return written;
    });

    expect(clipboardText).toBe('/tmp/1211-controls/1211-controls.nap.md');
  });
});

// =========================================================================
// T-1200-12: extended view shows agent files with hover controls
// =========================================================================
base.describe.serial('T-1200-12: agent files with hover controls in extended view', () => {
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

  base('agent files render with copy/open controls in extended view', async () => {
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore;
      store.getState().setNapkinData({
        slug: '1212-agent-files',
        absPath: '/tmp/1212-agent-files',
        entries: [
          {
            name: '001-test-eng',
            absPath: '/tmp/1212-agent-files/agents/001-test-eng',
            type: 'agent',
            files: [
              { name: 'prompt.md', absPath: '/tmp/1212-agent-files/agents/001-test-eng/prompt.md', type: 'file' },
              { name: 'response.md', absPath: '/tmp/1212-agent-files/agents/001-test-eng/response.md', type: 'file' },
            ],
          },
        ],
        napkinBullets: [],
      });
      store.getState().expandCard('1212-agent-files');
      store.getState().extendCard();
    });

    await page.waitForTimeout(300);

    // Agent files should be rendered with file controls
    const result = await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll('[data-testid="napkin-card"]'))
        .find((c) => c.textContent?.includes('1212-agent-files'));
      if (!card) return { error: 'card not found' };

      // Look for agent file controls
      const controls = card.querySelectorAll('[data-file-controls]');
      const fileTexts: string[] = [];
      // Collect visible file names from the card
      const text = card.textContent ?? '';
      return {
        controlCount: controls.length,
        hasPromptMd: text.includes('prompt.md'),
        hasResponseMd: text.includes('response.md'),
      };
    });

    expect(result.hasPromptMd).toBe(true);
    expect(result.hasResponseMd).toBe(true);
    // prompt.md and response.md should both have controls
    expect(result.controlCount).toBeGreaterThanOrEqual(2);
  });
});

// =========================================================================
// T-1200-15: fs.watch — new non-agent subdir appears in store
// =========================================================================
base.describe.serial('T-1200-15: fs.watch — new non-agent subdir appears', () => {
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
    await stopWatcher(app);
    await cleanupApp(app, tmpDir);
  });

  base('creating notes/ subdir with file updates store entries with type=dir', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-1215');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    const slug = '1215-subdir-watch';
    fs.mkdirSync(path.join(napkinsDir, slug), { recursive: true });
    fs.writeFileSync(path.join(napkinsDir, slug, `${slug}.nap.md`), '');

    await startWatcher(app, page, nepicDir);

    // Wait for initial data
    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.some(
        (n: any) => n.slug === '1215-subdir-watch',
      ),
      { timeout: 10000 },
    );

    // Create a non-agent subdir at runtime
    const notesDir = path.join(napkinsDir, slug, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, 'research.md'), '# Research');

    // Wait for dir entry to appear
    await page.waitForFunction(
      () => {
        const n = (window as any).useTerminalStore.getState().napkins.find(
          (n: any) => n.slug === '1215-subdir-watch',
        );
        return n && n.entries.some((e: any) => e.type === 'dir' && e.name === 'notes');
      },
      { timeout: 10000 },
    );

    const dirEntry = await page.evaluate(
      () => {
        const n = (window as any).useTerminalStore.getState().napkins.find(
          (n: any) => n.slug === '1215-subdir-watch',
        );
        return n?.entries.find((e: any) => e.type === 'dir' && e.name === 'notes');
      },
    );

    expect(dirEntry).toBeDefined();
    expect(dirEntry.type).toBe('dir');
    expect(dirEntry.files.length).toBeGreaterThanOrEqual(1);
    expect(dirEntry.files[0].name).toBe('research.md');
  });
});

// =========================================================================
// T-1200-16: full scan sends NapkinSnapshot array on startup
// =========================================================================
base.describe.serial('T-1200-16: full scan sends NapkinSnapshot array', () => {
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

  base('initial IPC payload is array of NapkinSnapshot with entries[], absPath', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-1216');
    const napkinsDir = path.join(nepicDir, '30-napkins');
    for (const slug of ['0100-alpha', '0200-beta']) {
      const d = path.join(napkinsDir, slug);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${slug}.nap.md`), `* ${slug} bullet\n`);
    }

    // Capture IPC updates
    await page.evaluate(() => {
      (window as any).__snapUpdates = [];
      window.electronAPI.onNapkinUpdate((data) => {
        (window as any).__snapUpdates.push(data);
      });
    });

    await app.evaluate(async ({ BrowserWindow }, dir) => {
      const { startNapkinWatcher, stopNapkinWatcher } = globalThis.__napTest!;
      const win = BrowserWindow.getAllWindows()[0];
      stopNapkinWatcher();
      await startNapkinWatcher(dir, win);
    }, nepicDir);

    await page.waitForTimeout(500);

    const updates = await page.evaluate(
      () => (window as any).__snapUpdates ?? [],
    );

    expect(updates.length).toBeGreaterThanOrEqual(1);
    const initial = updates[0];
    expect(Array.isArray(initial)).toBe(true);
    expect(initial.length).toBe(2);

    // Verify NapkinSnapshot shape
    for (const snap of initial) {
      expect(typeof snap.slug).toBe('string');
      expect(typeof snap.absPath).toBe('string');
      expect(Array.isArray(snap.entries)).toBe(true);
      expect(Array.isArray(snap.napkinBullets)).toBe(true);
    }

    // Clean up watcher
    await app.evaluate(() => {
      globalThis.__napTest!.stopNapkinWatcher();
    });
  });
});

// =========================================================================
// T-1200-18: performance — 40 napkins scan completes in <100ms
// =========================================================================
base.describe.serial('T-1200-18: performance — 40 napkins scan <100ms', () => {
  let app: ElectronApplication;
  let tmpDir: string;

  base.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('40 napkins with files, agents, subdirs scanned in <100ms', async () => {
    const nepicDir = path.join(tmpDir, 'nepic-1218');
    const napkinsDir = path.join(nepicDir, '30-napkins');

    // Create 40 napkin dirs, each with:
    // - 5 files
    // - 2 agents (3 files each)
    // - 1 subdir (2 files)
    const slugs: string[] = [];
    for (let i = 0; i < 40; i++) {
      const slug = `${String(i).padStart(4, '0')}-perf-${i}`;
      slugs.push(slug);
      const napkinDir = path.join(napkinsDir, slug);
      fs.mkdirSync(napkinDir, { recursive: true });

      // 5 files
      for (let f = 0; f < 5; f++) {
        fs.writeFileSync(path.join(napkinDir, `file-${f}.md`), `content ${f}`);
      }

      // 2 agents with 3 files each
      const agentsDir = path.join(napkinDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      for (let a = 0; a < 2; a++) {
        const agentDir = path.join(agentsDir, `00${a + 1}-agent-${a}`);
        fs.mkdirSync(agentDir, { recursive: true });
        for (let af = 0; af < 3; af++) {
          fs.writeFileSync(path.join(agentDir, `agent-file-${af}.md`), '');
        }
      }

      // 1 subdir with 2 files
      const subDir = path.join(napkinDir, 'research');
      fs.mkdirSync(subDir, { recursive: true });
      for (let sf = 0; sf < 2; sf++) {
        fs.writeFileSync(path.join(subDir, `sub-${sf}.md`), '');
      }
    }

    // Time the full scan — pass napkinsDir + slugs, use Date.now() for timing
    const elapsed = await app.evaluate(async (_electron, args) => {
      const [dir, slugList] = args;
      const { readNapkinDir } = globalThis.__napTest!;

      const start = Date.now();
      for (const slug of slugList) {
        await readNapkinDir(dir, slug);
      }
      const end = Date.now();
      return end - start;
    }, [napkinsDir, slugs] as [string, string[]]);

    expect(elapsed).toBeLessThan(100);
  });
});
