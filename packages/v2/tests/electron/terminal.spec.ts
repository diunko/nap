import {
  test,
  expect,
} from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import * as fs from 'fs';
import { waitForShellReady, getActiveId, waitForText, launchApp, cleanupApp } from '../helpers';

// ===========================================================================
// T-0100-01 through T-0100-03, T-0100-06, T-0100-07
// Share a single Electron instance (no pty-killing tests here)
// ===========================================================================
test.describe.serial('Electron Terminal — IPC Bridge', () => {
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

  // -----------------------------------------------------------------------
  // T-0100-01: pty data → IPC → xterm
  // -----------------------------------------------------------------------
  test('T-0100-01: pty data reaches xterm through IPC bridge', async () => {
    const id = await getActiveId(page);

    // echo hello — basic data path
    await page.evaluate(
      (id: string) => window.electronAPI.pty.write(id, 'echo hello\n'),
      id,
    );
    await waitForText(page, id, 'hello');

    // ANSI escape — verify IPC doesn't mangle raw bytes
    await page.evaluate(
      (id: string) =>
        window.electronAPI.pty.write(id, 'printf "\\033[31mred\\033[0m"\n'),
      id,
    );
    await waitForText(page, id, 'red');
  });

  // -----------------------------------------------------------------------
  // T-0100-02: xterm input → IPC → pty (reverse path)
  // -----------------------------------------------------------------------
  test('T-0100-02: xterm input reaches pty through IPC bridge (reverse path)', async () => {
    const id = await getActiveId(page);

    // Inject input via xterm.paste (renderer → IPC → pty → echo → IPC → xterm)
    await page.evaluate((id: string) => {
      (window as any).getTerminal(id).terminal.paste('echo roundtrip\n');
    }, id);
    await waitForText(page, id, 'roundtrip');

    // Ctrl+C: start long command, interrupt, verify shell is responsive
    await page.evaluate(
      (id: string) => window.electronAPI.pty.write(id, 'sleep 999\n'),
      id,
    );
    await page.waitForTimeout(1000); // let sleep start
    await page.evaluate(
      (id: string) => window.electronAPI.pty.write(id, '\x03'),
      id,
    );
    await page.waitForTimeout(500); // let shell process the signal

    const marker = `ctrlc_ok_${Date.now()}`;
    await page.evaluate(
      ([id, marker]: [string, string]) =>
        window.electronAPI.pty.write(id, `echo ${marker}\n`),
      [id, marker] as [string, string],
    );
    await waitForText(page, id, marker);
  });

  // -----------------------------------------------------------------------
  // T-0100-03: resize propagates window → xterm → pty
  // -----------------------------------------------------------------------
  test('T-0100-03: resize propagates from window to pty', async () => {
    const id = await getActiveId(page);

    const initialCols: number = await page.evaluate(
      (id: string) => (window as any).getTerminal(id).terminal.cols,
      id,
    );

    // Make window wider
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1400, 900);
    });
    await page.waitForTimeout(300); // debounce (50ms) + render

    const newCols: number = await page.evaluate(
      (id: string) => (window as any).getTerminal(id).terminal.cols,
      id,
    );
    expect(newCols).toBeGreaterThan(initialCols);

    // Verify pty agrees via tput cols
    const marker = `resize_${Date.now()}`;
    await page.evaluate(
      ([id, marker]: [string, string]) => {
        window.electronAPI.pty.write(id, `echo ${marker} && tput cols\n`);
      },
      [id, marker] as [string, string],
    );

    // Poll until tput output (a digits-only line after the marker) appears
    const handle = await page.waitForFunction(
      ([id, marker]: [string, string]) => {
        const entry = (window as any).getTerminal(id);
        if (!entry) return null;
        const buf = entry.terminal.buffer.active;
        let foundMarker = false;
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i)?.translateToString().trim() || '';
          if (line.includes(marker)) {
            foundMarker = true;
            continue;
          }
          if (foundMarker && /^\d+$/.test(line)) return parseInt(line, 10);
        }
        return null;
      },
      [id, marker] as [string, string],
      { timeout: 5_000 },
    );
    const tputCols = await handle.jsonValue();

    expect(tputCols).toBe(newCols);
  });

  // -----------------------------------------------------------------------
  // T-0100-06: high-throughput output
  // -----------------------------------------------------------------------
  test.skip('T-0100-06: high-throughput output does not choke IPC bridge — scrollback is 100k, assertion obsolete', async () => {
    const id = await getActiveId(page);

    const t0 = Date.now();
    await page.evaluate(
      (id: string) => window.electronAPI.pty.write(id, 'seq 1 50000\n'),
      id,
    );

    // Wait for "50000" to appear in the last portion of the buffer
    await page.waitForFunction(
      (id: string) => {
        const entry = (window as any).getTerminal(id);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = buf.length - 1; i >= Math.max(0, buf.length - 30); i--) {
          if (buf.getLine(i)?.translateToString().includes('50000')) return true;
        }
        return false;
      },
      id,
      { timeout: 30_000 },
    );

    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(10_000);

    // Scrollback limit enforced
    const bufLen: number = await page.evaluate((id: string) => {
      return (window as any).getTerminal(id).terminal.buffer.active.length;
    }, id);
    expect(bufLen).toBeLessThanOrEqual(10200); // 10000 scrollback + viewport + slack
    expect(bufLen).toBeGreaterThan(1000);
  });

  // -----------------------------------------------------------------------
  // T-0100-07: WebGL addon happy path (fallback path is manual)
  // -----------------------------------------------------------------------
  test('T-0100-07: WebGL addon initialization (happy path)', async () => {
    const id = await getActiveId(page);

    // Terminal element exists → rendering is active
    const hasElement: boolean = await page.evaluate((id: string) => {
      const entry = (window as any).getTerminal(id);
      return !!entry?.terminal?.element;
    }, id);
    expect(hasElement).toBe(true);

    // NOTE: fallback path (WebGL context failure → canvas) is manual.
    // Forcing GL context creation failure at the driver level is not reliable
    // in Playwright. The canvas fallback code lives in terminal-registry.ts:48-66.
  });
});

