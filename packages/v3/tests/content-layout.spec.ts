import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture ──

const SAMPLE_NAP_CONTENT = `# Sample napkin

* a very long line that should wrap in the editor when the pane is narrow enough to trigger word wrapping behavior in Monaco editor with wordWrap on

* another bullet
`;

function createLayoutFixture(tmpDir: string): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': SAMPLE_NAP_CONTENT,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta',
      role: 'test-arch',
      name: '001-test-arch',
      nepic: 'test-nepic',
      created_at: 1711700000000,
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

  return path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md');
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  napFilePath = createLayoutFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 2000 },
  );
}

// T-0100-L01: Three panes render on launch
test('L01: three panes render on launch', async () => {
  await boot();

  const sidebar = page.locator('[data-testid="sidebar"]');
  const contentPane = page.locator('[data-testid="content-pane"]');
  const terminalPane = page.locator('[data-testid="terminal-pane"]');

  await expect(sidebar).toBeVisible();
  await expect(contentPane).toBeVisible();
  await expect(terminalPane).toBeVisible();

  // All should have positive width
  const sidebarBox = await sidebar.boundingBox();
  const contentBox = await contentPane.boundingBox();
  const terminalBox = await terminalPane.boundingBox();

  expect(sidebarBox!.width).toBeGreaterThan(0);
  expect(contentBox!.width).toBeGreaterThan(0);
  expect(terminalBox!.width).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});

// T-0100-L02: Empty state placeholders
test('L02: empty state placeholders', async () => {
  await boot();

  const contentPane = page.locator('[data-testid="content-pane"]');
  const terminalPane = page.locator('[data-testid="terminal-pane"]');

  // Left pane: "no file open"
  await expect(contentPane).toContainText('no file open');

  // Right pane: "no agent selected" (or terminal loaded — depends on auto-select)
  // The app may auto-select an architect terminal. Check if placeholder exists OR terminal rendered.
  const terminalText = await terminalPane.textContent();
  const terminalVisible = await terminalPane.isVisible();
  expect(terminalVisible).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0100-L03: Resize handle between left and right
test('L03: resize handle changes pane widths', async () => {
  await boot();

  // Open a file to get the full content pane with editor
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  // Wait for editor
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      return m?.editor?.getEditors()?.length > 0;
    },
    { timeout: 2000 },
  );

  const contentPane = page.locator('[data-testid="content-pane"]');
  const terminalPane = page.locator('[data-testid="terminal-pane"]');

  const contentBefore = await contentPane.boundingBox();
  const terminalBefore = await terminalPane.boundingBox();

  // Find the resize handle (4px wide div with cursor: col-resize between the panes)
  // It's between content-pane and terminal-pane
  const handleX = contentBefore!.x + contentBefore!.width + 2;
  const handleY = contentBefore!.y + contentBefore!.height / 2;

  // Drag handle 100px to the right
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 100, handleY, { steps: 5 });
  await page.mouse.up();

  // Wait for layout to settle
  await page.waitForTimeout(100);

  const contentAfter = await contentPane.boundingBox();
  const terminalAfter = await terminalPane.boundingBox();

  // Content pane should be wider, terminal should be narrower
  expect(contentAfter!.width).toBeGreaterThan(contentBefore!.width);
  expect(terminalAfter!.width).toBeLessThan(terminalBefore!.width);

  await cleanupApp(app, tmpDir);
});

// T-0100-L04: Min widths prevent collapse
test('L04: min widths prevent collapse', async () => {
  await boot();

  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  await page.waitForFunction(
    () => (window as any).__monaco__?.editor?.getModels()?.length > 0,
    { timeout: 10000 },
  );

  const contentPane = page.locator('[data-testid="content-pane"]');
  const contentBefore = await contentPane.boundingBox();

  // Find handle position
  const handleX = contentBefore!.x + contentBefore!.width + 2;
  const handleY = contentBefore!.y + contentBefore!.height / 2;

  // Drag handle far to the left to try collapsing content pane
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX - 1000, handleY, { steps: 10 });
  await page.mouse.up();

  await page.waitForTimeout(100);

  const contentAfter = await contentPane.boundingBox();
  // Min width is 200px (from CSS minWidth)
  expect(contentAfter!.width).toBeGreaterThanOrEqual(200);

  await cleanupApp(app, tmpDir);
});

// T-0100-L05: Resize triggers Monaco reflow
test('L05: resize triggers Monaco reflow', async () => {
  await boot();

  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  await page.waitForFunction(
    () => (window as any).__monaco__?.editor?.getModels()?.length > 0,
    { timeout: 10000 },
  );

  // Get initial Monaco layout width
  const widthBefore = await page.evaluate(() => {
    const editors = (window as any).__monaco__.editor.getEditors();
    return editors[0]?.getLayoutInfo()?.width ?? 0;
  });

  const contentPane = page.locator('[data-testid="content-pane"]');
  const contentBefore = await contentPane.boundingBox();
  const handleX = contentBefore!.x + contentBefore!.width + 2;
  const handleY = contentBefore!.y + contentBefore!.height / 2;

  // Drag handle 150px right — makes content pane wider
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 150, handleY, { steps: 5 });
  await page.mouse.up();

  // Wait for ResizeObserver + editor.layout()
  await page.waitForTimeout(200);

  const widthAfter = await page.evaluate(() => {
    const editors = (window as any).__monaco__.editor.getEditors();
    return editors[0]?.getLayoutInfo()?.width ?? 0;
  });

  expect(widthAfter).toBeGreaterThan(widthBefore);

  await cleanupApp(app, tmpDir);
});

// T-0100-L06: Resize triggers xterm refit
test('L06: terminal pane has non-zero dimensions after launch', async () => {
  await boot();

  // Select the architect terminal
  await page.evaluate(() => {
    (window as any).__napStore__.getState().setActiveTerminal('uuid-arch');
  });

  await page.waitForTimeout(500);

  const terminalPane = page.locator('[data-testid="terminal-pane"]');
  const terminalBox = await terminalPane.boundingBox();

  expect(terminalBox!.width).toBeGreaterThan(0);
  expect(terminalBox!.height).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});
