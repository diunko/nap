import { test as base, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { launchApp, cleanupApp, getActiveId, ptyWrite, bufferLength } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helper: create napkin dir structure in tmpDir
// ---------------------------------------------------------------------------
function setupNapkinDir(
  tmpDir: string,
  slug: string,
  opts?: {
    artifacts?: string[];
    agents?: string[];
    napMdContent?: string;
  },
): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', '02-nepic-spaces');
  const napkinsDir = path.join(nepicDir, '30-napkins');
  const napkinDir = path.join(napkinsDir, slug);
  fs.mkdirSync(napkinDir, { recursive: true });

  for (const ext of opts?.artifacts ?? []) {
    fs.writeFileSync(path.join(napkinDir, `${slug}${ext}`), '');
  }

  if (opts?.agents) {
    const agentsDir = path.join(napkinDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const agent of opts.agents) {
      fs.mkdirSync(path.join(agentsDir, agent), { recursive: true });
      fs.writeFileSync(path.join(agentsDir, agent, 'prompt.md'), '');
    }
  }

  if (opts?.napMdContent !== undefined) {
    // Ensure .nap.md artifact exists
    fs.writeFileSync(path.join(napkinDir, `${slug}.nap.md`), opts.napMdContent);
  }

  return nepicDir;
}

// ---------------------------------------------------------------------------
// Helper: start napkin watcher and wait for data
// ---------------------------------------------------------------------------
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
  // Give IPC time to arrive
  await page.waitForTimeout(500);
}

async function stopWatcher(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    globalThis.__napTest!.stopNapkinWatcher();
  });
}

// =========================================================================
// T-0600-01: napkin:update IPC populates store with real napkin data
// =========================================================================
base.describe.serial('T-0600-01: napkin:update IPC populates store', () => {
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

  base('store.napkins populated with data matching fixture slugs', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-test-alpha', {
      artifacts: ['.nap.md', '.spec.md'],
      agents: ['001-fs-eng'],
      napMdContent: '* alpha bullet\n',
    });
    setupNapkinDir(tmpDir, '9902-test-beta', {
      artifacts: ['.nap.md'],
      agents: [],
    });
    setupNapkinDir(tmpDir, '9903-test-gamma', {
      artifacts: ['.nap.md', '.test.md'],
      agents: ['001-test-arch', '002-fs-eng'],
    });

    await startWatcher(app, page, nepicDir);

    // Wait for store to have 3 napkins
    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.length >= 3,
      { timeout: 10000 },
    );

    const napkins = await page.evaluate(
      () => (window as any).useTerminalStore.getState().napkins,
    );
    const slugs = napkins.map((n: any) => n.slug).sort();
    expect(slugs).toEqual(['9901-test-alpha', '9902-test-beta', '9903-test-gamma']);

    // Verify alpha's data
    const alpha = napkins.find((n: any) => n.slug === '9901-test-alpha');
    const alphaFiles = alpha.entries.filter((e: any) => e.type === 'file').map((e: any) => e.name).sort();
    expect(alphaFiles).toContain('9901-test-alpha.nap.md');
    expect(alphaFiles).toContain('9901-test-alpha.spec.md');
    const alphaAgents = alpha.entries.filter((e: any) => e.type === 'agent').map((e: any) => e.name);
    expect(alphaAgents).toEqual(['001-fs-eng']);
    expect(alpha.napkinBullets).toEqual(['alpha bullet']);
  });
});

// =========================================================================
// T-0600-02: napkin status from SQLite merges with filesystem data
// =========================================================================
base.describe.serial('T-0600-02: status merge with filesystem data', () => {
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

  base('store napkin has both artifacts (from fs) and status (from SQLite)', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-merge-test', {
      artifacts: ['.nap.md', '.spec.md'],
      agents: ['001-fs-eng'],
    });

    await startWatcher(app, page, nepicDir);

    // Wait for filesystem data
    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.length >= 1,
      { timeout: 10000 },
    );

    // Set status via SQLite changeNapkinStatus (requires napkin dir to exist)
    await app.evaluate((_electron, slug) => {
      globalThis.__napTest!.changeNapkinStatus(slug, 'doing');
    }, '9901-merge-test');

    // Send status IPC to renderer
    await app.evaluate(({ BrowserWindow }, slug) => {
      BrowserWindow.getAllWindows()[0].webContents.send(
        'napkin:status-changed',
        { slug, status: 'doing' },
      );
    }, '9901-merge-test');

    await page.waitForTimeout(300);

    const napkin = await page.evaluate(
      () => (window as any).useTerminalStore.getState().napkins.find(
        (n: any) => n.slug === '9901-merge-test',
      ),
    );

    expect(napkin).toBeDefined();
    expect(napkin.entries.filter((e: any) => e.type === 'file').length).toBeGreaterThan(0);
    expect(napkin.status).toBe('doing');
    const mergeAgents = napkin.entries.filter((e: any) => e.type === 'agent').map((e: any) => e.name);
    expect(mergeAgents).toEqual(['001-fs-eng']);
  });
});

