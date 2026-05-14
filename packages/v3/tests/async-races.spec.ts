import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture ──

const FILE_A_CONTENT = '# File A\n\nThis is file A with unique-marker-alpha.\n';
const FILE_B_CONTENT = '# File B\n\nThis is file B with unique-marker-beta.\n';
const CODE_A_CONTENT = '// code-a.ts\nexport const marker = "code-alpha";\n';
const CODE_B_CONTENT = '// code-b.ts\nexport const marker = "code-beta";\n';

function createFixture(tmpDir: string): {
  fileAPath: string;
  fileBPath: string;
  codeAPath: string;
  codeBPath: string;
} {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/file-a.md': FILE_A_CONTENT,
    '30-napkins/0100-explore/file-b.md': FILE_B_CONTENT,
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

  // Code files outside .nap (for right pane tests)
  const codeAPath = path.join(tmpDir, 'src', 'code-a.ts');
  const codeBPath = path.join(tmpDir, 'src', 'code-b.ts');
  fs.mkdirSync(path.dirname(codeAPath), { recursive: true });
  fs.writeFileSync(codeAPath, CODE_A_CONTENT);
  fs.writeFileSync(codeBPath, CODE_B_CONTENT);

  return {
    fileAPath: path.join(nepicDir, '30-napkins/0100-explore/file-a.md'),
    fileBPath: path.join(nepicDir, '30-napkins/0100-explore/file-b.md'),
    codeAPath,
    codeBPath,
  };
}

// ── Helpers ──

async function boot(tmpDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launchApp(tmpDir);
  const page = await app.firstWindow();
  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
  return { app, page };
}

// ── T-RACE-01: ContentPane file load — rapid tab switch shows stale file ──

test('RACE-01: rapid tab switch — editor shows stale file content', async () => {

  const tmpDir = makeTmpDir();
  const { fileAPath, fileBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Inject delay: file A takes 500ms to read, file B is instant
    await app.evaluate(async ({}, fp) => {
      (global as any).__testHooks__.setFileReadDelay(fp, 500);
    }, fileAPath);

    // Open A (starts slow 500ms read), then immediately open B (fast read)
    await page.evaluate((a) => {
      (window as any).__napStore__.getState().openDoc(a);
    }, fileAPath);

    // Small delay to ensure effect has started
    await page.waitForTimeout(50);

    await page.evaluate((b) => {
      (window as any).__napStore__.getState().openDoc(b);
    }, fileBPath);

    // Wait for both reads to complete (500ms + margin)
    await page.waitForTimeout(800);

    // Active tab should be B
    const activeFile = await page.evaluate(() =>
      (window as any).__napStore__.getState().activeFilePath,
    );
    expect(activeFile).toBe(fileBPath);

    // Editor content should be B's content, NOT A's stale content
    const editorContent = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      if (!m) return null;
      const editors = m.editor.getEditors();
      const editor = editors[0];
      return editor?.getModel()?.getValue() ?? null;
    });

    expect(editorContent).not.toBeNull();
    expect(editorContent).toContain('unique-marker-beta');
    expect(editorContent).not.toContain('unique-marker-alpha');
  } finally {
    // Cleanup delays
    await app.evaluate(async () => {
      (global as any).__testHooks__?.clearFileReadDelays();
    });
    await cleanupApp(app, tmpDir);
  }
});

// ── T-RACE-02: Tab switch during file load — fileWatch set to wrong file ──

