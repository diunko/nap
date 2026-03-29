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
import { spawn } from 'child_process';
import { NdjsonParser, serialize } from '../../src/shared/ndjson';
import { ELECTRON_LAUNCH_ARGS, waitForShellReady } from '../helpers';

const SOCKET_DIR = path.join(os.tmpdir(), 'nap-test');
const CLI_PATH = path.join(__dirname, '../../out/cli/cli/nap.js');

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

function runCliAsync(
  args: string[],
  socketPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number; elapsed: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const env = { ...process.env, NAP_SOCKET: socketPath };
    delete env['NAP_SESSION_ID']; // strip to avoid FK violation against fresh test DB
    const proc = spawn('node', [CLI_PATH, ...args], { env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => proc.kill(), 30_000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, elapsed: Date.now() - start });
    });
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

async function hasTextInBuffer(page: Page, id: string, text: string): Promise<boolean> {
  return page.evaluate(
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

async function launchApp(
  socketPath: string,
): Promise<{ app: ElectronApplication; page: Page; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0400-'));
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
// T-0400-01 through T-0400-09 (shared app)
// =========================================================================
base.describe.serial('T-0400: poke, nap, done', () => {
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

  // --- T-0400-01: poke delivers message to pty stdin ---

  base('T-0400-01: poke delivers message to cat terminal', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'poke-target-01',
    });
    expect(res['ok']).toBe(true);
    const targetId = res['sessionId'] as string;
    await waitForTerminal(page, 'poke-target-01');

    const pokeRes = await socketRequest(socketPath, {
      type: 'poke',
      id: reqId++,
      name: 'poke-target-01',
      message: 'hello from A',
    });
    expect(pokeRes['ok']).toBe(true);

    // cat echoes stdin back to stdout — message appears in buffer
    await waitForBufferText(page, targetId, 'hello from A');
  });

  base('T-0400-01: poke delivers special characters without shell interpretation', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'poke-special-01',
    });
    expect(res['ok']).toBe(true);
    const targetId = res['sessionId'] as string;
    await waitForTerminal(page, 'poke-special-01');

    const pokeRes = await socketRequest(socketPath, {
      type: 'poke',
      id: reqId++,
      name: 'poke-special-01',
      message: 'quotes "and" backslashes \\',
    });
    expect(pokeRes['ok']).toBe(true);

    // Raw text should arrive — no shell interpretation
    await waitForBufferText(page, targetId, 'quotes "and" backslashes');
  });

  // --- T-0400-02: poke queue preserves order with 500ms delay ---

  base('T-0400-02: poke queue preserves FIFO order', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'poke-order-02',
    });
    expect(res['ok']).toBe(true);
    const targetId = res['sessionId'] as string;
    await waitForTerminal(page, 'poke-order-02');

    // Rapid-fire three pokes
    await socketRequest(socketPath, {
      type: 'poke', id: reqId++, name: 'poke-order-02', message: 'msg-first',
    });
    await socketRequest(socketPath, {
      type: 'poke', id: reqId++, name: 'poke-order-02', message: 'msg-second',
    });
    await socketRequest(socketPath, {
      type: 'poke', id: reqId++, name: 'poke-order-02', message: 'msg-third',
    });

    // Fourth poke while first three are being processed
    await new Promise((r) => setTimeout(r, 200));
    await socketRequest(socketPath, {
      type: 'poke', id: reqId++, name: 'poke-order-02', message: 'msg-fourth',
    });

    // Wait for all four to appear in buffer
    await waitForBufferText(page, targetId, 'msg-fourth', 10_000);

    // Verify FIFO order: line indices must be strictly increasing
    const indices = await page.evaluate(
      ([tid, texts]: [string, string[]]) => {
        const entry = (window as any).getTerminal(tid);
        if (!entry) return texts.map(() => -1);
        const buf = entry.terminal.buffer.active;
        return texts.map((txt) => {
          for (let i = 0; i < buf.length; i++) {
            if (buf.getLine(i)?.translateToString().includes(txt)) return i;
          }
          return -1;
        });
      },
      [targetId, ['msg-first', 'msg-second', 'msg-third', 'msg-fourth']] as [
        string,
        string[],
      ],
    );

    expect(indices[0]).toBeGreaterThanOrEqual(0);
    expect(indices[1]).toBeGreaterThan(indices[0]);
    expect(indices[2]).toBeGreaterThan(indices[1]);
    expect(indices[3]).toBeGreaterThan(indices[2]);
  });

  // --- T-0400-03: poke to dead terminal returns error ---

  base('T-0400-03: poke to exited terminal returns error', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'exit 0',
      name: 'dead-03',
    });
    expect(res['ok']).toBe(true);
    await waitForTerminal(page, 'dead-03');

    await waitForStatus(page, 'dead-03', 'exited');

    const pokeRes = await socketRequest(socketPath, {
      type: 'poke',
      id: reqId++,
      name: 'dead-03',
      message: 'hello',
    });
    expect(pokeRes['error']).toBe('not_running');
    expect(pokeRes['message']).toContain('not running');
  });

  base('T-0400-03: poke to done terminal returns error', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'done-03',
    });
    expect(res['ok']).toBe(true);
    const targetId = res['sessionId'] as string;
    await waitForTerminal(page, 'done-03');

    // Mark terminal as done
    await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId: targetId,
      message: 'finished',
    });

    const pokeRes = await socketRequest(socketPath, {
      type: 'poke',
      id: reqId++,
      name: 'done-03',
      message: 'hello',
    });
    expect(pokeRes['error']).toBe('not_running');
  });

  // --- T-0400-07: nap done sets status, pokes parent, stores message ---

  base('T-0400-07: nap done sets status, pokes parent, stores message', async () => {
    // Parent running cat to receive poke via stdin
    const parentRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'parent-07',
    });
    expect(parentRes['ok']).toBe(true);
    const parentId = parentRes['sessionId'] as string;
    await waitForTerminal(page, 'parent-07');

    // Child with parentId set
    const childRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'child-07',
      parentId,
    });
    expect(childRes['ok']).toBe(true);
    const childId = childRes['sessionId'] as string;
    await waitForTerminal(page, 'child-07');

    // Child signals done
    const doneRes = await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId: childId,
      message: 'the answer is 42',
    });
    expect(doneRes['ok']).toBe(true);

    // 1) Child status flipped to 'done'
    await waitForStatus(page, 'child-07', 'done', 5_000);

    // 2) Done-message stored
    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: reqId++,
      name: 'child-07',
    });
    expect(statusRes['status']).toBe('done');
    expect(statusRes['doneMessage']).toBe('the answer is 42');

    // 3) Parent received poke with the done message
    await waitForBufferText(page, parentId, 'the answer is 42', 5_000);
  });

  base('T-0400-07: done succeeds even when parent has exited', async () => {
    // Parent that exits immediately
    const parentRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'exit 0',
      name: 'dead-parent-07',
    });
    const parentId = parentRes['sessionId'] as string;
    await waitForTerminal(page, 'dead-parent-07');
    await waitForStatus(page, 'dead-parent-07', 'exited');

    // Child with dead parent
    const childRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'orphan-07',
      parentId,
    });
    const childId = childRes['sessionId'] as string;
    await waitForTerminal(page, 'orphan-07');

    // Done should still succeed — status change is independent of poke delivery
    const doneRes = await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId: childId,
      message: 'orphan result',
    });
    expect(doneRes['ok']).toBe(true);

    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: reqId++,
      name: 'orphan-07',
    });
    expect(statusRes['status']).toBe('done');
    expect(statusRes['doneMessage']).toBe('orphan result');
  });

  // --- T-0400-09: nap done called twice is a no-op ---

  base('T-0400-09: second nap done is no-op — message not overwritten, parent not re-poked', async () => {
    // Parent running cat
    const parentRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'cat',
      name: 'parent-09',
    });
    expect(parentRes['ok']).toBe(true);
    const parentId = parentRes['sessionId'] as string;
    await waitForTerminal(page, 'parent-09');

    // Child
    const childRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'child-09',
      parentId,
    });
    expect(childRes['ok']).toBe(true);
    const childId = childRes['sessionId'] as string;
    await waitForTerminal(page, 'child-09');

    // First done
    const done1 = await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId: childId,
      message: 'first-09',
    });
    expect(done1['ok']).toBe(true);
    await waitForBufferText(page, parentId, 'first-09', 5_000);

    // Second done — should be no-op
    const done2 = await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId: childId,
      message: 'second-09',
    });
    expect(done2['ok']).toBe(true);

    // Done-message still "first-09" (not overwritten)
    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: reqId++,
      name: 'child-09',
    });
    expect(statusRes['doneMessage']).toBe('first-09');

    // "second-09" should NOT appear in parent buffer
    await new Promise((r) => setTimeout(r, 1_000));
    const hasSecond = await hasTextInBuffer(page, parentId, 'second-09');
    expect(hasSecond).toBe(false);
  });

  // --- T-0400-05: nap nap on already-done terminal returns immediately ---

  base('T-0400-05: nap nap on already-done terminal returns immediately', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'early-05',
    });
    expect(res['ok']).toBe(true);
    const sessionId = res['sessionId'] as string;
    await waitForTerminal(page, 'early-05');

    // Mark done before nap nap starts
    await socketRequest(socketPath, {
      type: 'done',
      id: reqId++,
      sessionId,
      message: 'early-bird',
    });

    // nap nap should detect done on first poll and return immediately
    const result = await runCliAsync(
      ['nap', 'early-05', '--timeout', '10'],
      socketPath,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('early-bird');
    expect(result.elapsed).toBeLessThan(3_000);
  });

  // --- T-0400-04: nap nap blocks and unblocks on done ---

  base('T-0400-04: nap nap blocks until done, then exits 0 with done-message', async () => {
    const cliPath = path.resolve(CLI_PATH);

    // Worker: sleep 2s then call done via CLI
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: `sleep 2 && node ${cliPath} done "result-42"`,
      name: 'worker-04',
    });
    expect(res['ok']).toBe(true);
    await waitForTerminal(page, 'worker-04');

    // nap nap polls until worker is done
    const result = await runCliAsync(
      ['nap', 'worker-04', '--timeout', '10'],
      socketPath,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('result-42');
    // ~2s sleep + up to 1s poll interval + overhead
    expect(result.elapsed).toBeGreaterThan(1_500);
    expect(result.elapsed).toBeLessThan(8_000);

    // Worker called done before pty exited — status should persist as 'done'
    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: reqId++,
      name: 'worker-04',
    });
    expect(statusRes['status']).toBe('done');
  });

  // --- T-0400-06: nap nap timeout exits without killing target ---

  base('T-0400-06: nap nap timeout exits 1 without killing target', async () => {
    const res = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: 'sleep 999',
      name: 'stuck-06',
    });
    expect(res['ok']).toBe(true);
    await waitForTerminal(page, 'stuck-06');

    const result = await runCliAsync(
      ['nap', 'stuck-06', '--timeout', '3'],
      socketPath,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('timeout waiting for stuck-06');
    expect(result.elapsed).toBeGreaterThan(2_500);
    expect(result.elapsed).toBeLessThan(6_000);

    // Target should still be running — timeout does NOT kill it
    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: reqId++,
      name: 'stuck-06',
    });
    expect(statusRes['status']).toBe('running');
  });
});

