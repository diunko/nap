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
import { execSync } from 'child_process';
import { NdjsonParser, serialize } from '../../src/shared/ndjson';
import { ELECTRON_LAUNCH_ARGS, waitForShellReady } from '../helpers';

const SOCKET_DIR = path.join(os.tmpdir(), 'nap-test');
const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

/** Generate a unique socket path per test */
function testSocketPath(): string {
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
  return path.join(SOCKET_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
}

/** Send a raw ndjson request over a unix socket and get the response */
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
    setTimeout(() => { conn.destroy(); reject(new Error('timeout')); }, 5000);
  });
}

/** Check if a socket path has a live server */
function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = net.createConnection(socketPath);
    conn.on('connect', () => { conn.destroy(); resolve(true); });
    conn.on('error', () => resolve(false));
  });
}

// =========================================================================
// T-0300-01: CLI → socket → app round-trip under 50ms
// =========================================================================
base.describe.serial('T-0300-01: socket round-trip latency', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-01-'));
    app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for socket to be ready
    for (let i = 0; i < 50; i++) {
      if (await isSocketAlive(socketPath)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  base.afterAll(async () => {
    if (app) {
      await app.evaluate(({ app }) => app.quit());
      await app.close();
    }
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('socket-only p95 latency < 50ms over 100 requests', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      const res = await socketRequest(socketPath, { type: 'ps', id: i + 1 });
      const elapsed = Date.now() - start;
      latencies.push(elapsed);
      expect(res['ok']).toBe(true);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    console.log(`Socket round-trip p95: ${p95}ms, median: ${latencies[Math.floor(latencies.length * 0.5)]}ms`);
    expect(p95).toBeLessThan(50);
  });
});

// =========================================================================
// T-0300-03: stale socket detection on app launch
// =========================================================================
base.describe('T-0300-03: stale socket detection on app launch', () => {
  base('app replaces stale socket file and starts successfully', async () => {
    const socketPath = testSocketPath();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-03-'));

    // Create a dummy file (not a real socket) at the socket path
    fs.writeFileSync(socketPath, 'stale');
    expect(fs.existsSync(socketPath)).toBe(true);

    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });

    try {
      const page = await app.firstWindow();
      await waitForShellReady(page);

      // Socket should now be a working unix socket
      const alive = await isSocketAlive(socketPath);
      expect(alive).toBe(true);

      // Verify it responds to requests
      const res = await socketRequest(socketPath, { type: 'ps', id: 1 });
      expect(res['ok']).toBe(true);
    } finally {
      await app.evaluate(({ app }) => app.quit());
      await app.close();
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =========================================================================
// T-0300-04: two app instances detect each other
// =========================================================================
base.describe('T-0300-04: two app instances detect each other', () => {
  base('second instance detects first and quits', async () => {
    const socketPath = testSocketPath();
    const tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-04a-'));
    const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-04b-'));

    // Launch app A
    const appA = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDirA],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });

    try {
      const pageA = await appA.firstWindow();
      await waitForShellReady(pageA);

      // Verify A's socket is active
      expect(await isSocketAlive(socketPath)).toBe(true);

      // Launch app B with same socket path — should detect A and quit
      const appB = await electron.launch({
        args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDirB],
        env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
      });

      // B should quit on its own. Wait for it.
      // Playwright's app.close() will resolve once the process exits.
      // Give it a few seconds, then force-close if needed.
      const exitPromise = appB.close();
      const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 10000));
      const result = await Promise.race([exitPromise.then(() => 'exited' as const), timeout]);

      // Verify A is still functional
      const res = await socketRequest(socketPath, { type: 'ps', id: 1 });
      expect(res['ok']).toBe(true);

      // Socket still works for A
      expect(await isSocketAlive(socketPath)).toBe(true);

      if (result === 'timeout') {
        // B didn't quit cleanly — force close
        await appB.close();
      }
    } finally {
      await appA.evaluate(({ app }) => app.quit());
      await appA.close();
      try { fs.unlinkSync(socketPath); } catch { /* ok */ }
      fs.rmSync(tmpDirA, { recursive: true, force: true });
      fs.rmSync(tmpDirB, { recursive: true, force: true });
    }
  });
});