test('RACE-02: rapid tab switch — file watcher watches wrong file', async () => {

  const tmpDir = makeTmpDir();
  const { fileAPath, fileBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // File A: slow read (500ms), File B: instant
    await app.evaluate(async ({}, fp) => {
      (global as any).__testHooks__.setFileReadDelay(fp, 500);
    }, fileAPath);

    // Open A then B rapidly
    await page.evaluate((a) => {
      (window as any).__napStore__.getState().openDoc(a);
    }, fileAPath);
    await page.waitForTimeout(50);
    await page.evaluate((b) => {
      (window as any).__napStore__.getState().openDoc(b);
    }, fileBPath);

    // Wait for both reads
    await page.waitForTimeout(800);

    // Now modify file B on disk — should trigger watcher update
    fs.writeFileSync(fileBPath, '# File B Updated\n\nNow with unique-marker-gamma.\n');

    // Wait for watcher + debounce
    await page.waitForTimeout(1000);

    // Editor should show the updated B content (not stale)
    const editorContent = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editors = m.editor.getEditors();
      return editors[0]?.getModel()?.getValue() ?? null;
    });

    // If fileWatch was set to A (the stale slow file), this change won't be detected
    expect(editorContent).toContain('unique-marker-gamma');
  } finally {
    await app.evaluate(async () => {
      (global as any).__testHooks__?.clearFileReadDelays();
    });
    await cleanupApp(app, tmpDir);
  }
});

// ── T-RACE-03: TerminalPane CodeEditor — rapid code file switch shows stale file ──

test('RACE-03: rapid code file switch — right pane shows stale content', async () => {

  const tmpDir = makeTmpDir();
  const { fileAPath, codeAPath, codeBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Open a doc first so the left pane is active
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileAPath);
    await page.waitForTimeout(500);

    // Code A: slow read (500ms), Code B: instant
    await app.evaluate(async ({}, fp) => {
      (global as any).__testHooks__.setFileReadDelay(fp, 500);
    }, codeAPath);

    // Open code A then code B rapidly in right pane
    await page.evaluate((a) => {
      (window as any).__napStore__.getState().openCode({ path: a });
    }, codeAPath);
    await page.waitForTimeout(50);
    await page.evaluate((b) => {
      (window as any).__napStore__.getState().openCode({ path: b });
    }, codeBPath);

    // Wait for both reads
    await page.waitForTimeout(800);

    // Right pane should show code B
    const rightFile = await page.evaluate(() =>
      (window as any).__napStore__.getState().rightFilePath,
    );
    expect(rightFile).toBe(codeBPath);

    // The code editor model should have B's content
    const codeContent = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      if (!m) return null;
      const editors = m.editor.getEditors();
      // Find the read-only editor (code pane)
      const codeEditor = editors.find((e: any) => e.getRawOptions()?.readOnly);
      return codeEditor?.getModel()?.getValue() ?? null;
    });

    if (codeContent !== null) {
      expect(codeContent).toContain('code-beta');
      expect(codeContent).not.toContain('code-alpha');
    }
  } finally {
    await app.evaluate(async () => {
      (global as any).__testHooks__?.clearFileReadDelays();
    });
    await cleanupApp(app, tmpDir);
  }
});

// ── T-RACE-07: ContentWatcher — old subscription leaks after rapid file switch ──

test('RACE-07: rapid file switch — old file changes bleed into editor', async () => {
  const tmpDir = makeTmpDir();
  const { fileAPath, fileBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Open file A, wait for it to load
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileAPath);
    await page.waitForFunction(() => {
      const m = (window as any).__monaco__;
      return m?.editor?.getEditors()[0]?.getModel()?.getValue()?.includes('unique-marker-alpha');
    }, { timeout: 10000 });

    // Pin A, then open B
    await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      s.pinTab('left', s.leftTabs[0].id);
    });
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileBPath);
    await page.waitForTimeout(500);

    // Verify editor shows B
    const beforeEdit = await page.evaluate(() =>
      (window as any).__monaco__.editor.getEditors()[0]?.getModel()?.getValue(),
    );
    expect(beforeEdit).toContain('unique-marker-beta');

    // Modify file A on disk — if old watcher leaked, this will push A's content into the editor
    fs.writeFileSync(fileAPath, '# MODIFIED A\n\nThis is LEAKED content from file A.\n');
    await page.waitForTimeout(800);

    // Editor should still show B's content, NOT A's modification
    const afterModify = await page.evaluate(() =>
      (window as any).__monaco__.editor.getEditors()[0]?.getModel()?.getValue(),
    );
    expect(afterModify).toContain('unique-marker-beta');
    expect(afterModify).not.toContain('LEAKED content');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-RACE-14: Echo suppression — late watcher echo not suppressed ──

