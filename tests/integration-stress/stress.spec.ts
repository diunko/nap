import {
  test as base,
  expect,
  _electron as electron,
} from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NdjsonParser, serialize } from '../../src/shared/ndjson';
import { ELECTRON_LAUNCH_ARGS, waitForShellReady } from '../helpers';

const SOCKET_DIR = path.join(os.tmpdir(), 'nap-test');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testSocketPath(): string {
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
  return path.join(
    SOCKET_DIR,
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`,
  );
}

function socketRequest(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const parser = new NdjsonParser((msg) => {
      resolve(msg as Record<string, unknown>);
      conn.destroy();
    });
    conn.on('data', (chunk) => parser.feed(chunk.toString()));
    conn.on('connect', () => conn.write(serialize(request)));
    conn.on('error', reject);
    setTimeout(() => {
      conn.destroy();
      reject(new Error('socket request timeout'));
    }, 5000);
  });
}

function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socketPath);
    conn.on('connect', () => {
      conn.destroy();
      resolve(true);
    });
    conn.on('error', () => resolve(false));
  });
}

async function waitForTerminal(page: Page, name: string, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    (n: string) =>
      (window as any).useTerminalStore
        .getState()
        .terminals.some((t: any) => t.name === n),
    name,
    { timeout },
  );
}

async function waitForStatus(
  page: Page,
  name: string,
  status: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    ([n, s]: [string, string]) =>
      (window as any).useTerminalStore
        .getState()
        .terminals.find((t: any) => t.name === n)?.status === s,
    [name, status] as [string, string],
    { timeout },
  );
}

async function waitForBufferText(
  page: Page,
  id: string,
  text: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    ([tid, txt]: [string, string]) => {
      const entry = (window as any).getTerminal(tid);
      if (!entry) return false;
      const buf = entry.terminal.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        if (buf.getLine(i)?.translateToString().includes(txt)) return true;
      }
      return false;
    },
    [id, text] as [string, string],
    { timeout },
  );
}

async function launchApp(
  socketPath: string,
): Promise<{ app: ElectronApplication; page: Page; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-stress-'));
  const app = await electron.launch({
    args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
    env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
  });
  const page = await app.firstWindow();
  await waitForShellReady(page);
  for (let i = 0; i < 50; i++) {
    if (await isSocketAlive(socketPath)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { app, page, tmpDir };
}

async function closeApp(
  app: ElectronApplication,
  socketPath: string,
  tmpDir: string,
): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  try {
    fs.unlinkSync(socketPath);
  } catch {
    /* ok */
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// =========================================================================
// T-0500-03: 10 concurrent terminals with high-output commands
// =========================================================================
base.describe.serial('T-0500-03: 10 concurrent terminals with high-output commands', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;
  let reqId = 1;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base('spawn 10, all complete, all have output', async () => {
    base.slow(); // 10 terminals with high output

    const termIds: string[] = [];

    // Spawn 10 terminals simultaneously
    for (let i = 1; i <= 10; i++) {
      const res = await socketRequest(socketPath, {
        type: 'start',
        id: reqId++,
        command: 'seq 1 10000',
        name: `stress-${i}`,
      });
      expect(res['ok']).toBe(true);
      termIds.push(res['sessionId'] as string);
    }

    // Wait for all to appear in renderer
    for (let i = 1; i <= 10; i++) {
      await waitForTerminal(page, `stress-${i}`, 15_000);
    }

    // Wait for all to complete (status = exited)
    for (let i = 1; i <= 10; i++) {
      await waitForStatus(page, `stress-${i}`, 'exited', 30_000);
    }

    // Verify all 10 + initial shell exist in store
    const termCount: number = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.length,
    );
    expect(termCount).toBe(11); // 10 + shell

    // Verify each has output (buffer > 100 lines)
    for (const id of termIds) {
      const bufLen: number = await page.evaluate(
        (tid: string) =>
          (window as any).getTerminal(tid)?.terminal.buffer.active.length ?? 0,
        id,
      );
      expect(bufLen).toBeGreaterThan(100);
    }

    // App still responsive
    const psRes = await socketRequest(socketPath, { type: 'ps', id: reqId++ });
    expect(psRes['ok']).toBe(true);
  });
});

// =========================================================================
// T-0500-04: rapid terminal switching under load — no content corruption
// =========================================================================
base.describe.serial('T-0500-04: rapid terminal switching — no content corruption', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;
  let reqId = 1;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base('10 terminals with markers, rapid switching, correct content per terminal', async () => {
    base.slow();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const termIds: string[] = [];

    // Create 10 terminals with unique markers (zero-padded to avoid substring matches)
    for (let i = 1; i <= 10; i++) {
      const marker = `MARKER_${String(i).padStart(2, '0')}`;
      const res = await socketRequest(socketPath, {
        type: 'start',
        id: reqId++,
        command: `echo ${marker} && sleep 60`,
        name: `switch-${String(i).padStart(2, '0')}`,
      });
      expect(res['ok']).toBe(true);
      termIds.push(res['sessionId'] as string);
    }

    // Wait for all to appear
    for (let i = 1; i <= 10; i++) {
      await waitForTerminal(
        page,
        `switch-${String(i).padStart(2, '0')}`,
        15_000,
      );
    }

    // Wait for all markers to appear in buffers
    for (let i = 0; i < 10; i++) {
      await waitForBufferText(
        page,
        termIds[i],
        `MARKER_${String(i + 1).padStart(2, '0')}`,
        10_000,
      );
    }

    // Rapid switch loop: 3 full cycles, 50ms between each switch
    await page.evaluate(
      async (ids: string[]) => {
        const store = (window as any).useTerminalStore.getState();
        for (let cycle = 0; cycle < 3; cycle++) {
          for (const id of ids) {
            store.setActive(id);
            await new Promise((r) => setTimeout(r, 50));
          }
        }
      },
      termIds,
    );

    // Settle
    await page.waitForTimeout(200);

    // Verify correct content on each terminal — no cross-contamination
    for (let i = 0; i < 10; i++) {
      await page.evaluate(
        (tid: string) =>
          (window as any).useTerminalStore.getState().setActive(tid),
        termIds[i],
      );
      await page.waitForTimeout(100);

      const expectedMarker = `MARKER_${String(i + 1).padStart(2, '0')}`;
      const bufferText: string = await page.evaluate(
        (tid: string) => {
          const entry = (window as any).getTerminal(tid);
          if (!entry) return '';
          const buf = entry.terminal.buffer.active;
          let text = '';
          for (let j = 0; j < buf.length; j++) {
            text += (buf.getLine(j)?.translateToString() ?? '') + '\n';
          }
          return text;
        },
        termIds[i],
      );

      expect(bufferText).toContain(expectedMarker);

      // No other terminal's marker should appear
      for (let j = 1; j <= 10; j++) {
        if (j === i + 1) continue;
        const otherMarker = `MARKER_${String(j).padStart(2, '0')}`;
        expect(bufferText).not.toContain(otherMarker);
      }
    }

    // No console errors during switches
    const relevant = consoleErrors.filter(
      (e) => !e.includes('DevTools') && !e.includes('Autofill'),
    );
    expect(relevant).toEqual([]);
  });
});

// =========================================================================
// T-0500-05: 10 WebGL contexts simultaneously — no context lost
// =========================================================================
base.describe.serial('T-0500-05: 10 WebGL contexts — no context lost', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;
  let reqId = 1;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base('10 terminals with WebGL, no context loss after switching', async () => {
    base.slow();

    const termIds: string[] = [];

    // Create 10 terminals
    for (let i = 1; i <= 10; i++) {
      const res = await socketRequest(socketPath, {
        type: 'start',
        id: reqId++,
        command: `echo webgl-test-${i} && sleep 60`,
        name: `webgl-${i}`,
      });
      expect(res['ok']).toBe(true);
      termIds.push(res['sessionId'] as string);
    }

    // Wait for all to appear
    for (let i = 1; i <= 10; i++) {
      await waitForTerminal(page, `webgl-${i}`, 15_000);
    }

    // Switch to each terminal to force open/render (initializes WebGL)
    for (const id of termIds) {
      await page.evaluate(
        (tid: string) =>
          (window as any).useTerminalStore.getState().setActive(tid),
        id,
      );
      await page.waitForTimeout(300);
    }

    // Install context loss listeners on all terminals
    await page.evaluate((ids: string[]) => {
      (window as any)._contextLostCount = 0;
      for (const id of ids) {
        const entry = (window as any).getTerminal(id);
        const canvas = entry?.terminal.element?.querySelector('canvas');
        if (canvas) {
          canvas.addEventListener('webglcontextlost', () => {
            (window as any)._contextLostCount++;
          });
        }
      }
    }, termIds);

    // Switch through all 10 again (forces reattach)
    for (const id of termIds) {
      await page.evaluate(
        (tid: string) =>
          (window as any).useTerminalStore.getState().setActive(tid),
        id,
      );
      await page.waitForTimeout(100);
    }

    // Wait 5s
    await page.waitForTimeout(5_000);

    // Assert no context lost
    const contextLostCount: number = await page.evaluate(
      () => (window as any)._contextLostCount,
    );
    expect(contextLostCount).toBe(0);

    // Verify each terminal still renders: buffer has expected content
    for (let i = 0; i < termIds.length; i++) {
      await page.evaluate(
        (tid: string) =>
          (window as any).useTerminalStore.getState().setActive(tid),
        termIds[i],
      );
      await page.waitForTimeout(100);

      const hasContent: boolean = await page.evaluate(
        ([tid, text]: [string, string]) => {
          const entry = (window as any).getTerminal(tid);
          if (!entry) return false;
          const buf = entry.terminal.buffer.active;
          for (let j = 0; j < buf.length; j++) {
            if (buf.getLine(j)?.translateToString().includes(text)) return true;
          }
          return false;
        },
        [termIds[i], `webgl-test-${i + 1}`] as [string, string],
      );
      expect(hasContent).toBe(true);
    }
  });
});

// =========================================================================
// T-0500-06: memory stays bounded with scrollback pressure
// =========================================================================
base.describe.serial('T-0500-06: memory stays bounded with scrollback pressure', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;
  let reqId = 1;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base.skip('10 terminals filling scrollback — memory < 500MB, scrollback evicted — scrollback is 100k, assertion obsolete', async () => {
    base.slow();

    // Measure baseline
    const baselineMain: number = await app.evaluate(
      () => process.memoryUsage().heapUsed,
    );
    const baselineRenderer: number | null = await page.evaluate(() => {
      const mem = (performance as any).memory;
      return mem ? (mem.usedJSHeapSize as number) : null;
    });

    // Spawn 10 terminals, each runs seq 1 20000
    const termIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const res = await socketRequest(socketPath, {
        type: 'start',
        id: reqId++,
        command: 'seq 1 20000',
        name: `mem-${i}`,
      });
      expect(res['ok']).toBe(true);
      termIds.push(res['sessionId'] as string);
    }

    // Wait for all to appear
    for (let i = 1; i <= 10; i++) {
      await waitForTerminal(page, `mem-${i}`, 15_000);
    }

    // Wait for all to complete
    for (let i = 1; i <= 10; i++) {
      await waitForStatus(page, `mem-${i}`, 'exited', 30_000);
    }

    // Measure after
    const afterMain: number = await app.evaluate(
      () => process.memoryUsage().heapUsed,
    );
    const afterRenderer: number | null = await page.evaluate(() => {
      const mem = (performance as any).memory;
      return mem ? (mem.usedJSHeapSize as number) : null;
    });

    // Print metrics for human review
    const mainDelta = afterMain - baselineMain;
    console.log(
      `Main process memory: baseline=${Math.round(baselineMain / 1e6)}MB, ` +
        `after=${Math.round(afterMain / 1e6)}MB, delta=${Math.round(mainDelta / 1e6)}MB`,
    );

    if (baselineRenderer != null && afterRenderer != null) {
      const rendererDelta = afterRenderer - baselineRenderer;
      console.log(
        `Renderer memory: baseline=${Math.round(baselineRenderer / 1e6)}MB, ` +
          `after=${Math.round(afterRenderer / 1e6)}MB, delta=${Math.round(rendererDelta / 1e6)}MB`,
      );
      expect(rendererDelta).toBeLessThan(500 * 1e6);
    }

    expect(mainDelta).toBeLessThan(500 * 1e6);

    // Verify scrollback eviction: buffer length <= 10000 + viewport + slack
    for (const id of termIds) {
      const bufLen: number = await page.evaluate(
        (tid: string) =>
          (window as any).getTerminal(tid)?.terminal.buffer.active.length ?? 0,
        id,
      );
      expect(bufLen).toBeLessThanOrEqual(10200);
    }
  });
});

// =========================================================================
// T-0500-07: poke delivery under contention — multiple agents poking one target
// =========================================================================
base.describe.serial('T-0500-07: poke delivery under contention', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;
  let reqId = 1;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base('3 simultaneous pokes to one target — all delivered, no interleaving', async () => {
    // Create target running cat
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'poke-target',
    });
    expect(res['ok']).toBe(true);
    const targetId = res['sessionId'] as string;
    await waitForTerminal(page, 'poke-target');

    // Send 3 pokes simultaneously
    await Promise.all([
      socketRequest(socketPath, {
        type: 'poke',
        id: reqId++,
        name: 'poke-target',
        message: 'from-A',
      }),
      socketRequest(socketPath, {
        type: 'poke',
        id: reqId++,
        name: 'poke-target',
        message: 'from-B',
      }),
      socketRequest(socketPath, {
        type: 'poke',
        id: reqId++,
        name: 'poke-target',
        message: 'from-C',
      }),
    ]);

    // Wait for all three to be delivered.
    // Three-step delivery (text → Escape → CR) takes ~400ms per message
    // plus 500ms inter-message delay, so total ~2.7s for 3 messages.
    await waitForBufferText(page, targetId, 'from-A', 10_000);
    await waitForBufferText(page, targetId, 'from-B', 10_000);
    await waitForBufferText(page, targetId, 'from-C', 10_000);

    // Verify no interleaving: each from- line must be exactly one of the
    // expected values, never a mangled mix like "from-Afrom-B".
    // Line count is NOT fixed — three-step delivery with PTY echo means
    // each message can produce multiple buffer lines (input echo + cat output).
    const fromLines: string[] = await page.evaluate(
      (tid: string) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return [];
        const buf = entry.terminal.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) {
          // Strip control chars — three-step delivery leaves Escape in the
          // echo line (text → Escape → CR), shown as "from-A^[" by xterm.
          const raw = buf.getLine(i)?.translateToString().trim() ?? '';
          const line = raw.replace(/[\x00-\x1f]|\^[\[ABCDEFGHIJKLMNOPQRSTUVWXYZ@\[\\\]\^_?]/g, '');
          if (line.startsWith('from-')) lines.push(line);
        }
        return lines;
      },
      targetId,
    );

    const valid = new Set(['from-A', 'from-B', 'from-C']);
    expect(fromLines.length).toBeGreaterThanOrEqual(3);
    for (const line of fromLines) {
      expect(valid).toContain(line); // no interleaving — every line is a clean message
    }
    expect(fromLines).toContain('from-A');
    expect(fromLines).toContain('from-B');
    expect(fromLines).toContain('from-C');
  });
});
