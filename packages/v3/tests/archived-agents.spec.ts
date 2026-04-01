import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
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
