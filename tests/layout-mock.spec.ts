import {
  test as base,
  expect,
} from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import {
  launchApp,
  cleanupApp,
  waitForShellReady,
  getActiveId,
  ptyWrite,
  bufferLength,
  bufferLine,
  createTerminal,
} from './helpers';

// ---------- fixture: fresh Electron app per test ----------
const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const { app, tmpDir } = await launchApp();
    await use(app);
    await cleanupApp(app, tmpDir);
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForFunction(
      () => (window as any).useTerminalStore?.getState()?.terminals.length > 0,
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);
    await use(page);
  },
});

// ---------------------------------------------------------------------------
// T-0400-02: terminal switching preserves buffer after layout change
// ---------------------------------------------------------------------------
test('T-0400-02: buffer preserved across terminal switch in three-column layout', async ({ page }) => {
  const termA = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals[0].id as string,
  );

  // Write 5000 lines to terminal A
  await ptyWrite(page, termA, 'seq 1 5000\n');
  await page.waitForFunction(
    (tid) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf.getLine(i)?.translateToString(true).includes('5000')) return true;
      }
      return false;
    },
    termA,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);

  const lengthBefore = await bufferLength(page, termA);
  const line50Before = await bufferLine(page, termA, 50);

  // Create terminal B
  const termB = await createTerminal(page, 'termB');
  expect(await getActiveId(page)).toBe(termB);

  // Switch back to A
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, termA);
  await page.waitForTimeout(200);

  const lengthAfter = await bufferLength(page, termA);
  const line50After = await bufferLine(page, termA, 50);

  expect(lengthAfter).toBe(lengthBefore);
  expect(line50After).toBe(line50Before);
});

// ---------------------------------------------------------------------------
// T-0400-03: Cmd+B toggles middle column only, gutter stays
// ---------------------------------------------------------------------------
test('T-0400-03: Cmd+B toggles browser column, gutter stays visible', async ({ app, page }) => {
  const id = await getActiveId(page);

  // Read terminal cols before toggle
  const colsBefore = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, id);

  // Verify gutter is present
  const gutterBefore = await page.evaluate(
    () => document.querySelector('[data-testid="gutter"]') !== null,
  );
  expect(gutterBefore).toBe(true);

  // Toggle sidebar (Cmd+B) — hides NapkinBrowser
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });
  await page.waitForTimeout(400);

  // Gutter must still be visible
  const gutterAfter = await page.evaluate(
    () => document.querySelector('[data-testid="gutter"]') !== null,
  );
  expect(gutterAfter).toBe(true);

  // NapkinBrowser should be gone
  const browserAfter = await page.evaluate(
    () => document.querySelector('[data-testid="napkin-browser"]') !== null,
  );
  expect(browserAfter).toBe(false);

  // Terminal cols should increase (more space)
  const colsAfter = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, id);
  expect(colsAfter).toBeGreaterThan(colsBefore);

  // Toggle back — browser returns
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });
  await page.waitForTimeout(400);

  const browserRestored = await page.evaluate(
    () => document.querySelector('[data-testid="napkin-browser"]') !== null,
  );
  expect(browserRestored).toBe(true);

  // Cols should return to original (±1 for rounding)
  const colsRestored = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, id);
  expect(Math.abs(colsRestored - colsBefore)).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// T-0400-05: Cmd+K filter works in napkin browser
// ---------------------------------------------------------------------------
test('T-0400-05: Cmd+K filter shows matching napkins', async ({ page }) => {
  // Dispatch Cmd+K to open filter
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  });
  await page.waitForTimeout(200);

  // Filter input should exist
  const filterExists = await page.evaluate(
    () => document.querySelector('[data-testid="browser-filter"]') !== null,
  );
  expect(filterExists).toBe(true);

  // Set filter to 'sqlite' via store (avoids DOM input fragility)
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().setBrowserFilter('sqlite');
  });
  await page.waitForTimeout(200);

  // Count visible napkin cards — should be fewer than total
  const visibleCards = await page.evaluate(
    () => document.querySelectorAll('[data-testid="napkin-card"]').length,
  );
  const totalNapkins = await page.evaluate(() => {
    const { MOCK_NAPKINS } = require('../src/renderer/mock-data');
    return MOCK_NAPKINS.length;
  }).catch(() =>
    // Fallback: read from store awareness — MOCK_NAPKINS isn't available in page context
    page.evaluate(() => 8),
  );
  expect(visibleCards).toBeGreaterThanOrEqual(1);
  expect(visibleCards).toBeLessThan(8); // total mock napkins is 8

  // Clear filter via Escape
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  await page.waitForTimeout(200);

  // All napkins should be visible again
  const allCards = await page.evaluate(
    () => document.querySelectorAll('[data-testid="napkin-card"]').length,
  );
  expect(allCards).toBe(8); // all 8 mock napkins
});

