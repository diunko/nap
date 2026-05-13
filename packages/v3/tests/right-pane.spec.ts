import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic with a .nap file + a code file ──

const NAP_CONTENT = `# Test napkin

* bullet one
* references src/sample.ts:10
`;

const CODE_CONTENT = `// sample.ts
const x = 1;
const y = 2;
const z = 3;
function add(a: number, b: number): number {
  return a + b;
}
// line 8
// line 9
// line 10 — the target
// line 11
// line 12
// line 13
// line 14
// line 15
// line 16
// line 17
// line 18
// line 19
// line 20
export { add };
`;

function createFixture(tmpDir: string): { napFilePath: string; codeFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');
  const projectSrc = path.join(tmpDir, 'src');

  const nepicFiles: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': NAP_CONTENT,
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

  // Code file outside .nap/
  fs.mkdirSync(projectSrc, { recursive: true });
  const codeFilePath = path.join(projectSrc, 'sample.ts');
  fs.writeFileSync(codeFilePath, CODE_CONTENT);

  const napFilePath = path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md');
  return { napFilePath, codeFilePath };
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let napFilePath: string;
let codeFilePath: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  const fixture = createFixture(tmpDir);
  napFilePath = fixture.napFilePath;
  codeFilePath = fixture.codeFilePath;
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

async function openCodeFile(filePath: string, line?: number): Promise<void> {
  await page.evaluate(({ fp, ln }) => {
    (window as any).__napStore__.getState().openCode({ path: fp, line: ln });
  }, { fp: filePath, ln: line });

  // Wait for code editor to appear and load
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      // Need at least 2 editors (left pane + right pane code) or the right pane one
      return editors.some((e: any) => e.getRawOptions()?.readOnly === true && e.getModel()?.getValue()?.length > 0);
    },
    { timeout: 15000 },
  );
}

// T-0200-P05: Mode switch — terminal to code and back
test('P05: terminal to code and back', async () => {
  await boot();

  // Start with terminal mode (agent dot click)
  await page.evaluate(() => {
    (window as any).__napStore__.getState().setActiveTerminal('uuid-arch');
  });
  await page.waitForTimeout(300);

  let mode = await page.evaluate(() =>
    (window as any).__napStore__.getState().rightPaneMode,
  );
  expect(mode).toBe('terminal');

  // Switch to code
  await openCodeFile(codeFilePath, 10);

  mode = await page.evaluate(() =>
    (window as any).__napStore__.getState().rightPaneMode,
  );
  expect(mode).toBe('code');

  // Code editor should be visible
  const codeEditor = page.locator('[data-testid="code-editor"]');
  await expect(codeEditor).toBeVisible();

  // Switch back to terminal
  await page.evaluate(() => {
    (window as any).__napStore__.getState().setActiveTerminal('uuid-arch');
  });
  await page.waitForTimeout(300);

  mode = await page.evaluate(() =>
    (window as any).__napStore__.getState().rightPaneMode,
  );
  expect(mode).toBe('terminal');

  await cleanupApp(app, tmpDir);
});

// T-0200-P06: Line highlight on navigation
test('P06: line highlight on navigation', async () => {
  await boot();

  await openCodeFile(codeFilePath, 10);
  await page.waitForTimeout(500);

  // Check that line 10 has a decoration
  const hasHighlight = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    if (!codeEditor) return false;
    const model = codeEditor.getModel();
    if (!model) return false;
    const decorations = model.getLineDecorations(10);
    return decorations.some((d: any) =>
      d.options?.className?.includes('nap-line-highlight'),
    );
  });
  expect(hasHighlight).toBe(true);

  // Wait for animation to complete (~1.6s timer in code)
  await page.waitForTimeout(2000);

  // Decoration should be removed after animation
  const highlightAfter = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    if (!codeEditor) return false;
    const model = codeEditor.getModel();
    if (!model) return false;
    const decorations = model.getLineDecorations(10);
    return decorations.some((d: any) =>
      d.options?.className?.includes('nap-line-highlight'),
    );
  });
  expect(highlightAfter).toBe(false);

  await cleanupApp(app, tmpDir);
});

// T-0200-P07: Code display — read-only, language detection
test('P07: code display — read-only, language detection', async () => {
  await boot();

  await openCodeFile(codeFilePath);
  await page.waitForTimeout(500);

  const config = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    if (!codeEditor) return null;
    const model = codeEditor.getModel();
    return {
      readOnly: codeEditor.getRawOptions()?.readOnly,
      language: model?.getLanguageId(),
      hasContent: model?.getValue()?.length > 0,
      minimap: codeEditor.getRawOptions()?.minimap?.enabled,
    };
  });

  expect(config).not.toBeNull();
  expect(config.readOnly).toBe(true);
  expect(config.language).toBe('typescript');
  expect(config.hasContent).toBe(true);
  expect(config.minimap).toBe(false);

  // Try typing — content should not change (read-only)
  const contentBefore = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    return codeEditor?.getModel()?.getValue();
  });

  // Focus the code editor and try typing
  const codeEditorEl = page.locator('[data-testid="code-editor"]');
  await codeEditorEl.click();
  await page.keyboard.type('should not appear');
  await page.waitForTimeout(200);

  const contentAfter = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly === true);
    return codeEditor?.getModel()?.getValue();
  });

  expect(contentAfter).toBe(contentBefore);

  await cleanupApp(app, tmpDir);
});
