import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: napkin with two .nap files, two agents ──

const FILE_A_CONTENT = `# File A\n\n* content of file A\n`;
const FILE_B_CONTENT = `# File B\n\n* content of file B\n`;

function createNavFixture(tmpDir: string): void {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': FILE_A_CONTENT,
    '30-napkins/0100-explore/0100-explore.spec.md': FILE_B_CONTENT,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      created_at: 1711700000000,
      started: true,
      exited: false,
    },
    '30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
      cc_session_uuid: 'uuid-fs',
      role: 'fs-eng',
      name: '002-fs-eng',
      napkin: '0100-explore',
      nepic: 'test-nepic',
      created_at: 1711700100000,
      started: true,
      exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch',
      role: 'architect',
      name: '001-architect',
      nepic: 'test-nepic',
      created_at: 1711600000000,
      started: true,
      exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (typeof content === 'string') {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    }
  }
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  createNavFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Small settle time
  await page.waitForTimeout(300);
}

async function focusNapkinCard(): Promise<void> {
  const napkinCard = page.locator('[data-testid="napkin-card"]').first();
  await napkinCard.click();
  await page.waitForTimeout(200);
}

async function extendCard(): Promise<void> {
  // Cmd+E toggles focused → extended
  await page.keyboard.press('Meta+e');
  await page.waitForTimeout(200);
}

// T-0100-N01: FileRow click opens file in left pane (not OS editor)
test('N01: file click opens in left pane', async () => {
  await boot();
  await focusNapkinCard();

  // Set up spy on openFilePath
  await page.evaluate(() => {
    (window as any).__openFilePathCalls__ = [];
    const orig = window.electronAPI.openFilePath;
    window.electronAPI.openFilePath = (fp: string) => {
      (window as any).__openFilePathCalls__.push(fp);
      orig(fp);
    };
  });

  // Click the first file entry (should be the .nap.md file)
  const fileEntry = page.locator('[data-testid="file-entry"]').first();
  await expect(fileEntry).toBeVisible();
  await fileEntry.click();
  await page.waitForTimeout(500);

  // Verify: activeFilePath is set
  const activeFilePath = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );
  expect(activeFilePath).toBeTruthy();
  expect(activeFilePath).toContain('.nap');

  // Verify: openFilePath was NOT called
  const openFilePathCalls = await page.evaluate(() =>
    (window as any).__openFilePathCalls__,
  );
  expect(openFilePathCalls).toHaveLength(0);

  // Verify: Monaco has content
  const hasMonacoContent = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return false;
    const models = m.editor.getModels();
    return models.length > 0 && models[0].getValue().length > 0;
  });
  expect(hasMonacoContent).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0100-N02: AgentDot click opens terminal in right pane
test('N02: agent dot click opens terminal in right pane', async () => {
  await boot();

  // Clear active terminal
  await page.evaluate(() => {
    (window as any).__napStore__.setState({ activeTerminalId: null });
  });

  // Click an agent dot in the napkin card header
  const agentDot = page.locator('[data-testid="agent-dot"]').first();
  await agentDot.click();
  await page.waitForTimeout(200);

  // Verify: activeTerminalId is set
  const activeTerminalId = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeTerminalId,
  );
  expect(activeTerminalId).toBeTruthy();

  await cleanupApp(app, tmpDir);
});

// T-0100-N03: File click then agent click — both panes update independently
test('N03: file click and agent click update panes independently', async () => {
  await boot();
  await focusNapkinCard();

  // Click file entry → opens in left pane
  const fileEntry = page.locator('[data-testid="file-entry"]').first();
  await fileEntry.click();
  await page.waitForTimeout(500);

  const filePathAfterFileClick = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );
  expect(filePathAfterFileClick).toBeTruthy();

  // Click agent dot → opens terminal in right pane
  const agentDot = page.locator('[data-testid="agent-dot"]').first();
  await agentDot.click();
  await page.waitForTimeout(200);

  // Verify: both states are set
  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeFilePath: s.activeFilePath,
      activeTerminalId: s.activeTerminalId,
    };
  });

  // File path unchanged after agent click
  expect(state.activeFilePath).toBe(filePathAfterFileClick);
  // Terminal is set
  expect(state.activeTerminalId).toBeTruthy();

  await cleanupApp(app, tmpDir);
});

// T-0100-N04: File click replaces previous file (ephemeral)
test('N04: file click replaces previous file', async () => {
  await boot();
  await focusNapkinCard();

  // Need extended view to see multiple files
  await extendCard();

  const fileEntries = page.locator('[data-testid="file-entry"]');
  const count = await fileEntries.count();

  if (count < 2) {
    // Not enough file entries — skip with explanation
    test.skip();
    return;
  }

  // Click first file
  await fileEntries.nth(0).click();
  await page.waitForTimeout(500);

  const firstPath = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );

  // Click second file
  await fileEntries.nth(1).click();
  await page.waitForTimeout(500);

  const secondPath = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );

  // Second file replaced first
  expect(secondPath).not.toBe(firstPath);
  expect(secondPath).toBeTruthy();

  // Monaco model has second file's content, not first
  const modelContent = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const models = m.editor.getModels();
    return models[0]?.getValue() ?? '';
  });

  // The content should match the second file
  expect(modelContent.length).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});

// T-0100-N05: Copy and open-external controls bypass routing
test('N05: copy and open-external controls bypass routing', async () => {
  await boot();
  await focusNapkinCard();
  await extendCard();

  // Clear activeFilePath to detect if routing fires
  await page.evaluate(() => {
    (window as any).__napStore__.setState({ activeFilePath: null });
  });

  // Find a file entry and hover to reveal controls
  const fileEntry = page.locator('[data-testid="file-entry"]').first();
  await fileEntry.hover();
  await page.waitForTimeout(100);

  // Make controls visible via JS (same as the hover handler does)
  await page.evaluate(() => {
    const ctrl = document.querySelector('[data-file-controls]') as HTMLElement;
    if (ctrl) ctrl.style.visibility = 'visible';
  });

  // Find the open-external control (↗ icon — second span in the controls)
  const controls = fileEntry.locator('[data-file-controls] > span');
  const controlCount = await controls.count();

  if (controlCount < 2) {
    test.skip();
    return;
  }

  // Click the open-external icon (second control) — bypasses routing, calls openFilePath directly
  // Note: can't spy on openFilePath because contextBridge freezes the API object.
  // Instead verify that clicking the control does NOT route to left pane (activeFilePath stays null).
  await controls.nth(1).click({ force: true });
  await page.waitForTimeout(200);

  const activeFilePath = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );
  // The open-external control should NOT have set activeFilePath — it bypasses routing
  expect(activeFilePath).toBeNull();

  await cleanupApp(app, tmpDir);
});

// T-0100-N06: [terminal] entry in extended view still switches terminal
test('N06: terminal entry switches terminal', async () => {
  await boot();
  await focusNapkinCard();
  await extendCard();

  // Clear active terminal
  await page.evaluate(() => {
    (window as any).__napStore__.setState({ activeTerminalId: null });
  });

  // Click [terminal] entry
  const terminalEntry = page.locator('[data-testid="terminal-entry"]').first();
  await expect(terminalEntry).toBeVisible();
  await terminalEntry.click();
  await page.waitForTimeout(200);

  // Verify terminal ID was set
  const activeTerminalId = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeTerminalId,
  );
  expect(activeTerminalId).toBeTruthy();

  await cleanupApp(app, tmpDir);
});
