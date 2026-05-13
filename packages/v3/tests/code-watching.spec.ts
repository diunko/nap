import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic + code file for right pane file watching ──

const CODE_CONTENT = Array.from({ length: 200 }, (_, i) => `// line ${i + 1}`).join('\n');

function createFixture(tmpDir: string): { codeFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');
  const projectSrc = path.join(tmpDir, 'src');

  const nepicFiles: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': '# Test\n\n* content\n',
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
  const codeFilePath = path.join(projectSrc, 'bigfile.ts');
  fs.writeFileSync(codeFilePath, CODE_CONTENT);

  return { codeFilePath };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let codeFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createFixture(tmpDir);
  codeFilePath = fixture.codeFilePath;
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openCodeAndScroll(filePath: string, scrollLine: number): Promise<void> {
  await page.evaluate(({ fp, ln }) => {
    (window as any).__napStore__.getState().openCode({ path: fp, line: ln });
  }, { fp: filePath, ln: scrollLine });

  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      return m.editor.getEditors().some((e: any) =>
        e.getRawOptions()?.readOnly === true && e.getModel()?.getValue()?.length > 0,
      );
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
}

// T-0200-W05: Right pane preserves scroll on external update
test('W05: scroll preserved on external file update', async () => {
  await boot();

  // Open code file scrolled to line 100
  await openCodeAndScroll(codeFilePath, 100);

  // Get scroll position
  const scrollBefore = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    return codeEditor?.getScrollTop() ?? 0;
  });
  expect(scrollBefore).toBeGreaterThan(0);

  // External write — modify the file on disk
  const updatedContent = CODE_CONTENT + '\n// externally added line';
  fs.writeFileSync(codeFilePath, updatedContent);

  // Wait for watcher to fire + content to update
  await page.waitForTimeout(1500);

  // Check that content was updated
  const contentUpdated = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    return codeEditor?.getModel()?.getValue()?.includes('externally added line');
  });
  expect(contentUpdated).toBe(true);

  // Check that scroll position is approximately preserved
  const scrollAfter = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    return codeEditor?.getScrollTop() ?? 0;
  });

  // Scroll should be approximately the same (within 50px tolerance — content shift may adjust slightly)
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(50);

  await cleanupApp(app, tmpDir);
});
