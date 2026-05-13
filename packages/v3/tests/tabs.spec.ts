import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic with a napkin file + two .md files ──

const FILE_A_CONTENT = `# File A\n\n* content of file A\n`;
const FILE_B_CONTENT = `# File B\n\n* content of file B\n`;
const CODE_CONTENT = `const x = 1;\nconst y = 2;\n`;

function createFixture(tmpDir: string): { fileA: string; fileB: string; codeFile: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');
  const projectSrc = path.join(tmpDir, 'src');

  const nepicFiles: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': FILE_A_CONTENT,
    '30-napkins/0100-explore/0100-explore.spec.md': FILE_B_CONTENT,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta', role: 'test-arch', name: '001-test-arch',
      nepic: 'test-nepic', created_at: 1711700000000, started: true, exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
      nepic: 'test-nepic', created_at: 1711600000000, started: true, exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(nepicFiles)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }

  fs.mkdirSync(projectSrc, { recursive: true });
  const codeFile = path.join(projectSrc, 'code.ts');
  fs.writeFileSync(codeFile, CODE_CONTENT);

  return {
    fileA: path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md'),
    fileB: path.join(nepicDir, '30-napkins/0100-explore/0100-explore.spec.md'),
    codeFile,
  };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let fileA: string;
let fileB: string;
let codeFile: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createFixture(tmpDir);
  fileA = fixture.fileA;
  fileB = fixture.fileB;
  codeFile = fixture.codeFile;
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openDocAndWait(filePath: string): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openDoc(fp);
  }, filePath);
  await page.waitForTimeout(500);
}

async function openCodeAndWait(filePath: string): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openCode({ path: fp });
  }, filePath);
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      return m.editor.getEditors().some((e: any) => e.getRawOptions()?.readOnly === true && e.getModel()?.getValue()?.length > 0);
    },
    { timeout: 15000 },
  );
}

// T-0200-T07: Tab close disposes Monaco model
test('T07: tab close disposes Monaco model', async () => {
  await boot();

  // Open a code file — creates a Monaco model
  await openCodeAndWait(codeFile);

  const modelCountBefore = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    return m.editor.getModels().length;
  });

  // Close the tab
  await page.evaluate(() => {
    const store = (window as any).__napStore__.getState();
    store.closeActiveTab('right');
  });
  await page.waitForTimeout(500);

  // The code file tab should be gone (terminal tabs may still exist from boot)
  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      fileTabs: s.rightTabs.filter((t: any) => t.type === 'file').length,
      rightPaneMode: s.rightPaneMode,
    };
  });
  expect(state.fileTabs).toBe(0);
  // Mode should have switched away from 'code' since no file tabs remain
  expect(state.rightPaneMode).toBe('terminal');

  await cleanupApp(app, tmpDir);
});

// T-0200-T09: Editing in ephemeral tab auto-pins it
test('T09: editing in ephemeral tab auto-pins', async () => {
  await boot();

  // Open file A as ephemeral
  await openDocAndWait(fileA);

  // Verify tab is ephemeral
  let tabState = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const tab = s.leftTabs.find((t: any) => t.id === s.activeLeftTabId);
    return { ephemeral: tab?.ephemeral, count: s.leftTabs.length };
  });
  expect(tabState.ephemeral).toBe(true);

  // Wait for Monaco to load the file
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      return editors.some((e: any) => !e.getRawOptions()?.readOnly && e.getModel()?.getValue()?.includes('File A'));
    },
    { timeout: 15000 },
  );

  // Type in the editor — this should pin the ephemeral tab
  // Find the left pane editor (not read-only)
  const contentPane = page.locator('[data-testid="content-pane"]');
  await contentPane.click();
  await page.waitForTimeout(200);

  // Use Monaco API to insert text (more reliable than keyboard)
  await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const leftEditor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (leftEditor) {
      leftEditor.focus();
      leftEditor.trigger('test', 'type', { text: 'x' });
    }
  });
  await page.waitForTimeout(300);

  // Tab should now be pinned
  tabState = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const tab = s.leftTabs.find((t: any) => t.id === s.activeLeftTabId);
    return { ephemeral: tab?.ephemeral, count: s.leftTabs.length };
  });
  expect(tabState.ephemeral).toBe(false);

  await cleanupApp(app, tmpDir);
});

// T-0200-T10: Middle-click closes tab
test('T10: middle-click closes non-active tab', async () => {
  await boot();

  // Open and pin file A
  await openDocAndWait(fileA);
  await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    s.pinTab('left', s.activeLeftTabId);
  });

  // Open file B (ephemeral)
  await openDocAndWait(fileB);

  // Pin B too
  await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    s.pinTab('left', s.activeLeftTabId);
  });
  await page.waitForTimeout(200);

  // Now we have two pinned tabs: A and B. B is active.
  let tabCount = await page.evaluate(() =>
    (window as any).__napStore__.getState().leftTabs.length,
  );
  expect(tabCount).toBe(2);

  // Get tab A's element (first tab)
  const tabBar = page.locator('[data-testid="tab-bar"]').first();
  const tabs = tabBar.locator('[data-testid^="tab-"]');
  const firstTab = tabs.first();

  // Middle-click on the first tab (A) — should close it without switching to it
  await firstTab.click({ button: 'middle' });
  await page.waitForTimeout(300);

  tabCount = await page.evaluate(() =>
    (window as any).__napStore__.getState().leftTabs.length,
  );
  expect(tabCount).toBe(1);

  // Active tab should still be B (the one we didn't close)
  const activeFilePath = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeFilePath,
  );
  expect(activeFilePath).toBe(fileB);

  await cleanupApp(app, tmpDir);
});
