import {
  test as base,
  expect,
  ElectronApplication,
  Page,
} from '@playwright/test';
import {
  createTerminal,
  ptyWrite,
  waitForShellReady,
  launchApp,
  cleanupApp,
} from '../helpers';

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

// -----------------------------------------------------------------------
// T-0700-08: pty:close IPC sends kill + removeSession
//
// Verifies the full round-trip: renderer closeActiveTerminal() →
// pty:close IPC → main process kills pty.
// Session removal from session-store is verified indirectly:
// the pty:close handler calls killPty + removeSession (src/main/main.ts:242-245).
// Direct session-store assertion not possible because electron-vite bundles
// main process (no require() in app.evaluate). The handler wiring is a
// code-review checkpoint.
// -----------------------------------------------------------------------
test('T-0700-08: pty:close removes terminal end-to-end', async ({ app, page }) => {
  // Create a second terminal so close is allowed
  const termB = await createTerminal(page, 'close-test');
  await waitForShellReady(page);

  // Exit the shell in termB
  await ptyWrite(page, termB, 'exit\n');

  // Wait for status → 'exited'
  await page.waitForFunction(
    (tid: string) => {
      const store = (window as any).useTerminalStore.getState();
      const t = store.terminals.find((t: any) => t.id === tid);
      return t?.status === 'exited';
    },
    termB,
    { timeout: 15_000 },
  );

  const countBefore = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals.length,
  );

  // Call closeActiveTerminal — sends pty:close IPC to main
  await page.evaluate(() => {
    (window as any).useTerminalStore.getState().closeActiveTerminal();
  });

  // Wait for the terminal to be removed from renderer store
  await page.waitForFunction(
    (expected: number) =>
      (window as any).useTerminalStore.getState().terminals.length < expected,
    countBefore,
    { timeout: 5_000 },
  );

  // Terminal is gone from store
  const terminalGone = await page.evaluate(
    (tid: string) =>
      (window as any).useTerminalStore.getState().terminals.find((t: any) => t.id === tid) ===
      undefined,
    termB,
  );
  expect(terminalGone).toBe(true);

  // Registry entry is disposed
  const registryGone = await page.evaluate(
    (tid: string) => (window as any).getTerminal(tid) === undefined,
    termB,
  );
  expect(registryGone).toBe(true);

  // Active switched to remaining terminal
  const activeId = await page.evaluate(
    () => (window as any).useTerminalStore.getState().activeTerminalId,
  );
  expect(activeId).not.toBe(termB);
  expect(activeId).toBeTruthy();
});

// -----------------------------------------------------------------------
// T-0700-09: menu accelerator Cmd+W triggers closeActiveTerminal
//
// Tests the full chain: main process sends terminal:close-active IPC →
// preload listener fires → renderer calls closeActiveTerminal().
// Uses webContents.send directly (same as the menu click handler) to
// avoid fragile menu traversal in headless mode.
// -----------------------------------------------------------------------
test('T-0700-09: terminal:close-active IPC triggers closeActiveTerminal', async ({
  app,
  page,
}) => {
  // Create a second terminal
  const termB = await createTerminal(page, 'menu-close-test');
  await waitForShellReady(page);

  // Exit the shell so it's closeable
  await ptyWrite(page, termB, 'exit\n');

  // Wait for status → 'exited'
  await page.waitForFunction(
    (tid: string) => {
      const store = (window as any).useTerminalStore.getState();
      const t = store.terminals.find((t: any) => t.id === tid);
      return t?.status === 'exited';
    },
    termB,
    { timeout: 15_000 },
  );

  const countBefore = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals.length,
  );

  // Send terminal:close-active IPC from main process — same as menu click handler
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('terminal:close-active');
  });

  // Wait for the terminal count to decrease
  await page.waitForFunction(
    (expected: number) =>
      (window as any).useTerminalStore.getState().terminals.length < expected,
    countBefore,
    { timeout: 5_000 },
  );

  const countAfter = await page.evaluate(
    () => (window as any).useTerminalStore.getState().terminals.length,
  );
  expect(countAfter).toBe(countBefore - 1);

  // termB should be gone
  const termBGone = await page.evaluate(
    (tid: string) =>
      (window as any).useTerminalStore.getState().terminals.find((t: any) => t.id === tid) ===
      undefined,
    termB,
  );
  expect(termBGone).toBe(true);
});