// =========================================================================
// T-0400-10: full spawn-wait-receive loop
// =========================================================================
base.describe.serial('T-0400-10: full spawn-wait-receive loop', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchApp(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeApp(app, socketPath, tmpDir);
  });

  base('parent starts child, nap nap child, child done, parent receives result', async () => {
    // Use the initial shell terminal as parent
    const parentId = await page.evaluate(
      () =>
        (window as any).useTerminalStore.getState().terminals[0]?.id as string,
    );
    expect(parentId).toBeTruthy();

    const cliPath = path.resolve(CLI_PATH);
    // Script: start worker → nap nap worker → capture result → echo it
    const script = [
      `node ${cliPath} start "sleep 2 && node ${cliPath} done result-42" --name worker-10`,
      `RESULT=$(node ${cliPath} nap worker-10 --timeout 15)`,
      `echo "GOT: $RESULT"`,
    ].join(' && ');

    await page.evaluate(
      ([id, cmd]) => window.electronAPI.pty.write(id, cmd + '\n'),
      [parentId, script],
    );

    // Wait for the full loop to complete
    await waitForBufferText(page, parentId, 'GOT: result-42', 30_000);

    // Worker called done — status should persist as 'done' even after pty exits
    await waitForStatus(page, 'worker-10', 'done', 10_000);
  });
});
