import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// Fixture: nepic with a running agent + a code file to switch to

function createFixture(tmpDir: string): { codeFilePath: string } {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
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

  const codeFilePath = path.join(tmpDir, 'src', 'example.ts');
  fs.mkdirSync(path.dirname(codeFilePath), { recursive: true });
  fs.writeFileSync(codeFilePath, 'export const x = 1;\nexport const y = 2;\n');

  return { codeFilePath };
}

// Terminal cols collapse to ~1 after switching terminal → code → terminal.
// The ResizeObserver fires fit() when the terminal parent gets display:none,
// sending a zero-width resize to the pty. All text reflows to 1 column.
// When the terminal becomes visible again, the damage is done.

test('terminal cols survive code tab round-trip', async () => {
  const tmpDir = makeTmpDir();
  const { codeFilePath } = createFixture(tmpDir);
  const app = await launchApp(tmpDir);
  const page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);

  try {
    // Ensure terminal is active and visible
    const hasTerminal = await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      return !!s.activeTerminalId && s.rightPaneMode === 'terminal';
    });

    if (!hasTerminal) {
      // Activate the architect terminal
      await page.evaluate(() => {
        const s = (window as any).__napStore__.getState();
        const arch = s.architects[0];
        if (arch) s.setActiveTerminal(arch.id);
      });
      await page.waitForTimeout(500);
    }

    // Read terminal cols BEFORE switching — should be reasonable (>40)
    const colsBefore = await page.evaluate(() => {
      const id = (window as any).__napStore__.getState().activeTerminalId;
      if (!id) return null;
      const entry = (window as any).__getTerminal__(id);
      return entry?.terminal?.cols ?? null;
    });

    // If no terminal entry, skip (agent not started in test mode)
    if (colsBefore === null) {
      return;
    }
    expect(colsBefore).toBeGreaterThan(40);

    // Install a spy: record every terminal.resize() call to catch the bad resize
    await page.evaluate(() => {
      const id = (window as any).__napStore__.getState().activeTerminalId;
      const entry = (window as any).__getTerminal__(id);
      if (!entry) return;
      const origResize = entry.terminal.resize.bind(entry.terminal);
      (window as any).__resizeLog__ = [];
      entry.terminal.resize = (cols: number, rows: number) => {
        (window as any).__resizeLog__.push({ cols, rows, time: Date.now() });
        return origResize(cols, rows);
      };
    });

    // Switch to code tab (terminal parent gets display:none)
    await page.evaluate((fp) => {
      (window as any).__napStore__.getState().openCode({ path: fp });
    }, codeFilePath);

    // Wait for ResizeObserver debounce (50ms) + margin
    await page.waitForTimeout(200);

    // Switch back to terminal tab
    await page.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      const termTab = s.rightTabs.find((t: any) => t.type === 'terminal');
      if (termTab) s.setActiveTerminal(termTab.path);
    });
    await page.waitForTimeout(500);

    // Read the resize log — should NEVER contain cols < 10
    const resizeLog = await page.evaluate(() => (window as any).__resizeLog__ ?? []);

    // Any resize with cols less than half of the original is a bad resize
    const badResize = resizeLog.find((r: any) => r.cols < colsBefore! / 2);

    // BUG: fitAddon.fit() fires during display:none, proposeDimensions returns
    // cols=2 (Math.max(2, floor(0/cellWidth))), terminal resizes to 2 cols,
    // pty reflows all content to 2 columns. When terminal becomes visible again,
    // fit() sends correct cols but old content stays wrapped.
    expect(badResize).toBeUndefined();

    // Also check final cols are correct
    const colsAfter = await page.evaluate(() => {
      const id = (window as any).__napStore__.getState().activeTerminalId;
      const entry = (window as any).__getTerminal__(id);
      return entry?.terminal?.cols ?? null;
    });
    expect(colsAfter).toBe(colsBefore);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});
