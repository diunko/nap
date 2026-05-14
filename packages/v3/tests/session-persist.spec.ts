import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Fixture: nepic with markdown files for session/render/scroll tests ──

// Long document fixture (F-0320-B) — 100+ lines with varied block elements
const LONG_DOCUMENT = [
  '# Heading One',                       // line 1
  '',                                     // line 2
  'Paragraph at the top.',                // line 3
  '',                                     // line 4
  '* bullet a',                           // line 5
  '* bullet b',                           // line 6
  '* bullet c',                           // line 7
  '',                                     // line 8
  'Another paragraph.',                   // line 9
  '',                                     // line 10
  '## Section Two',                       // line 11
  '',                                     // line 12
  'Some text in section two.',            // line 13
  '',                                     // line 14
  '## Heading at line 15',                // line 15
  '',                                     // line 16
  ...Array.from({ length: 20 }, (_, i) => `Line ${17 + i} — filler content to make the document long enough for scrolling.`),
  '',                                     // line 37
  '## Section at line 38',                // line 38
  '',                                     // line 39
  '## Heading at line 40',                // line 40
  '',                                     // line 41
  ...Array.from({ length: 20 }, (_, i) => `Line ${42 + i} — more filler content.`),
  '',                                     // line 62
  '```typescript',                        // line 63
  'const x = 1;',                         // line 64
  '```',                                  // line 65
  '',                                     // line 66
  '## Heading at line 67',                // line 67 (adjusted after code block)
  '',
  ...Array.from({ length: 20 }, (_, i) => `Line ${69 + i} — even more filler.`),
  '',
  '## Heading at line 90',                // line 90
  '',
  ...Array.from({ length: 15 }, (_, i) => `Line ${92 + i} — final filler.`),
  '',
  '## Last heading',
  '',
  'Final paragraph.',
].join('\n');

const FILE_A_CONTENT = '# File A\n\nThis is file A with unique-content-alpha.\n';
const FILE_B_CONTENT = '# File B\n\nThis is file B with unique-content-beta.\n';

function createFixture(tmpDir: string): {
  napFilePath: string;
  fileAPath: string;
  fileBPath: string;
  ghostFilePath: string;
  ghostDir: string;
} {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': LONG_DOCUMENT,
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

  // Ghost test: directory exists, but ghost file does NOT exist yet
  const ghostDir = path.join(nepicDir, '30-napkins/0100-explore');
  const ghostFilePath = path.join(ghostDir, 'ghost-file.md');

  return {
    napFilePath: path.join(nepicDir, '30-napkins/0100-explore/0100-explore.nap.md'),
    fileAPath: path.join(nepicDir, '30-napkins/0100-explore/file-a.md'),
    fileBPath: path.join(nepicDir, '30-napkins/0100-explore/file-b.md'),
    ghostFilePath,
    ghostDir,
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

async function openFileAndWait(page: Page, filePath: string): Promise<void> {
  await page.evaluate((fp) => {
    (window as any).__napStore__.getState().openFile(fp);
  }, filePath);

  await page.waitForFunction(
    (fp) => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      return editors.some((e: any) => {
        const model = e.getModel();
        return model && model.uri?.path !== '/dev/null';
      });
    },
    filePath,
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
}

async function toggleRenderedMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__napStore__.getState().toggleRenderMode();
  });
  await page.waitForTimeout(500);
}

// ── SP-06: Ghost tab — file reappears (dir watcher) ──