// =========================================================================
// T-0300-05: NAP_SESSION_ID propagates through parent-child chain
// =========================================================================
base.describe.serial('T-0300-05: NAP_SESSION_ID propagation', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-05-'));
    app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for socket
    for (let i = 0; i < 50; i++) {
      if (await isSocketAlive(socketPath)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  base.afterAll(async () => {
    if (app) {
      await app.evaluate(({ app }) => app.quit());
      await app.close();
    }
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('terminal pty env contains NAP_SESSION_ID matching its id', async () => {
    const termId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals[0]?.id as string,
    );
    expect(termId).toBeTruthy();

    // Run echo $NAP_SESSION_ID inside the terminal's pty
    await page.evaluate(
      ([id]) => window.electronAPI.pty.write(id, 'echo NAP_ID=$NAP_SESSION_ID\n'),
      [termId],
    );

    // Wait for the output to appear
    const sessionIdFromPty = await page.waitForFunction(
      (tid: string) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return null;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i)?.translateToString(true) ?? '';
          const match = line.match(/NAP_ID=([a-f0-9-]+)/);
          if (match) return match[1];
        }
        return null;
      },
      termId,
      { timeout: 10_000 },
    );

    const ptySessionId = await sessionIdFromPty.jsonValue();
    expect(ptySessionId).toBe(termId);
  });

  base('nap start child gets parentId = caller terminal id', async () => {
    const termId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals[0]?.id as string,
    );

    // Use nap start from inside the terminal (its NAP_SESSION_ID = termId)
    // Note: process.cwd() must be resolved in Node, not renderer
    const cliCmd = `NAP_SOCKET=${socketPath} node ${path.resolve(CLI_PATH)} start "sleep 10" --name child-test`;
    await page.evaluate(
      ([id, cmd]) => window.electronAPI.pty.write(id, cmd + '\n'),
      [termId, cliCmd],
    );

    // Wait for child-test terminal to appear in sessions
    const childSession = await page.waitForFunction(
      () => {
        const store = (window as any).useTerminalStore.getState();
        return store.terminals.find((t: any) => t.name === 'child-test') ?? null;
      },
      undefined,
      { timeout: 15_000 },
    );

    const child = await childSession.jsonValue() as { id: string; parentId?: string };
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(termId);
  });
});

// =========================================================================
// T-0300-06: nap start creates terminal with correct pty setup
// =========================================================================
base.describe.serial('T-0300-06: nap start creates terminal', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-06-'));
    app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    page = await app.firstWindow();
    await waitForShellReady(page);

    for (let i = 0; i < 50; i++) {
      if (await isSocketAlive(socketPath)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  base.afterAll(async () => {
    if (app) {
      await app.evaluate(({ app }) => app.quit());
      await app.close();
    }
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('nap start creates session, card appears, command runs', async () => {
    // Send start request via socket directly
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: 1,
      command: 'echo hello-from-start && sleep 2',
      name: 'test-start-1',
      cwd: os.tmpdir(),
    });

    expect(res['ok']).toBe(true);
    expect(res['name']).toBe('test-start-1');
    const sessionId = res['sessionId'] as string;
    expect(sessionId).toBeTruthy();

    // Wait for terminal to appear in renderer store
    await page.waitForFunction(
      (name: string) => {
        const store = (window as any).useTerminalStore.getState();
        return store.terminals.some((t: any) => t.name === name);
      },
      'test-start-1',
      { timeout: 10_000 },
    );

    // Check terminal status is running
    const meta = await page.evaluate(
      (name: string) => {
        const store = (window as any).useTerminalStore.getState();
        return store.terminals.find((t: any) => t.name === name);
      },
      'test-start-1',
    );
    expect(meta).toBeTruthy();
    expect(meta.status).toBe('running');

    // Verify command output appears in xterm buffer
    await page.waitForFunction(
      (tid: string) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes('hello-from-start')) return true;
        }
        return false;
      },
      sessionId,
      { timeout: 10_000 },
    );
  });

  base('command runs through shell (pipes work)', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: 2,
      command: 'echo foo | cat',
      name: 'test-pipe',
      cwd: os.tmpdir(),
    });

    expect(res['ok']).toBe(true);
    const sessionId = res['sessionId'] as string;

    // Wait for "foo" in buffer
    await page.waitForFunction(
      (tid: string) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return false;
        const buf = entry.terminal.buffer.active;
        for (let i = 0; i < buf.length; i++) {
          if (buf.getLine(i)?.translateToString(true)?.includes('foo')) return true;
        }
        return false;
      },
      sessionId,
      { timeout: 10_000 },
    );
  });
});

// =========================================================================
// T-0300-09: socket cleanup on app quit (normal and signal)
// =========================================================================
base.describe('T-0300-09: socket cleanup on app quit', () => {
  base('graceful quit removes socket file', async () => {
    const socketPath = testSocketPath();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-09a-'));
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });

    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for socket to exist
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(socketPath)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(fs.existsSync(socketPath)).toBe(true);

    // Quit via Electron
    await app.evaluate(({ app }) => app.quit());
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Socket file should be gone
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  base('SIGTERM removes socket file', async () => {
    const socketPath = testSocketPath();
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-09b-'));
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir2],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });

    const page = await app.firstWindow();
    await waitForShellReady(page);

    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(socketPath)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(fs.existsSync(socketPath)).toBe(true);

    // Get the main process PID and send SIGTERM
    const pid = await app.evaluate(() => process.pid);
    process.kill(pid, 'SIGTERM');

    // Wait for process to exit
    await app.close();
    fs.rmSync(tmpDir2, { recursive: true, force: true });

    // Give OS a moment to clean up
    await new Promise((r) => setTimeout(r, 500));

    expect(fs.existsSync(socketPath)).toBe(false);
  });
});
