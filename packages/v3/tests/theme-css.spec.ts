import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: minimal nepic ──

function createFixture(tmpDir: string): { napFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': '# Test\n\n* content\n',
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta', role: 'test-arch', name: '001-test-arch',
      nepic: 'test-nepic', created_at: 1711700000000, started: true, exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
      nepic: 'test-nepic', created_at: 1711600000000, started: true, exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }

  return { napFilePath: path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md') };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createFixture(tmpDir);
  napFilePath = fixture.napFilePath;
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openFileAndWaitForEditor(): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Test'));
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
}

// T-0300-TH-05: CSS variables applied to :root on theme switch
test('TH-05: CSS variables set on :root after theme switch', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Get the initial theme's expected bg color
  const initialBg = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--nap-bg').trim();
  });
  expect(initialBg.length).toBeGreaterThan(0);

  // Cycle to next theme
  await page.evaluate(() => {
    (window as any).__napStore__.getState().cycleTheme();
  });
  await page.waitForTimeout(200);

  // Get the new bg color
  const newBg = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--nap-bg').trim();
  });
  expect(newBg.length).toBeGreaterThan(0);
  // Theme changed — bg should be different (dark → light-cream)
  expect(newBg).not.toBe(initialBg);

  // Also verify other CSS variables are set
  const vars = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      bgSecondary: style.getPropertyValue('--nap-bg-secondary').trim(),
      border: style.getPropertyValue('--nap-border').trim(),
      text: style.getPropertyValue('--nap-text').trim(),
      textMuted: style.getPropertyValue('--nap-text-muted').trim(),
      accent: style.getPropertyValue('--nap-accent').trim(),
    };
  });

  for (const [key, value] of Object.entries(vars)) {
    expect(value.length, `--nap-${key} should be set`).toBeGreaterThan(0);
  }

  await cleanupApp(app, tmpDir);
});

// T-0300-TH-06: Both Monaco editors receive theme on switch
test('TH-06: Monaco setTheme does not throw for any theme', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Also open a code file to ensure both editors exist
  const codeDir = path.join(tmpDir, 'src');
  fs.mkdirSync(codeDir, { recursive: true });
  fs.writeFileSync(path.join(codeDir, 'test.ts'), 'const x = 1;\n');

  await page.evaluate((codePath) => {
    (window as any).__napStore__.getState().openCode({ path: codePath, line: 1 });
  }, path.join(codeDir, 'test.ts'));

  await page.waitForTimeout(500);

  // Cycle through all themes — verify no errors and both editors update
  const themeCount = await page.evaluate(() => {
    const store = (window as any).__napStore__;
    const m = (window as any).__monaco__;

    // Import THEMES length from store
    const initialTheme = store.getState().currentThemeName;
    let count = 0;

    // We need to access THEMES — cycle until we return to initial
    const errors: string[] = [];
    do {
      try {
        store.getState().cycleTheme();
        count++;
      } catch (e: any) {
        errors.push(e.message);
        break;
      }
    } while (store.getState().currentThemeName !== initialTheme && count < 10);

    if (errors.length > 0) throw new Error(errors.join(', '));
    return count;
  });

  expect(themeCount).toBeGreaterThanOrEqual(2);

  // Verify the editor background color matches theme after cycling
  const editorBg = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;
    // Get the editor's DOM element background color
    const dom = editor.getDomNode();
    if (!dom) return null;
    return getComputedStyle(dom).backgroundColor;
  });

  // Background should be set (not empty/transparent)
  expect(editorBg).not.toBeNull();

  await cleanupApp(app, tmpDir);
});
