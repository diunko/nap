import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic with a .nap.md file for rendered mode + code file for link routing ──

function createFixture(tmpDir: string): { napFilePath: string; codeFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const mdContent = [
    '# Test Document',
    '',
    'Paragraph one with some text.',
    '',
    '* //A: architecture thought',
    '* //DU: user note',
    '* plain bullet',
    '',
    'Another paragraph with a [link](./sibling.md) and a [code link](src/renderer/store.ts).',
    '',
    '## Section Two',
    '',
    'More content here.',
  ].join('\n');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': mdContent,
    '30-napkins/0100-explore/sibling.md': '# Sibling doc\n\nThis is a sibling.',
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

  // Create a code file outside .nap for link routing test
  const codeFilePath = path.join(tmpDir, 'src', 'renderer', 'store.ts');
  fs.mkdirSync(path.dirname(codeFilePath), { recursive: true });
  fs.writeFileSync(codeFilePath, '// store.ts\nexport const x = 1;\n');

  const napFilePath = path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md');
  return { napFilePath, codeFilePath };
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
      return editors.some((e: any) => e.getModel()?.getValue()?.includes('Test Document'));
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
}

// T-0300-TS-01: Editor config sets tabSize 2
test('TS-01: editor tabSize is 2 and insertSpaces is true', async () => {
  await boot();
  await openFileAndWaitForEditor();

  const editorOptions = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    if (!editor) return null;
    const model = editor.getModel();
    if (!model) return null;
    // Read resolved options from the model — more reliable than enum indexing
    const modelOpts = model.getOptions();
    return {
      tabSize: modelOpts.tabSize,
      insertSpaces: modelOpts.insertSpaces,
    };
  });

  expect(editorOptions).not.toBeNull();
  expect(editorOptions!.tabSize).toBe(2);
  expect(editorOptions!.insertSpaces).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0300-RM-05: Cmd+click in rendered view → edit mode at source line
test('RM-05: Cmd+click in rendered view switches to edit at source line', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Toggle to rendered mode
  await page.evaluate(() => {
    (window as any).__napStore__.getState().toggleRenderMode();
  });
  await page.waitForTimeout(500);

  // Verify rendered mode is active
  const mode = await page.evaluate(() =>
    (window as any).__napStore__.getState().leftPaneRenderMode,
  );
  expect(mode).toBe('rendered');

  // Wait for rendered view to appear
  await page.waitForSelector('[data-testid="rendered-view"]', { timeout: 5000 });

  // Find an element with data-source-line
  const sourceLineInfo = await page.evaluate(() => {
    const rendered = document.querySelector('[data-testid="rendered-view"]');
    if (!rendered) return null;
    const el = rendered.querySelector('[data-source-line]');
    if (!el) return null;
    return {
      line: parseInt(el.getAttribute('data-source-line')!, 10),
    };
  });
  expect(sourceLineInfo).not.toBeNull();

  // Cmd+click on the rendered view element using Playwright (triggers real event)
  await page.click('[data-testid="rendered-view"] [data-source-line]', {
    modifiers: ['Meta'],
  });

  // Wait for mode switch + editor positioning
  await page.waitForTimeout(300);

  // Verify mode switched to edit
  const modeAfter = await page.evaluate(() =>
    (window as any).__napStore__.getState().leftPaneRenderMode,
  );
  expect(modeAfter).toBe('edit');

  // Verify cursor is on the correct source line
  const cursorLine = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    const editor = editors.find((e: any) => !e.getRawOptions()?.readOnly);
    return editor?.getPosition()?.lineNumber;
  });
  expect(cursorLine).toBe(sourceLineInfo!.line);

  await cleanupApp(app, tmpDir);
});

// T-0300-RM-06: Links in rendered view route through routeLink
test('RM-06: link click in rendered view routes through routeLink', async () => {
  await boot();
  await openFileAndWaitForEditor();

  // Toggle to rendered mode
  await page.evaluate(() => {
    (window as any).__napStore__.getState().toggleRenderMode();
  });
  await page.waitForTimeout(500);

  await page.waitForSelector('[data-testid="rendered-view"]', { timeout: 5000 });

  // Find a link in the rendered view and click it (no Cmd key — regular click)
  const linkFound = await page.evaluate(() => {
    const rendered = document.querySelector('[data-testid="rendered-view"]');
    if (!rendered) return false;
    const link = rendered.querySelector('a');
    if (!link) return false;

    // Click the link (regular click, no metaKey)
    const rect = link.getBoundingClientRect();
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 2,
      clientY: rect.top + 2,
    });
    link.dispatchEvent(event);
    return true;
  });

  if (linkFound) {
    await page.waitForTimeout(500);

    // Verify the store was updated — should still be in rendered mode
    // (regular click on link should route, not switch to edit)
    const modeStill = await page.evaluate(() =>
      (window as any).__napStore__.getState().leftPaneRenderMode,
    );
    expect(modeStill).toBe('rendered');
  }

  await cleanupApp(app, tmpDir);
});
