import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F8_FIXTURE,
} from './helpers';
import { F16_FIXTURE } from './fixtures';

let tmpDir: string;

// ── T-0620-30: Archived agent click → successor prompt shown ──

test('T-0620-30: click archived agent → successor prompt shown in terminal area', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F16_FIXTURE);

  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 5000 });

    // Wait for snapshot to populate
    await page.waitForFunction(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      return state.napkins.length > 0;
    }, {}, { timeout: 5000 });

    // Find the archived agent in the sidebar and click it
    // The archived agent (001-test-arch) should be clickable
    const napkinCard = page.locator('[data-testid="napkin-card"]').first();
    await napkinCard.click();

    // Wait for focused view to show agents
    await page.waitForSelector('[data-testid="browser-agent"]', { timeout: 3000 });

    // Find the archived agent row (001-test-arch) and click it
    const agentRows = page.locator('[data-testid="browser-agent"]');
    const archivedRow = agentRows.filter({ hasText: '001-test-arch' });
    await archivedRow.click();

    // Verify the terminal area shows the successor prompt
    await page.waitForSelector('[data-testid="successor-prompt"]', { timeout: 5000 });

    const promptText = await page.locator('[data-testid="successor-prompt"]').textContent();
    expect(promptText).toContain('Session expired');

    // Verify the button is present
    const btn = page.locator('[data-testid="successor-spawn-btn"]');
    await expect(btn).toBeVisible();

    // Verify the breadcrumb shows "archived"
    const breadcrumb = page.locator('[data-testid="terminal-breadcrumb"]');
    const breadcrumbText = await breadcrumb.textContent();
    expect(breadcrumbText).toContain('archived');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-0620-42: Archived dot is clickable ──

test('T-0620-42: archived dot is clickable and sets active terminal', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F16_FIXTURE);

  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 5000 });

    // Wait for snapshot
    await page.waitForFunction(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      return state.napkins.length > 0;
    }, {}, { timeout: 5000 });

    // Click the napkin card to expand it
    const napkinCard = page.locator('[data-testid="napkin-card"]').first();
    await napkinCard.click();

    // Click the archived agent's row
    const agentRows = page.locator('[data-testid="browser-agent"]');
    const archivedRow = agentRows.filter({ hasText: '001-test-arch' });
    await archivedRow.click();

    // Verify activeTerminalId changed to the archived agent
    const terminalId = await page.evaluate(() => {
      return (window as any).__napStore__.getState().activeTerminalId;
    });
    expect(terminalId).toBe('uuid-archived-ta');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-0620-41: Sidebar shows "archived" label for archived agent ──

test('T-0620-41: sidebar shows "archived" label for archived agent', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F16_FIXTURE);

  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 5000 });

    // Wait for snapshot
    await page.waitForFunction(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      return state.napkins.length > 0;
    }, {}, { timeout: 5000 });

    // Click the napkin card to expand
    const napkinCard = page.locator('[data-testid="napkin-card"]').first();
    await napkinCard.click();

    // Find the archived agent row — should show "archived" label
    const agentRows = page.locator('[data-testid="browser-agent"]');
    const archivedRow = agentRows.filter({ hasText: '001-test-arch' });
    const archivedText = await archivedRow.textContent();
    expect(archivedText).toContain('archived');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-0620-57: Imported agents appear in sidebar after app launch ──

test('T-0620-57: archived agents appear in sidebar with correct dot style', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F16_FIXTURE);

  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 5000 });

    // Wait for snapshot — should have agents including archived
    await page.waitForFunction(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      if (state.napkins.length === 0) return false;
      const agents = state.napkins[0].agents;
      return agents.length >= 2;
    }, {}, { timeout: 5000 });

    // Verify archived agent is in the snapshot with archived=true
    const archivedAgent = await page.evaluate(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      const agents = state.napkins[0].agents;
      return agents.find((a: any) => a.id === 'uuid-archived-ta');
    });
    expect(archivedAgent).toBeDefined();
    expect(archivedAgent.archived).toBe(true);

    // Verify the architect is also archived
    const archivedArch = await page.evaluate(() => {
      const store = (window as any).__napStore__;
      const state = store.getState();
      return state.architects.find((a: any) => a.id === 'uuid-archived-arch');
    });
    expect(archivedArch).toBeDefined();
    expect(archivedArch.archived).toBe(true);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-0620-31b: pty:resume click path — resume failure detection ──