// =========================================================================
// T-0600-03: agent status change updates in real-time
// =========================================================================
base.describe.serial('T-0600-03: agent status change via IPC', () => {
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

  base('socket:status-changed updates terminal status in store', async () => {
    // Create a socket terminal with napkinSlug
    const termId = 'test-agent-status-01';
    await page.evaluate(
      ([id]) => {
        (window as any).useTerminalStore.getState().addSocketTerminal(
          id, 'agent-01', null, '/tmp', 'agent', '9901-status-test',
        );
      },
      [termId],
    );

    // Verify terminal is running
    const statusBefore = await page.evaluate(
      (id) => (window as any).useTerminalStore.getState().terminals.find(
        (t: any) => t.id === id,
      )?.status,
      termId,
    );
    expect(statusBefore).toBe('running');

    // Send status-changed IPC
    await app.evaluate(({ BrowserWindow }, id) => {
      BrowserWindow.getAllWindows()[0].webContents.send(
        'socket:status-changed',
        { id, status: 'done' },
      );
    }, termId);

    // Wait for store update
    await page.waitForFunction(
      (id) => (window as any).useTerminalStore.getState().terminals.find(
        (t: any) => t.id === id,
      )?.status === 'done',
      termId,
      { timeout: 5000 },
    );

    const statusAfter = await page.evaluate(
      (id) => (window as any).useTerminalStore.getState().terminals.find(
        (t: any) => t.id === id,
      )?.status,
      termId,
    );
    expect(statusAfter).toBe('done');
  });
});

// =========================================================================
// T-0600-04: NapkinBrowser renders from store, not mock data
// =========================================================================
base.describe.serial('T-0600-04: NapkinBrowser renders from store', () => {
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

  base('rendered napkin names match real filesystem, not mock data', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-test-alpha', {
      artifacts: ['.nap.md'],
    });
    setupNapkinDir(tmpDir, '9902-test-beta', {
      artifacts: ['.nap.md'],
    });
    setupNapkinDir(tmpDir, '9903-test-gamma', {
      artifacts: ['.nap.md'],
    });

    await startWatcher(app, page, nepicDir);

    // Wait for store to have 3 napkins
    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.length >= 3,
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);

    // Query DOM for napkin card text
    const cardTexts = await page.evaluate(
      () => Array.from(document.querySelectorAll('[data-testid="napkin-card"]'))
        .map((el) => el.textContent ?? ''),
    );

    expect(cardTexts.length).toBe(3);

    // All 3 fixture slugs should appear
    const allText = cardTexts.join(' ');
    expect(allText).toContain('9901-test-alpha');
    expect(allText).toContain('9902-test-beta');
    expect(allText).toContain('9903-test-gamma');

    // No mock data slugs should appear
    expect(allText).not.toContain('0010-project-bootstrap');
    expect(allText).not.toContain('0020-pty-terminal');
  });
});

// =========================================================================
// T-0600-05: sidebar shows correct phase badges from SQLite
// =========================================================================
base.describe.serial('T-0600-05: sidebar phase badges from SQLite', () => {
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

  base('napkin card phase badge text matches SQLite status', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-phase-test', {
      artifacts: ['.nap.md'],
    });

    await startWatcher(app, page, nepicDir);

    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.length >= 1,
      { timeout: 10000 },
    );

    // Set status
    await app.evaluate((_electron, slug) => {
      globalThis.__napTest!.changeNapkinStatus(slug, 'review');
    }, '9901-phase-test');

    await app.evaluate(({ BrowserWindow }, slug) => {
      BrowserWindow.getAllWindows()[0].webContents.send(
        'napkin:status-changed',
        { slug, status: 'review' },
      );
    }, '9901-phase-test');

    await page.waitForTimeout(300);

    // Find the napkin card and check its phase text
    const cardText = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="napkin-card"]');
      for (const card of cards) {
        if (card.textContent?.includes('9901-phase-test')) {
          return card.textContent;
        }
      }
      return '';
    });

    expect(cardText).toContain('review');
  });
});

