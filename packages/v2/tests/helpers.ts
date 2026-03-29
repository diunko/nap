import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const APP_DIR = path.join(__dirname, '..');

/** Default Electron launch args for tests */
export const ELECTRON_LAUNCH_ARGS = [APP_DIR];

const SOCKET_DIR = path.join(os.tmpdir(), 'nap-test');

/** Unique socket path so test instances don't collide with each other or a running NAP */
export function testSocketPath(): string {
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
  return path.join(SOCKET_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
}

/**
 * Launch an isolated Electron NAP instance for testing.
 * Sets NAP_TEST=1 and a unique NAP_SOCKET so it never conflicts
 * with a running NAP instance (including one running the tests).
 * Each instance gets its own --cwd temp directory (and thus its own .nap/nap.db),
 * preventing session name collisions across test runs.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-test-cwd-'));
  const app = await electron.launch({
    args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
    env: { ...process.env, NAP_TEST: '1', NAP_SOCKET: testSocketPath() },
  });
  return { app, tmpDir };
}

/** Clean up an isolated app: quit, close, remove temp dir */
export async function cleanupApp(app: ElectronApplication, tmpDir: string): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/** Wait for shell to produce at least one non-empty line (prompt ready) */
export async function waitForShellReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const id = (window as any).useTerminalStore?.getState()?.activeTerminalId;
      if (!id) return false;
      const entry = (window as any).getTerminal(id);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().trim()) return true;
      }
      return false;
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Get active terminal ID from store */
export async function getActiveId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as any).useTerminalStore.getState().activeTerminalId,
  );
}

/** Wait for text to appear anywhere in a terminal's xterm buffer */
export async function waitForText(
  page: Page,
  id: string,
  text: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    ([id, text]: [string, string]) => {
      const entry = (window as any).getTerminal(id);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().includes(text)) return true;
      }
      return false;
    },
    [id, text] as [string, string],
    { timeout },
  );
}

/** Create a new terminal via store, set it active, return its id */
export async function createTerminal(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const store = (window as any).useTerminalStore;
    const id = store.getState().createTerminal(n);
    store.getState().setActive(id);
    return id;
  }, name);
}

/** Write data to a terminal's pty */
export async function ptyWrite(page: Page, id: string, data: string): Promise<void> {
  await page.evaluate(
    ([tid, d]) => window.electronAPI.pty.write(tid, d),
    [id, data] as const,
  );
}

/** Read the active buffer length of a terminal */
export async function bufferLength(page: Page, id: string): Promise<number> {
  return page.evaluate((tid) => {
    const entry = (window as any).getTerminal(tid);
    return entry?.terminal.buffer.active.length ?? 0;
  }, id);
}

/** Read a specific line from a terminal's buffer */
export async function bufferLine(page: Page, id: string, lineIndex: number): Promise<string> {
  return page.evaluate(
    ([tid, idx]) => {
      const entry = (window as any).getTerminal(tid);
      return entry?.terminal.buffer.active.getLine(idx)?.translateToString(true) ?? '';
    },
    [id, lineIndex] as const,
  );
}

/** Get terminal metadata from store */
export async function getTerminalMeta(page: Page, id: string) {
  return page.evaluate(
    (tid) =>
      (window as any).useTerminalStore
        .getState()
        .terminals.find((t: any) => t.id === tid),
    id,
  );
}