test('T-0620-31b: pty:resume click → dead session → agent marked archived', async () => {
  tmpDir = makeTmpDir();
  // F8 has uuid-fs as started+exited — startAgents skips it (Case B).
  // Clicking it in the UI triggers pty:resume IPC.
  const nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();

    // Wait for app to finish loading — uuid-ta should be running (it's started+!exited)
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        return s?.napkins?.[0]?.agents?.some(
          (a: any) => a.id === 'uuid-ta' && a.running === true,
        );
      },
      {},
      { timeout: 15000 },
    );

    // Verify uuid-fs is NOT running (exited → startAgents skipped it)
    const fsRunningBefore = await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      const agent = s.napkins[0].agents.find((a: any) => a.id === 'uuid-fs');
      return { running: agent?.running, exited: agent?.exited };
    });
    expect(fsRunningBefore.running).toBe(false);
    expect(fsRunningBefore.exited).toBe(true);

    // Trigger pty:resume from the renderer — simulates user clicking the exited agent
    await page.evaluate(() => {
      (window as any).electronAPI.pty.resume('uuid-fs');
    });

    // Wait for uuid-fs to be running (pty:resume spawns cat in test mode)
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agent = s?.napkins?.[0]?.agents?.find((a: any) => a.id === 'uuid-fs');
        return agent?.running === true;
      },
      {},
      { timeout: 10000 },
    );

    // Mark terminal ready from renderer (simulates Terminal.tsx mounting)
    await page.evaluate(() => {
      (window as any).electronAPI.pty.ready('uuid-fs');
    });

    // Wait for the terminal to be marked ready in the pty manager
    const isReady = await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      for (let i = 0; i < 50; i++) {
        if ((ptyManager as any).readyTerminals?.has('uuid-fs')) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    });
    expect(isReady).toBe(true);

    // Write the error message to stdin — cat echoes it → output arrives at pty
    await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      ptyManager.write('uuid-fs', 'No conversation found with session ID: uuid-fs\n');
    });

    // Let cat echo the output back
    await page.waitForTimeout(500);

    // Kill the pty — triggers exit handler with fast timing + matching output
    await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      ptyManager.kill('uuid-fs');
    });

    // Wait for the agent to be marked archived (not just exited)
    // BUG: without the fix, pty:resume handler only calls setAgentExitedById
    // — no detection, so this will timeout
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agent = s?.napkins?.[0]?.agents?.find((a: any) => a.id === 'uuid-fs');
        return agent?.archived === true;
      },
      {},
      { timeout: 10000 },
    );

    // Verify the agent is archived
    const agentState = await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      const agent = s.napkins[0].agents.find((a: any) => a.id === 'uuid-fs');
      return { archived: agent?.archived, exited: agent?.exited, running: agent?.running };
    });

    expect(agentState.archived).toBe(true);
    expect(agentState.running).toBe(false);

    // Verify the marker on disk has archived=true
    const markerPath = path.join(
      nepicDir,
      '30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json',
    );
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.archived).toBe(true);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-0620-31: Resume failure → agent marked archived (Path B detection) ──

test('T-0620-31: resume fails with "No conversation found" → agent marked archived', async () => {
  tmpDir = makeTmpDir();
  const nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  const app = await launchApp(tmpDir);

  try {
    const page = await app.firstWindow();

    // Wait for uuid-ta to be running (it's started+!exited → gets resumed)
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        return s?.napkins?.[0]?.agents?.some(
          (a: any) => a.id === 'uuid-ta' && a.running === true,
        );
      },
      {},
      { timeout: 15000 },
    );

    // Wait for the terminal to be marked ready in the pty manager.
    // This is critical: markReady flushes the output buffer to the renderer.
    // If we write+kill before ready, the buffer still exists and detection
    // works even with the bug (false pass).
    const isReady = await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      for (let i = 0; i < 50; i++) {
        if ((ptyManager as any).readyTerminals?.has('uuid-ta')) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    });
    expect(isReady).toBe(true);

    // Write the error message to stdin. cat echoes it → output arrives at pty.
    // After markReady, output goes to renderer AND detection buffer (fix).
    // Without the fix, output only goes to renderer — detection buffer empty.
    await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      ptyManager.write('uuid-ta', 'No conversation found with session ID: uuid-ta\n');
    });

    // Let cat echo the output back
    await page.waitForTimeout(500);

    // Kill the pty — triggers exit handler with fast timing + matching output
    await app.evaluate(async () => {
      const ptyManager = (global as any).__napPtyManager__;
      ptyManager.kill('uuid-ta');
    });

    // Wait for the agent to be marked archived (not just exited)
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agent = s?.napkins?.[0]?.agents?.find((a: any) => a.id === 'uuid-ta');
        return agent?.archived === true;
      },
      {},
      { timeout: 10000 },
    );

    // Verify the agent is archived, not just exited
    const agentState = await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      const agent = s.napkins[0].agents.find((a: any) => a.id === 'uuid-ta');
      return { archived: agent?.archived, exited: agent?.exited, running: agent?.running };
    });

    expect(agentState.archived).toBe(true);
    expect(agentState.running).toBe(false);

    // Verify the marker on disk has archived=true
    const markerPath = path.join(
      nepicDir,
      '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json',
    );
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.archived).toBe(true);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});