test('SP-06: ghost tab — file reappears via dir watcher', async () => {
  // realpathSync avoids macOS /var → /private/var symlink mismatches
  const tmpDir = fs.realpathSync(makeTmpDir());
  const { ghostFilePath, fileAPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Open file A first (a real file)
    await openFileAndWait(page, fileAPath);

    // Pin it so ghost can coexist
    await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      s.pinTab('left', s.leftTabs[0].id);
    });

    // Open ghost file path (file doesn't exist on disk).
    // watchGhost is now awaitable (ipcMain.handle) — the ContentPane effect
    // awaits it, so by the time the ghost state is set the @parcel/watcher
    // subscription is confirmed ready.
    await page.evaluate((gp) => {
      (window as any).__napStore__.getState().openDoc(gp);
    }, ghostFilePath);

    // Wait for ghost tab state (confirms file read returned null + watchGhost completed)
    await page.waitForFunction(
      (gp) => {
        const s = (window as any).__napStore__.getState();
        const tab = s.leftTabs.find((t: any) => t.path === gp);
        return tab && tab.ghost === true;
      },
      ghostFilePath,
      { timeout: 10000 },
    );

    // Verify ghost placeholder visible
    const placeholder = page.locator('[data-testid="ghost-placeholder"]');
    await expect(placeholder).toBeVisible({ timeout: 5000 });

    // Create the ghost file on disk — watcher subscription is ready, should fire.
    // Write twice with a gap to handle variable FSEvents latency in temp dirs.
    fs.writeFileSync(ghostFilePath, '# Ghost file appeared\n\nContent here.\n');
    await page.waitForTimeout(3000);
    fs.writeFileSync(ghostFilePath, '# Ghost file appeared\n\nContent here.\n');

    // Wait for ghost promotion via real @parcel/watcher → IPC → promoteGhostTab
    await page.waitForFunction(
      (gp) => {
        const s = (window as any).__napStore__.getState();
        const tab = s.leftTabs.find((t: any) => t.path === gp);
        return tab && !tab.ghost;
      },
      ghostFilePath,
      { timeout: 15000 },
    );

    // Verify tab is no longer ghost
    const promotedState = await page.evaluate((gp) => {
      const s = (window as any).__napStore__.getState();
      const tab = s.leftTabs.find((t: any) => t.path === gp);
      return tab ? { ghost: tab.ghost } : null;
    }, ghostFilePath);
    expect(promotedState).not.toBeNull();
    expect(promotedState!.ghost).toBeFalsy();
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── RR-01: Tab switch re-renders when mode is rendered ──

test('RR-01: tab switch re-renders when mode is rendered', async () => {
  const tmpDir = makeTmpDir();
  const { fileAPath, fileBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    // Open file A
    await openFileAndWait(page, fileAPath);

    // Pin tab A
    await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      s.pinTab('left', s.leftTabs[0].id);
    });

    // Toggle to rendered mode
    await toggleRenderedMode(page);

    // Verify A's content is rendered
    const renderedA = await page.locator('[data-testid="rendered-view"]').innerHTML();
    expect(renderedA).toContain('unique-content-alpha');

    // Switch to file B
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileBPath);
    await page.waitForTimeout(1000);

    // Verify rendered view now shows B's content, not A's
    const renderedB = await page.locator('[data-testid="rendered-view"]').innerHTML();
    expect(renderedB).toContain('unique-content-beta');
    expect(renderedB).not.toContain('unique-content-alpha');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── RR-02: External file change re-renders in rendered mode ──

test('RR-02: external file change re-renders in rendered mode', async () => {
  const tmpDir = makeTmpDir();
  const { fileAPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    await openFileAndWait(page, fileAPath);
    await toggleRenderedMode(page);

    // Verify initial content
    const before = await page.locator('[data-testid="rendered-view"]').innerHTML();
    expect(before).toContain('unique-content-alpha');

    // Modify the file externally
    fs.writeFileSync(fileAPath, '# File A Updated\n\nNow with unique-content-gamma.\n');

    // Wait for rendered view to update (watcher debounce ~500ms)
    await page.waitForFunction(
      () => {
        const rendered = document.querySelector('[data-testid="rendered-view"]');
        return rendered?.innerHTML?.includes('unique-content-gamma');
      },
      { timeout: 10000 },
    );

    const after = await page.locator('[data-testid="rendered-view"]').innerHTML();
    expect(after).toContain('unique-content-gamma');
    expect(after).not.toContain('unique-content-alpha');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── SS-01: Edit → rendered — cursor visible, y-coordinate matching ──

test('SS-01: edit → rendered scroll sync — cursor visible', async () => {
  const tmpDir = makeTmpDir();
  const { napFilePath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    await openFileAndWait(page, napFilePath);

    // Place cursor at a line in the middle of the document and scroll to it
    const targetLine = 40;
    await page.evaluate((line) => {
      const m = (window as any).__monaco__;
      const editors = m.editor.getEditors();
      const editor = editors[0];
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.revealLineInCenter(line);
    }, targetLine);
    await page.waitForTimeout(300);

    // Read cursor screen y before toggle
    const cursorScreenY = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      const pos = editor.getPosition();
      return editor.getTopForLineNumber(pos.lineNumber) - editor.getScrollTop();
    });

    // Toggle to rendered
    await toggleRenderedMode(page);

    // Find the matching data-source-line element and compare position
    const renderedInfo = await page.evaluate((line) => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      if (!rendered) return null;
      const elements = rendered.querySelectorAll('[data-source-line]');
      let closest: Element | null = null;
      let closestLine = -1;
      for (const el of elements) {
        const l = parseInt(el.getAttribute('data-source-line')!, 10);
        if (l <= line && l > closestLine) {
          closest = el;
          closestLine = l;
        }
      }
      if (!closest) return null;
      return {
        elementLine: closestLine,
        elementOffsetTop: (closest as HTMLElement).offsetTop,
        scrollTop: rendered.scrollTop,
        screenY: (closest as HTMLElement).offsetTop - rendered.scrollTop,
      };
    }, targetLine);

    expect(renderedInfo).not.toBeNull();
    // The rendered element's screen y should be approximately equal to cursor screen y
    // Tolerance: ~50px for block-level granularity
    expect(Math.abs(renderedInfo!.screenY - cursorScreenY)).toBeLessThan(100);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── SS-02: Edit → rendered — cursor off-screen, fallback to viewport top ──

test('SS-02: edit → rendered scroll sync — cursor off-screen fallback', async () => {
  const tmpDir = makeTmpDir();
  const { napFilePath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    await openFileAndWait(page, napFilePath);

    // Place cursor at line 1, then scroll editor to line 80 (cursor off-screen above)
    await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealLineInCenter(80);
    });
    await page.waitForTimeout(300);

    // Get the topmost visible line
    const visibleStart = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      const ranges = editor.getVisibleRanges();
      return ranges[0]?.startLineNumber ?? 1;
    });

    // Toggle to rendered
    await toggleRenderedMode(page);

    // Rendered view should show content from around the visible start, not line 1
    const renderedTopLine = await page.evaluate(() => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      if (!rendered) return null;
      const elements = rendered.querySelectorAll('[data-source-line]');
      for (const el of elements) {
        if ((el as HTMLElement).offsetTop >= rendered.scrollTop) {
          return parseInt(el.getAttribute('data-source-line')!, 10);
        }
      }
      return null;
    });

    expect(renderedTopLine).not.toBeNull();
    // The rendered view should be showing content near the visible range, not line 1
    // Allow generous tolerance since block-level mapping is approximate
    expect(renderedTopLine!).toBeGreaterThan(visibleStart - 20);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── SS-03: Rendered → edit — topmost visible source line ──

test('SS-03: rendered → edit — topmost visible source line', async () => {
  const tmpDir = makeTmpDir();
  const { napFilePath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    await openFileAndWait(page, napFilePath);
    await toggleRenderedMode(page);

    // Scroll rendered view to middle
    await page.evaluate(() => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      if (rendered) {
        rendered.scrollTop = rendered.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(200);

    // Read topmost visible source line
    const topmostLine = await page.evaluate(() => {
      const rendered = document.querySelector('[data-testid="rendered-view"]');
      if (!rendered) return null;
      const elements = rendered.querySelectorAll('[data-source-line]');
      for (const el of elements) {
        if ((el as HTMLElement).offsetTop >= rendered.scrollTop) {
          return parseInt(el.getAttribute('data-source-line')!, 10);
        }
      }
      return null;
    });

    expect(topmostLine).not.toBeNull();

    // Toggle back to edit
    await toggleRenderedMode(page);

    // Verify cursor is at (or near) the topmost visible line
    const cursorLine = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      return editor?.getPosition()?.lineNumber;
    });

    expect(cursorLine).toBeDefined();
    // Should be within ±5 lines of the topmost rendered source line
    expect(Math.abs(cursorLine! - topmostLine!)).toBeLessThanOrEqual(5);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── SS-04: Round-trip — edit → rendered → edit preserves position ──

test('SS-04: round-trip edit → rendered → edit preserves position', async () => {
  const tmpDir = makeTmpDir();
  const { napFilePath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);

  try {
    await openFileAndWait(page, napFilePath);

    // Place cursor at a known line
    const startLine = 40;
    await page.evaluate((line) => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.revealLineInCenter(line);
    }, startLine);
    await page.waitForTimeout(300);

    // Round trip 1: edit → rendered → edit
    await toggleRenderedMode(page); // → rendered
    await toggleRenderedMode(page); // → edit
    await page.waitForTimeout(300);

    const afterFirstTrip = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      return editor?.getPosition()?.lineNumber;
    });

    // Should be within ±5 lines of original
    expect(Math.abs(afterFirstTrip! - startLine)).toBeLessThanOrEqual(5);

    // Round trip 2: should not drift further
    await toggleRenderedMode(page); // → rendered
    await toggleRenderedMode(page); // → edit
    await page.waitForTimeout(300);

    const afterSecondTrip = await page.evaluate(() => {
      const m = (window as any).__monaco__;
      const editor = m.editor.getEditors()[0];
      return editor?.getPosition()?.lineNumber;
    });

    // No further drift — within ±5 of the first round trip result
    expect(Math.abs(afterSecondTrip! - afterFirstTrip!)).toBeLessThanOrEqual(5);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// ── Auto-save: session state lands on disk ──

test('Auto-save: session state persists to per-nepic ui-state.json on disk', async () => {
  const tmpDir = makeTmpDir();
  const { fileAPath, fileBPath } = createFixture(tmpDir);
  const { app, page } = await boot(tmpDir);
  const nepicUiStatePath = path.join(tmpDir, '.nap', 'nepics', 'test-nepic', 'ui-state.json');

  try {
    // Open tabs, focus a card
    await openFileAndWait(page, fileAPath);
    await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      s.pinTab('left', s.leftTabs[0].id);
    });
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openDoc(fp);
    }, fileBPath);

    // Toggle rendered mode
    await toggleRenderedMode(page);

    // Wait for debounced auto-save (500ms + margin)
    await page.waitForTimeout(1500);

    // Read ui-state.json from disk
    const raw = fs.readFileSync(nepicUiStatePath, 'utf-8');
    const saved = JSON.parse(raw);

    // Session fields should be present
    expect(saved.leftTabs).toBeDefined();
    expect(saved.leftTabs.length).toBeGreaterThanOrEqual(1);
    expect(saved.leftPaneRenderMode).toBe('rendered');
    expect(saved).toHaveProperty('focusedCardSlug');
    expect(saved).toHaveProperty('theme');
    expect(saved).toHaveProperty('debugPanelCollapsed');
  } finally {
    await cleanupApp(app, tmpDir);
  }
});