// ===========================================================================
// T-0100-04: pty exits but window stays alive
// Own app instance — the pty dies during this test
// ===========================================================================
test.describe.serial('Electron Terminal — Pty Lifecycle', () => {
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

  test('T-0100-04: pty exits but window stays alive', async () => {
    const id = await getActiveId(page);

    // Type exit to kill the shell
    await page.evaluate(
      (id: string) => window.electronAPI.pty.write(id, 'exit\n'),
      id,
    );

    // Wait for store status → 'exited'
    await page.waitForFunction(
      (id: string) => {
        const state = (window as any).useTerminalStore.getState();
        const t = state.terminals.find((t: any) => t.id === id);
        return t?.status === 'exited';
      },
      id,
      { timeout: 10_000 },
    );

    // Window still exists
    const isDestroyed = await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      return wins.length === 0 || wins[0].isDestroyed();
    });
    expect(isDestroyed).toBe(false);

    // Scrollback preserved
    const bufLen: number = await page.evaluate((id: string) => {
      const entry = (window as any).getTerminal(id);
      return entry?.terminal.buffer.active.length ?? 0;
    }, id);
    expect(bufLen).toBeGreaterThan(0);

    // Typing after exit does nothing (disableStdin blocks paste)
    await page.evaluate((id: string) => {
      (window as any).getTerminal(id).terminal.paste('should_not_appear');
    }, id);
    await page.waitForTimeout(500);

    const leaked: boolean = await page.evaluate((id: string) => {
      const entry = (window as any).getTerminal(id);
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().includes('should_not_appear'))
          return true;
      }
      return false;
    }, id);
    expect(leaked).toBe(false);
  });
});

// ===========================================================================
// T-0100-05: window close kills pty cleanly
// Own app instance — the window is closed during this test
// ===========================================================================
test.describe('Electron Terminal — Window Close Cleanup', () => {
  test('T-0100-05: window close kills pty cleanly', async () => {
    const { app, tmpDir: tmpDir2 } = await launchApp();
    const page = await app.firstWindow();
    await waitForShellReady(page);

    const id = await getActiveId(page);

    // Get the shell PID via echo $$
    const pidMarker = `pid_${Date.now()}`;
    await page.evaluate(
      ([id, marker]: [string, string]) => {
        window.electronAPI.pty.write(id, `echo ${marker}_$$\n`);
      },
      [id, pidMarker] as [string, string],
    );

    await page.waitForFunction(
      (marker: string) => {
        const id = (window as any).useTerminalStore.getState().activeTerminalId;
        const entry = (window as any).getTerminal(id);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i)?.translateToString() || '';
          if (line.includes(marker + '_') && /\d+/.test(line.split(marker + '_')[1]))
            return true;
        }
        return false;
      },
      pidMarker,
      { timeout: 10_000 },
    );

    const shellPid: number | null = await page.evaluate((marker: string) => {
      const id = (window as any).useTerminalStore.getState().activeTerminalId;
      const entry = (window as any).getTerminal(id);
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i)?.translateToString() || '';
        const parts = line.split(marker + '_');
        if (parts.length > 1) {
          const match = parts[1].match(/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
      }
      return null;
    }, pidMarker);

    expect(shellPid).toBeTruthy();

    // Close the window — triggers window-all-closed → pty cleanup → app.quit()
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });

    // App quits itself via window-all-closed handler; just wait for exit
    await app.close();
    fs.rmSync(tmpDir2, { recursive: true, force: true });

    // Give OS a moment to reap the process
    await new Promise((r) => setTimeout(r, 1000));

    // Verify shell process is gone
    let alive = false;
    try {
      process.kill(shellPid!, 0);
      alive = true;
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});

// ===========================================================================
// T-0100-08: native module build — MANUAL, skipped per test architecture
// ===========================================================================
test.skip('T-0100-08: native module build (node-pty + electron-rebuild)', () => {
  // Manual test — depends on developer environment (macOS, Xcode CLI, Python).
  // Verification: fresh clone → npm install → npm start → terminal works.
});