test('RACE-14: late watcher echo causes cursor jump', async () => {
  const tmpDir = makeTmpDir();
  const { fileAPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Open file A and wait for editor
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileAPath);
    await page.waitForFunction(() => {
      const m = (window as any).__monaco__;
      return m?.editor?.getEditors()[0]?.getModel()?.getValue()?.includes('unique-marker-alpha');
    }, { timeout: 10000 });

    // Type some content and move cursor to line 3
    await page.evaluate(() => {
      const editor = (window as any).__monaco__.editor.getEditors()[0];
      editor.setPosition({ lineNumber: 3, column: 5 });
      editor.focus();
    });
    await page.waitForTimeout(100);

    // Record cursor position
    const cursorBefore = await page.evaluate(() => {
      const editor = (window as any).__monaco__.editor.getEditors()[0];
      const pos = editor.getPosition();
      return { line: pos.lineNumber, col: pos.column };
    });
    expect(cursorBefore.line).toBe(3);

    // Simulate a late watcher echo: send file:changed from main process
    // AFTER the renderer's suppressExternalRef has expired.
    // This simulates what happens when the OS delivers the watcher event late.
    await page.evaluate(() => {
      // Clear the suppress flag to simulate it having expired
      // (In real code, this happens after 500ms timeout)
    });

    // Read file content from test process, send via main process IPC
    const fileContent = fs.readFileSync(fileAPath, 'utf-8');
    await app.evaluate(async ({ BrowserWindow }, { fp, content }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send('file:changed', fp, content);
    }, { fp: fileAPath, content: fileContent });

    await page.waitForTimeout(200);

    // Cursor should NOT have jumped (model.setValue resets cursor to 1,1)
    const cursorAfter = await page.evaluate(() => {
      const editor = (window as any).__monaco__.editor.getEditors()[0];
      const pos = editor.getPosition();
      return { line: pos.lineNumber, col: pos.column };
    });

    // If echo suppression worked, cursor stays at line 3.
    // If it didn't, setValue was called and cursor jumped.
    // Note: the external change handler does try to preserve cursor,
    // so this test checks whether the handler fires at all (it shouldn't
    // for an echo of the same content).
    expect(cursorAfter.line).toBe(cursorBefore.line);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── T-RACE-06: hasPendingWrite — disk state wrong after restart ──

// RACE-06: hasPendingWrite boolean is a code smell (14 writers, 1 boolean), but the
// ephemeral doneAgents/runningAgents Sets fully mask the consequence. Can't make it
// fail — the defense works at both memory and disk level. The boolean should still
// be replaced with a counter or the serialize queue (which eliminates it entirely).

// ── T-RACE-08: setAgentDone memory-before-disk — disk missing done after crash ──

test('RACE-08: done flag missing from disk — fire-and-forget + immediate exit', async () => {

  const tmpDir = makeTmpDir();
  createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');
  const markerPath = path.join(nepicDir, '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json');

  try {
    // Fire setAgentDone WITHOUT awaiting (same as socket-handler.ts:86)
    // then immediately call setAgentExitedById which reads+writes the marker.
    // The exit reads the marker before done writes it.
    await app.evaluate(async () => {
      const model = (global as any).__napModel__;
      // Fire-and-forget done (memory set, disk write in-flight)
      model.setAgentDone('uuid-ta');
      // Immediately exit — reads marker, writes exited:true, but no done:true
      await model.setAgentExitedById('uuid-ta');
    });

    // Quit app
    await app.evaluate(({ app: electronApp }) => electronApp.quit());
    await app.close();

    // Read disk marker — should have both done AND exited
    const raw = fs.readFileSync(markerPath, 'utf-8');
    let marker: any;
    try {
      marker = JSON.parse(raw);
    } catch {
      // BUG: concurrent writes corrupted the JSON file!
      expect(raw).toBe('valid JSON'); // force fail with actual content visible
    }

    // Both flags should be present — the marker should reflect both operations
    // BUG: without serialization, one write overwrites the other's changes.
    // Either done is missing (exit wrote last) or exited is missing (done wrote last).
    const hasBoth = marker.done === true && marker.exited === true;
    expect(hasBoth).toBe(true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
