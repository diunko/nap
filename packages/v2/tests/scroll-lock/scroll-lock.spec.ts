import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { launchApp, cleanupApp, waitForShellReady, getActiveId, ptyWrite, createTerminal } from '../helpers';

/** Send the scroll-lock:toggle IPC from main → renderer (simulates Cmd+G) */
async function sendToggle(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('scroll-lock:toggle');
  });
  // Small settle time for IPC + state update
  await new Promise((r) => setTimeout(r, 50));
}

/** Read scroll lock mode from the store (source of truth for UI and IPC toggle) */
async function getScrollLockMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = (window as any).useTerminalStore.getState();
    return state.scrollLockModes[state.activeTerminalId] ?? 'off';
  });
}

/** Write N lines to the active terminal's pty to generate scrollback */
async function writeLines(page: Page, id: string, count: number): Promise<void> {
  await page.evaluate(
    ([tid, n]) => {
      window.electronAPI.pty.write(tid, `seq 1 ${n}\n`);
    },
    [id, String(count)] as const,
  );
  // Wait for the last line to appear
  await page.waitForFunction(
    ([tid, lastLine]) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = buf.length - 1; i >= Math.max(0, buf.length - 30); i--) {
        if (buf.getLine(i)?.translateToString().includes(lastLine)) return true;
      }
      return false;
    },
    [id, String(count)] as [string, string],
    { timeout: 15_000 },
  );
}

// ===========================================================================
// T9–T12, T17–T20: Scroll lock viewport behavior
// ===========================================================================
test.describe.serial('Scroll Lock — Viewport Behavior', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  test.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await waitForShellReady(page);
  });

  test.afterAll(async () => {
    if (app) await cleanupApp(app, tmpDir);
  });

  // T9: Follow lock — viewport stays at bottom during continuous output
  test('T9: follow lock keeps viewport at bottom during output', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Activate follow lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
    }, id);

    // Write more output
    await writeLines(page, id!, 100);

    // Assert at bottom
    const atBottom = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      const buf = entry.terminal.buffer.active;
      return buf.viewportY === buf.baseY;
    }, id);
    expect(atBottom).toBe(true);

    // Cleanup
    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T10: Follow lock — scroll up is overridden by next write
  test('T10: follow lock overrides scroll-up on next write', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Activate follow lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
    }, id);

    // Scroll up programmatically, then write one more line
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.terminal.scrollLines(-10);
      window.electronAPI.pty.write(tid, 'echo follow_recovery\n');
    }, id!);

    await page.waitForFunction(
      (tid) => {
        const entry = (window as any).getTerminal(tid);
        const buf = entry.terminal.buffer.active;
        return buf.viewportY === buf.baseY;
      },
      id,
      { timeout: 5_000 },
    );

    const atBottom = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      const buf = entry.terminal.buffer.active;
      return buf.viewportY === buf.baseY;
    }, id);
    expect(atBottom).toBe(true);

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T11: Read lock — viewport pinned during output
  test('T11: read lock pins viewport during output', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Scroll to line 50 and enter read lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.terminal.scrollToLine(50);
    }, id);

    // Small wait for scroll to settle
    await page.waitForTimeout(100);

    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('read');
    }, id);

    // Write more output
    await writeLines(page, id!, 100);

    // Viewport should be at the pinned line (50)
    const viewportY = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.buffer.active.viewportY;
    }, id);
    expect(viewportY).toBe(50);

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T12: Read lock — user/programmatic scroll updates locked position
  test('T12: read lock allows non-write scrolling and updates locked position', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Scroll to line 50 and enter read lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.terminal.scrollToLine(50);
    }, id);
    await page.waitForTimeout(100);

    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('read');
    }, id);

    // Scroll down by 20 lines (non-write scroll — should be allowed)
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.terminal.scrollLines(20);
    }, id);

    await page.waitForTimeout(100);

    // Viewport should have moved (non-write scroll updates locked position)
    const viewportY = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.buffer.active.viewportY;
    }, id);
    expect(viewportY).toBe(70);

    // Write output — viewport should stay at the new locked position (70)
    await writeLines(page, id!, 50);

    const viewportYAfterWrite = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.buffer.active.viewportY;
    }, id);
    expect(viewportYAfterWrite).toBe(70);

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T17: Resize during follow lock — lock survives
  test('T17: follow lock survives resize', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Activate follow lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
    }, id);

    // Toggle sidebar to trigger resize
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    await page.waitForTimeout(200); // debounce + render

    // Write more output
    await writeLines(page, id!, 50);

    const atBottom = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      const buf = entry.terminal.buffer.active;
      return buf.viewportY === buf.baseY;
    }, id);
    expect(atBottom).toBe(true);

    // Restore sidebar
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore.getState();
      if (!store.sidebarVisible) store.toggleSidebar();
    });

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T18: Resize during read lock — pinned position preserved
  test.skip('T18: read lock survives resize', async () => {
    const id = await getActiveId(page);

    // Generate scrollback
    await writeLines(page, id!, 200);

    // Scroll to line 50 and enter read lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.terminal.scrollToLine(50);
    }, id);
    await page.waitForTimeout(100);

    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('read');
    }, id);

    // Toggle sidebar to trigger resize
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    await page.waitForTimeout(200);

    // Write more output
    await writeLines(page, id!, 50);

    const viewportY = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.buffer.active.viewportY;
    }, id);
    expect(viewportY).toBe(50);

    // Restore sidebar
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore.getState();
      if (!store.sidebarVisible) store.toggleSidebar();
    });

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });

  // T19: Follow lock — scrollOnUserInput restored on mode off
  test('T19: scrollOnUserInput restored after follow → off', async () => {
    const id = await getActiveId(page);

    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
    }, id);

    const duringFollow = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.options.scrollOnUserInput;
    }, id);
    expect(duringFollow).toBe(false);

    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('off');
    }, id);

    const afterOff = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.terminal.options.scrollOnUserInput;
    }, id);
    expect(afterOff).toBe(true);
  });

  // T20: Follow lock — no flicker on rapid writes
  test('T20: follow lock holds at bottom during burst writes', async () => {
    const id = await getActiveId(page);

    // Activate follow lock
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
    }, id);

    // Burst write 1000 lines via seq
    await writeLines(page, id!, 1000);

    // After all writes, assert at bottom
    const atBottom = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      const buf = entry.terminal.buffer.active;
      return buf.viewportY === buf.baseY;
    }, id);
    expect(atBottom).toBe(true);

    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, id);
  });
});

