import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── T-ROLE-11: Edit mode — role decorations applied with correct classes ──
//
// Verifies that //XX: patterns in the editor get deltaDecorations with the
// correct inlineClassName (role-deco-known-A for known, role-deco-N for palette).

function createFixture(tmpDir: string): { napFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const mdContent = [
    '# Role decoration test',
    '',
    '* //A: architect thought (known — should get role-deco-known-A)',
    '* //E: expert thought (palette — should get role-deco-N)',
    '* //FS: engineer note (known — should get role-deco-known-FS)',
    '* //DU: user note (known — should get role-deco-known-DU)',
    '* //PM: product thought (palette — should get role-deco-N)',
    '* plain bullet with no role prefix',
  ].join('\n');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': mdContent,
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
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Role decoration test'));
    },
    { timeout: 15000 },
  );
  // Wait for decorations to apply (refreshRoleDecorations runs on content load)
  await page.waitForTimeout(500);
}

test('ROLE-11: edit mode decorations have correct role-deco classes', async () => {
  await boot();
  await openFileAndWaitForEditor();

  const decorations = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return [];
    const model = editor.getModel();
    if (!model) return [];

    return model.getAllDecorations()
      .filter((d: any) => d.options?.inlineClassName?.startsWith('role-deco-'))
      .map((d: any) => ({
        className: d.options.inlineClassName,
        startLine: d.range.startLineNumber,
      }));
  });

  // Should have decorations for //A:, //E:, //FS:, //DU:, //PM: lines
  expect(decorations.length).toBeGreaterThanOrEqual(5);

  const classNames = decorations.map((d: any) => d.className);

  // Known prefixes get role-deco-known-XX
  expect(classNames).toContain('role-deco-known-A');
  expect(classNames).toContain('role-deco-known-FS');
  expect(classNames).toContain('role-deco-known-DU');

  // Palette prefixes get role-deco-N (N is the hash index)
  const paletteClasses = classNames.filter((c: string) => c.match(/^role-deco-\d+$/));
  expect(paletteClasses.length).toBeGreaterThanOrEqual(2); // //E: and //PM:

  await cleanupApp(app, tmpDir);
});