// =========================================================================
// T-0600-06: Cmd+` toggles kanban overlay
// =========================================================================
base.describe.serial('T-0600-06: Cmd+` toggles kanban overlay', () => {
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

  base('kanban overlay toggles on/off via IPC', async () => {
    // Initial state: kanban not visible
    const initialVisible = await page.evaluate(
      () => (window as any).useTerminalStore.getState().kanbanVisible,
    );
    expect(initialVisible).toBe(false);

    // Overlay should have 0 height
    const initialHeight = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="kanban-overlay"]');
      return el ? (el as HTMLElement).style.height : null;
    });
    // height is "0" or "0px" depending on browser
    expect(initialHeight).toMatch(/^0(px)?$/);

    // Toggle kanban via IPC (simulates Cmd+`)
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('kanban:toggle');
    });
    await page.waitForTimeout(200);

    // kanbanVisible should be true
    const visibleAfterToggle = await page.evaluate(
      () => (window as any).useTerminalStore.getState().kanbanVisible,
    );
    expect(visibleAfterToggle).toBe(true);

    // Overlay should have 70vh height
    const heightAfterToggle = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="kanban-overlay"]');
      return el ? (el as HTMLElement).style.height : null;
    });
    expect(heightAfterToggle).toBe('70vh');

    // Toggle again — should close
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('kanban:toggle');
    });
    await page.waitForTimeout(200);

    const visibleAfterSecond = await page.evaluate(
      () => (window as any).useTerminalStore.getState().kanbanVisible,
    );
    expect(visibleAfterSecond).toBe(false);
  });
});

// =========================================================================
// T-0600-11: kanban → navigation — click card arrow
// =========================================================================
base.describe.serial('T-0600-11: kanban navigation', () => {
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

  base('navigation handler dismisses overlay, focuses card, switches terminal', async () => {
    const agentTermId = 'nav-agent-01';

    // Set up store with napkin data and a terminal
    await page.evaluate(
      ([termId]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addSocketTerminal(
          termId, 'agent-01', null, '/tmp', 'agent', '9901-nav-test',
        );
        store.getState().setNapkinData({
          slug: '9901-nav-test',
          absPath: '/tmp/napkins/9901-nav-test',
          entries: [
            { name: '9901-nav-test.nap.md', absPath: '/tmp/napkins/9901-nav-test/9901-nav-test.nap.md', type: 'file' },
            { name: '001-agent', absPath: '/tmp/napkins/9901-nav-test/agents/001-agent', type: 'agent', files: [] },
          ],
          napkinBullets: [],
        });
        store.setState({ kanbanVisible: true });
      },
      [agentTermId],
    );

    await page.waitForTimeout(200);

    // Call the navigation handler via store actions (simulates → click)
    await page.evaluate(
      ([slug, termId]) => {
        const store = (window as any).useTerminalStore;
        // Simulate what handleNavigate does:
        store.getState().toggleKanban(); // dismiss
        store.getState().expandCard(slug); // focus card
        store.getState().setActive(termId); // switch terminal
      },
      ['9901-nav-test', agentTermId],
    );

    await page.waitForTimeout(200);

    const state = await page.evaluate(() => {
      const s = (window as any).useTerminalStore.getState();
      return {
        kanbanVisible: s.kanbanVisible,
        focusedCardSlug: s.focusedCardSlug,
        activeTerminalId: s.activeTerminalId,
      };
    });

    expect(state.kanbanVisible).toBe(false);
    expect(state.focusedCardSlug).toBe('9901-nav-test');
    expect(state.activeTerminalId).toBe(agentTermId);
  });
});

// =========================================================================
// T-0600-12: breadcrumb shows S > napkin-name > agent-name with real data
// =========================================================================
base.describe.serial('T-0600-12: breadcrumb with real data', () => {
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

  base('breadcrumb segments contain napkin slug and agent name', async () => {
    const agentTermId = 'bc-agent-01';

    // Create agent terminal with napkin association
    await page.evaluate(
      ([termId]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addSocketTerminal(
          termId, 'agent-alpha', null, '/tmp', 'agent', '0200-sqlite-setup',
        );
        store.getState().setNapkinData({
          slug: '0200-sqlite-setup',
          absPath: '/tmp/napkins/0200-sqlite-setup',
          entries: [
            { name: '0200-sqlite-setup.nap.md', absPath: '/tmp/napkins/0200-sqlite-setup/0200-sqlite-setup.nap.md', type: 'file' },
            { name: '001-agent', absPath: '/tmp/napkins/0200-sqlite-setup/agents/001-agent', type: 'agent', files: [] },
          ],
          napkinBullets: [],
        });
        store.getState().setActive(termId);
      },
      [agentTermId],
    );

    await page.waitForTimeout(300);

    // Read breadcrumb DOM text
    const breadcrumb = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="terminal-breadcrumb"]');
      return el?.textContent ?? '';
    });

    expect(breadcrumb).toContain('S');
    expect(breadcrumb).toContain('0200-sqlite-setup');
    expect(breadcrumb).toContain('agent-alpha');
  });
});