// ---------------------------------------------------------------------------
// T-0400-06: terminal resize works with three-column layout
// ---------------------------------------------------------------------------
test('T-0400-06: terminal cols track window resize with three columns', async ({ app, page }) => {
  const id = await getActiveId(page);

  // Set window to known size
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1400, 900);
  });
  await page.waitForTimeout(400);

  const colsWide = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, id);

  // Shrink window
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1000, 900);
  });
  await page.waitForTimeout(400);

  const colsNarrow = await page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.cols ?? 0;
  }, id);

  expect(colsNarrow).toBeLessThan(colsWide);
  expect(colsNarrow).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// T-0400-07: scroll lock modes preserved through layout change
// ---------------------------------------------------------------------------
test('T-0400-07: scroll lock survives sidebar toggle', async ({ app, page }) => {
  const id = await getActiveId(page);

  // Generate some scrollback
  await ptyWrite(page, id!, 'seq 1 200\n');
  await page.waitForFunction(
    (tid) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = buf.length - 1; i >= Math.max(0, buf.length - 30); i--) {
        if (buf.getLine(i)?.translateToString().includes('200')) return true;
      }
      return false;
    },
    id,
    { timeout: 15_000 },
  );

  // Activate follow lock via IPC (simulates Cmd+G menu event)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('scroll-lock:toggle');
  });
  // Wait for the 500ms double-press window to expire so follow mode commits
  await page.waitForTimeout(700);

  // Verify follow mode is active
  const modeBefore = await page.evaluate(() => {
    const state = (window as any).useTerminalStore.getState();
    return state.scrollLockModes[state.activeTerminalId] ?? 'off';
  });
  expect(modeBefore).toBe('follow');

  // Toggle sidebar (Cmd+B)
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });
  await page.waitForTimeout(400);

  // Scroll lock mode should still be follow
  const modeAfter = await page.evaluate(() => {
    const state = (window as any).useTerminalStore.getState();
    return state.scrollLockModes[state.activeTerminalId] ?? 'off';
  });
  expect(modeAfter).toBe('follow');

  // Toggle sidebar back
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().toggleSidebar();
  });
  await page.waitForTimeout(400);

  // Still follow
  const modeRestored = await page.evaluate(() => {
    const state = (window as any).useTerminalStore.getState();
    return state.scrollLockModes[state.activeTerminalId] ?? 'off';
  });
  expect(modeRestored).toBe('follow');

  // Clean up: deactivate scroll lock
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('scroll-lock:toggle');
  });
  await page.waitForTimeout(100);
});

// ---------------------------------------------------------------------------
// T-0400-09: clicking agent in browser switches terminal
// ---------------------------------------------------------------------------
test('T-0400-09: setActive with agent terminalId switches terminal', async ({ page }) => {
  // Get initial active terminal (shell created at startup)
  const initialId = await getActiveId(page);
  expect(initialId).toBeTruthy();

  // Create a second terminal to simulate an agent terminal
  const agentTermId = await createTerminal(page, 'agent-sim');

  // Switch back to initial
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, initialId);
  await page.waitForTimeout(200);
  expect(await getActiveId(page)).toBe(initialId);

  // Record initial buffer length
  const initialBufLen = await bufferLength(page, initialId!);

  // Simulate agent click → setActive(agentTerminalId)
  await page.evaluate((tid) => {
    (window as any).useTerminalStore.getState().setActive(tid);
  }, agentTermId);
  await page.waitForTimeout(200);

  // Active terminal should now be the agent terminal
  expect(await getActiveId(page)).toBe(agentTermId);

  // Original terminal buffer should be preserved
  const bufLenAfter = await bufferLength(page, initialId!);
  expect(bufLenAfter).toBe(initialBufLen);
});