// ===========================================================================
// T13–T14: Cmd+G toggle via IPC
// ===========================================================================
test.describe.serial('Scroll Lock — Cmd+G Toggle', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  test.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await waitForShellReady(page);
  });

  test.afterAll(async () => {
    if (app) await cleanupApp(app, tmpDir);
  });

  // T13: Mode cycle via Cmd+G — off → follow → off
  test('T13: single Cmd+G toggles off → follow, second (after 500ms) toggles follow → off', async () => {
    // Assert initial mode is off
    let mode = await getScrollLockMode(page);
    expect(mode).toBe('off');

    // First toggle: off → follow (store updates immediately, module after 500ms timer)
    await sendToggle(app);
    mode = await getScrollLockMode(page);
    expect(mode).toBe('follow');

    // Wait past the 500ms pending timer so follow mode commits
    await page.waitForTimeout(600);

    // Second toggle: follow → off
    await sendToggle(app);
    mode = await getScrollLockMode(page);
    expect(mode).toBe('off');
  });

  // T14: Double-press Cmd+G — off → follow → read
  test('T14: rapid double Cmd+G goes off → follow → read', async () => {
    // Ensure starting from off
    let mode = await getScrollLockMode(page);
    expect(mode).toBe('off');

    // First toggle: off → follow
    await sendToggle(app);
    mode = await getScrollLockMode(page);
    expect(mode).toBe('follow');

    // Immediately second toggle (within 500ms): follow → read
    await sendToggle(app);
    mode = await getScrollLockMode(page);
    expect(mode).toBe('read');

    // Cleanup: toggle off (wait past window, then toggle)
    await page.waitForTimeout(600);
    await sendToggle(app);
  });
});

// ===========================================================================
// T15: Store mirrors scroll-lock module state
// ===========================================================================
test.describe.serial('Scroll Lock — Store Mirror', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  test.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await waitForShellReady(page);
  });

  test.afterAll(async () => {
    if (app) await cleanupApp(app, tmpDir);
  });

  // T15: Store mirrors scroll-lock module state
  test('T15: store.scrollLockModes reflects mode after IPC toggle', async () => {
    const id = await getActiveId(page);

    // Toggle to follow
    await sendToggle(app);

    const storeMode = await page.evaluate((tid) => {
      return (window as any).useTerminalStore.getState().scrollLockModes[tid];
    }, id!);
    expect(storeMode).toBe('follow');

    // Wait and toggle off
    await page.waitForTimeout(600);
    await sendToggle(app);

    const storeModeOff = await page.evaluate((tid) => {
      return (window as any).useTerminalStore.getState().scrollLockModes[tid];
    }, id!);
    expect(storeModeOff).toBe('off');
  });
});

// ===========================================================================
// T16: Per-terminal isolation
// ===========================================================================
test.describe.serial('Scroll Lock — Per-Terminal Isolation', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  test.beforeAll(async () => {
    ({ app, tmpDir } = await launchApp());
    page = await app.firstWindow();
    await waitForShellReady(page);
  });

  test.afterAll(async () => {
    if (app) await cleanupApp(app, tmpDir);
  });

  // T16: Per-terminal isolation
  test('T16: scroll lock on terminal A does not affect terminal B', async () => {
    const idA = await getActiveId(page);

    // Activate follow lock on terminal A
    await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      entry.scrollLock.setMode('follow');
      (window as any).useTerminalStore.getState().setScrollLockMode(tid, 'follow');
    }, idA);

    // Create terminal B
    const idB = await createTerminal(page, 'test-b');
    await waitForShellReady(page);

    // B should be off
    const modeB = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.scrollLock.getMode();
    }, idB);
    expect(modeB).toBe('off');

    // Switch back to A — should still be follow
    await page.evaluate((tid) => {
      (window as any).useTerminalStore.getState().setActive(tid);
    }, idA);

    const modeA = await page.evaluate((tid) => {
      const entry = (window as any).getTerminal(tid);
      return entry.scrollLock.getMode();
    }, idA);
    expect(modeA).toBe('follow');

    // Cleanup
    await page.evaluate((tid) => {
      (window as any).getTerminal(tid).scrollLock.setMode('off');
    }, idA);
  });
});
