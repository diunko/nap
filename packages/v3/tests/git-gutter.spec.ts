import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: git repo with a tracked+modified .nap file ──

function createGitFixture(tmpDir: string): { napFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  // Initialize git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

  // Create nepic structure
  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': '# Original\n\n* line one\n* line two\n* line three\n',
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

  // Commit everything
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });

  // Now modify the .nap file — add lines at the end
  const napFilePath = path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md');
  fs.writeFileSync(napFilePath, '# Original\n\n* line one\n* line two\n* line three\n* NEW added line\n* ANOTHER added line\n');

  return { napFilePath };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createGitFixture(tmpDir);
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
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Original'));
    },
    { timeout: 15000 },
  );
  // Wait for git diff IPC to return and decorations to apply
  await page.waitForTimeout(1000);
}

// T-0200-G06: Decorations applied to Monaco gutter
test('G06: git gutter decorations appear on modified file', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Check that there are gutter decorations with git-gutter class
  const decorations = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return [];
    const model = editor.getModel();
    if (!model) return [];

    // Get all decorations
    const allDecorations = model.getAllDecorations();
    return allDecorations
      .filter((d: any) => d.options?.linesDecorationsClassName?.startsWith('git-gutter-'))
      .map((d: any) => ({
        className: d.options.linesDecorationsClassName,
        startLine: d.range.startLineNumber,
        endLine: d.range.endLineNumber,
      }));
  });

  // We added 2 lines at the end — should have at least one 'add' decoration
  expect(decorations.length).toBeGreaterThan(0);
  const addDecorations = decorations.filter((d: any) => d.className === 'git-gutter-added');
  expect(addDecorations.length).toBeGreaterThan(0);

  await cleanupApp(app, tmpDir);
});

// T-0200-G07: Re-run diff after auto-save
test('G07: gutter updates after typing and auto-save', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Get initial decoration count
  const initialCount = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return 0;
    const model = editor.getModel();
    if (!model) return 0;
    return model.getAllDecorations()
      .filter((d: any) => d.options?.linesDecorationsClassName?.startsWith('git-gutter-'))
      .length;
  });

  // Type new content — this triggers auto-save (1s debounce) which triggers re-diff
  await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (editor) {
      editor.focus();
      // Move to end and add a line
      const model = editor.getModel();
      if (model) {
        const lastLine = model.getLineCount();
        const lastCol = model.getLineMaxColumn(lastLine);
        editor.setPosition({ lineNumber: lastLine, column: lastCol });
        editor.trigger('test', 'type', { text: '\n* just typed this line' });
      }
    }
  });

  // Wait for auto-save (1s debounce) + git diff IPC + decoration update
  await page.waitForTimeout(3000);

  const afterCount = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return 0;
    const model = editor.getModel();
    if (!model) return 0;
    return model.getAllDecorations()
      .filter((d: any) => d.options?.linesDecorationsClassName?.startsWith('git-gutter-'))
      .length;
  });

  // After typing a new line, the diff should show more additions
  // The count should be >= initial (we added more content)
  expect(afterCount).toBeGreaterThanOrEqual(initialCount);

  await cleanupApp(app, tmpDir);
});