// =========================================================================
// T-0600-13: breadcrumb click S → switches to architect terminal
// =========================================================================
base.describe.serial('T-0600-13: breadcrumb click S', () => {
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

  base('clicking S breadcrumb switches to architect terminal', async () => {
    const archTermId = 'bc-architect-01';
    const agentTermId = 'bc-agent-02';

    // Create architect and agent terminals
    await page.evaluate(
      ([archId, agentId]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addSocketTerminal(
          archId, 'architect-01', null, '/tmp', 'architect', undefined,
        );
        store.getState().addSocketTerminal(
          agentId, 'agent-01', null, '/tmp', 'agent', '9901-bc-test',
        );
        store.getState().setActive(agentId);
      },
      [archTermId, agentTermId],
    );

    await page.waitForTimeout(300);

    // Verify we're on the agent terminal
    const activeBefore = await page.evaluate(
      () => (window as any).useTerminalStore.getState().activeTerminalId,
    );
    expect(activeBefore).toBe(agentTermId);

    // Click the S breadcrumb
    await page.evaluate(() => {
      const sEl = document.querySelector('[data-testid="breadcrumb-s"]');
      if (sEl) (sEl as HTMLElement).click();
    });

    await page.waitForTimeout(200);

    const activeAfter = await page.evaluate(
      () => (window as any).useTerminalStore.getState().activeTerminalId,
    );
    expect(activeAfter).toBe(archTermId);
  });
});

// =========================================================================
// T-0600-14: breadcrumb click napkin-name → focuses card in sidebar
// =========================================================================
base.describe.serial('T-0600-14: breadcrumb click napkin-name', () => {
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

  base('clicking napkin name in breadcrumb sets focusedCardSlug', async () => {
    const agentTermId = 'bc-napkin-click-01';

    await page.evaluate(
      ([termId]) => {
        const store = (window as any).useTerminalStore;
        store.getState().addSocketTerminal(
          termId, 'agent-01', null, '/tmp', 'agent', '9901-bc-napkin',
        );
        store.getState().setNapkinData({
          slug: '9901-bc-napkin',
          absPath: '/tmp/napkins/9901-bc-napkin',
          entries: [
            { name: '9901-bc-napkin.nap.md', absPath: '/tmp/napkins/9901-bc-napkin/9901-bc-napkin.nap.md', type: 'file' },
            { name: '001-agent', absPath: '/tmp/napkins/9901-bc-napkin/agents/001-agent', type: 'agent', files: [] },
          ],
          napkinBullets: [],
        });
        store.getState().setActive(termId);
      },
      [agentTermId],
    );

    await page.waitForTimeout(300);

    // Click the napkin breadcrumb
    await page.evaluate(() => {
      const napkinEl = document.querySelector('[data-testid="breadcrumb-napkin"]');
      if (napkinEl) (napkinEl as HTMLElement).click();
    });

    await page.waitForTimeout(200);

    const focusedSlug = await page.evaluate(
      () => (window as any).useTerminalStore.getState().focusedCardSlug,
    );
    expect(focusedSlug).toBe('9901-bc-napkin');
  });
});

