import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: napkin file with role-prefixed comments for shift-enter ──

const NAP_CONTENT = `# Shift-enter test

* //A: first thought
* //DU: user said this
  * //FS: nested engineer note
* plain bullet
  * //TE: `;

function createFixture(tmpDir: string): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': NAP_CONTENT,
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

  return path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md');
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  napFilePath = createFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openFileInEditor(): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, napFilePath);

  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Shift-enter'));
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

// T-0200-SE06: Monaco keybinding integration
test('SE06: shift-enter continues line pattern', async () => {
  await boot();
  await openFileInEditor();

  // Position cursor at end of line 3: "* //A: first thought"
  const result = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;

    const model = editor.getModel();
    if (!model) return null;

    // Find the line with "//A: first thought"
    const lineCount = model.getLineCount();
    let targetLine = -1;
    for (let i = 1; i <= lineCount; i++) {
      if (model.getLineContent(i).includes('//A: first thought')) {
        targetLine = i;
        break;
      }
    }
    if (targetLine === -1) return { error: 'target line not found' };

    const lineContent = model.getLineContent(targetLine);
    editor.setPosition({ lineNumber: targetLine, column: lineContent.length + 1 });
    editor.focus();

    return { targetLine, lineContent, lineCountBefore: lineCount };
  });

  expect(result).not.toBeNull();
  expect(result).not.toHaveProperty('error');

  // Press Shift+Enter
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(300);

  // Check the new line content
  const newLineContent = await page.evaluate((targetLine: number) => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;
    const model = editor.getModel();
    if (!model) return null;

    return {
      newLine: model.getLineContent(targetLine + 1),
      lineCount: model.getLineCount(),
      cursorPos: editor.getPosition(),
    };
  }, result!.targetLine);

  expect(newLineContent).not.toBeNull();
  // Line count should have increased by 1
  expect(newLineContent!.lineCount).toBe(result!.lineCountBefore + 1);
  // New line should have the continuation pattern: "* //A: "
  expect(newLineContent!.newLine).toContain('* //A: ');

  await cleanupApp(app, tmpDir);
});

// T-0200-SE07: Break-out in Monaco
test('SE07: shift-enter break-out on empty prefix line', async () => {
  await boot();
  await openFileInEditor();

  // Find the line with "//TE: " (empty content after prefix — break-out case)
  const result = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;

    const model = editor.getModel();
    if (!model) return null;

    const lineCount = model.getLineCount();
    let targetLine = -1;
    for (let i = 1; i <= lineCount; i++) {
      const content = model.getLineContent(i);
      if (content.includes('//TE: ') && content.trim() === '* //TE:') {
        targetLine = i;
        break;
      }
    }
    if (targetLine === -1) return { error: 'break-out line not found' };

    const lineContent = model.getLineContent(targetLine);
    editor.setPosition({ lineNumber: targetLine, column: lineContent.length + 1 });
    editor.focus();

    return { targetLine, lineContent, lineCountBefore: lineCount };
  });

  expect(result).not.toBeNull();
  expect(result).not.toHaveProperty('error');

  // Press Shift+Enter
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(300);

  // Check that the new line does NOT have the prefix pattern
  const newLineContent = await page.evaluate((targetLine: number) => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;
    const model = editor.getModel();
    if (!model) return null;

    return {
      currentLine: model.getLineContent(targetLine),
      newLine: model.getLineContent(targetLine + 1),
      lineCount: model.getLineCount(),
    };
  }, result!.targetLine);

  expect(newLineContent).not.toBeNull();
  // New line should NOT contain the prefix pattern
  expect(newLineContent!.newLine).not.toContain('//TE:');
  // The break-out should have cleared the empty prefix line too
  expect(newLineContent!.currentLine).not.toContain('//TE:');

  await cleanupApp(app, tmpDir);
});
