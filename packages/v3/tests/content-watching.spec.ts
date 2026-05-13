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

const INITIAL_CONTENT = `# Test file

* line 1
* line 2
* line 3
* line 4
* line 5
* line 6
* line 7
* line 8
* line 9
* line 10
* line 11
* line 12
* line 13
* line 14
* line 15
* line 16
* line 17
* line 18
* line 19
* line 20
* line 21
* line 22
* line 23
* line 24
* line 25
* line 26
* line 27
* line 28
* line 29
* line 30
* line 31
* line 32
* line 33
* line 34
* line 35
* line 36
* line 37
* line 38
* line 39
* line 40
* line 41
* line 42
* line 43
* line 44
* line 45
* line 46
* line 47
* line 48
* line 49
* line 50
* line 51
* line 52
* line 53
* line 54
* line 55
`;

function createWatchFixture(tmpDir: string): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': INITIAL_CONTENT,
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
  napFilePath = createWatchFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
}

// T-0100-W04: Scroll position preserved after external update
test('W04: scroll position preserved after external file update', async () => {
  await boot();

  // Open file
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  // Wait for Monaco to load the file
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const models = m.editor.getModels();
      return models.length > 0 && models[0].getValue().includes('line 50');
    },
    { timeout: 10000 },
  );

  // Scroll to line 50
  await page.evaluate(() => {
    const editors = (window as any).__monaco__.editor.getEditors();
    const editor = editors[0];
    editor.revealLine(50);
  });
  await page.waitForTimeout(200);

  // Record scroll position
  const scrollBefore = await page.evaluate(() => {
    const editors = (window as any).__monaco__.editor.getEditors();
    return editors[0].getScrollTop();
  });
  expect(scrollBefore).toBeGreaterThan(0);

  // External file change — add lines at the top
  const updatedContent = `//A: inserted by agent at top\n${INITIAL_CONTENT}`;
  fs.writeFileSync(napFilePath, updatedContent);

  // Wait for debounce (200ms) + some margin
  await page.waitForTimeout(600);

  // Verify content was updated
  const hasNewContent = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const models = m.editor.getModels();
    return models[0]?.getValue()?.includes('inserted by agent');
  });
  expect(hasNewContent).toBe(true);

  // Scroll position should be close to where it was (not jumped to top)
  const scrollAfter = await page.evaluate(() => {
    const editors = (window as any).__monaco__.editor.getEditors();
    return editors[0].getScrollTop();
  });

  // Allow some tolerance — adding a line at top shifts things slightly
  // But it should NOT have jumped to 0 (top)
  expect(scrollAfter).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});