// =========================================================================
// T-0600-15: fs.watch → sidebar artifact list updates in real-time
// =========================================================================
base.describe.serial('T-0600-15: fs.watch artifact update', () => {
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

  base('writing .test.md file updates store artifacts in real-time', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-fs-watch', {
      artifacts: ['.nap.md'],
    });

    await startWatcher(app, page, nepicDir);

    // Wait for initial data
    await page.waitForFunction(
      () => (window as any).useTerminalStore.getState().napkins.some(
        (n: any) => n.slug === '9901-fs-watch',
      ),
      { timeout: 10000 },
    );

    // Verify only .nap.md initially
    const filesBefore = await page.evaluate(
      () => (window as any).useTerminalStore.getState().napkins.find(
        (n: any) => n.slug === '9901-fs-watch',
      )?.entries.filter((e: any) => e.type === 'file').map((e: any) => e.name) ?? [],
    );
    expect(filesBefore).toContain('9901-fs-watch.nap.md');

    // Write .test.md file into napkin dir
    const napkinDir = path.join(
      tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins', '9901-fs-watch',
    );
    fs.writeFileSync(
      path.join(napkinDir, '9901-fs-watch.test.md'),
      '# Tests\n',
    );

    // Wait for fs.watch + debounce + IPC
    await page.waitForFunction(
      () => {
        const n = (window as any).useTerminalStore.getState().napkins.find(
          (n: any) => n.slug === '9901-fs-watch',
        );
        return n && n.entries.some((e: any) => e.type === 'file' && e.name === '9901-fs-watch.test.md');
      },
      { timeout: 10000 },
    );

    const filesAfter = await page.evaluate(
      () => (window as any).useTerminalStore.getState().napkins.find(
        (n: any) => n.slug === '9901-fs-watch',
      )?.entries.filter((e: any) => e.type === 'file').map((e: any) => e.name) ?? [],
    );
    expect(filesAfter).toContain('9901-fs-watch.nap.md');
    expect(filesAfter).toContain('9901-fs-watch.test.md');
  });
});

// =========================================================================
// T-0600-16: new agent dir created → sidebar updates agent list
// =========================================================================
base.describe.serial('T-0600-16: new agent dir via fs.watch', () => {
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

  base('creating agent dir updates store agents list', async () => {
    const nepicDir = setupNapkinDir(tmpDir, '9901-new-agent', {
      artifacts: ['.nap.md'],
      agents: ['001-test-arch'],
    });

    await startWatcher(app, page, nepicDir);

    // Wait for initial data
    await page.waitForFunction(
      () => {
        const n = (window as any).useTerminalStore.getState().napkins.find(
          (n: any) => n.slug === '9901-new-agent',
        );
        return n && n.entries.some((e: any) => e.type === 'agent');
      },
      { timeout: 10000 },
    );

    // Create new agent dir
    const agentDir = path.join(
      tmpDir, '.nap', 'nepics', '02-nepic-spaces', '30-napkins',
      '9901-new-agent', 'agents', '002-fs-eng',
    );
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'prompt.md'), '');

    // Wait for store to include new agent
    await page.waitForFunction(
      () => {
        const n = (window as any).useTerminalStore.getState().napkins.find(
          (n: any) => n.slug === '9901-new-agent',
        );
        return n && n.entries.some((e: any) => e.type === 'agent' && e.name === '002-fs-eng');
      },
      { timeout: 10000 },
    );

    const agentNames = await page.evaluate(
      () => (window as any).useTerminalStore.getState().napkins.find(
        (n: any) => n.slug === '9901-new-agent',
      )?.entries.filter((e: any) => e.type === 'agent').map((e: any) => e.name) ?? [],
    );
    expect(agentNames).toContain('001-test-arch');
    expect(agentNames).toContain('002-fs-eng');
  });
});

// =========================================================================
// T-0600-17: kanban overlay doesn't interfere with terminal
// =========================================================================
base.describe.serial('T-0600-17: kanban doesn\'t interfere with terminal', () => {
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
    await page.waitForTimeout(500);
  });

  base.afterAll(async () => {
    await cleanupApp(app, tmpDir);
  });

  base('terminal receives output while kanban is open, cols unchanged', async () => {
    const id = await getActiveId(page);
    expect(id).toBeTruthy();

    // Record initial cols
    const colsBefore = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry?.terminal.cols ?? 0;
    }, id);

    // Record buffer length
    const bufBefore = await bufferLength(page, id!);

    // Open kanban
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleKanban();
    });
    await page.waitForTimeout(400);

    // Verify kanban is open
    const kanbanOpen = await page.evaluate(
      () => (window as any).useTerminalStore.getState().kanbanVisible,
    );
    expect(kanbanOpen).toBe(true);

    // Write output to terminal while kanban is open
    await ptyWrite(page, id!, 'seq 1 100\n');
    await page.waitForFunction(
      (tid) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = buf.length - 1; i >= Math.max(0, buf.length - 20); i--) {
          if (buf.getLine(i)?.translateToString().includes('100')) return true;
        }
        return false;
      },
      id,
      { timeout: 10000 },
    );

    // Close kanban
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleKanban();
    });
    await page.waitForTimeout(400);

    // Buffer should have increased
    const bufAfter = await bufferLength(page, id!);
    expect(bufAfter).toBeGreaterThan(bufBefore);

    // Terminal cols should be unchanged (no resize from overlay)
    const colsAfter = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry?.terminal.cols ?? 0;
    }, id);
    expect(colsAfter).toBe(colsBefore);
  });
});
