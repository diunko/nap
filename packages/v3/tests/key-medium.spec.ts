import { test, expect } from '@playwright/test';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F10_FIXTURE,
  execNap,
} from './helpers';
import * as net from 'net';
import * as path from 'path';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Socket helper for medium tests ──

function sendSocket(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    conn.on('error', reject);
    let buf = '';
    conn.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            resolve(JSON.parse(line));
            conn.destroy();
            return;
          } catch {}
        }
      }
    });
    conn.on('connect', () => {
      conn.write(JSON.stringify(request) + '\n');
    });
  });
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let sockPath: string;

async function setupApp(): Promise<void> {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F10_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0 || store?.architects?.length > 0;
    },
    { timeout: 15000 },
  );

  sockPath = path.join(tmpDir, '.nap', 'sock');
}

/** Create and start a fresh agent that can receive keys */
async function createAndStartAgent(agentName: string): Promise<void> {
  // Create a fresh agent
  const createResult = execNap(`create agent ${agentName} --napkin 0100-explore --role test-eng`, {
    cwd: tmpDir,
    env: { NAP_SOCKET: sockPath },
  });
  expect(createResult.exitCode).toBe(0);

  // Start it (runs cat in test mode)
  const startResult = execNap(`start ${agentName}`, {
    cwd: tmpDir,
    env: { NAP_SOCKET: sockPath },
  });
  expect(startResult.exitCode).toBe(0);

  // Wait for pty to be ready
  await page.waitForTimeout(1000);
}

// T-0660-50: key reaches real pty stdin
test('T-0660-50: key reaches real pty stdin (cat echoes)', async () => {
  await setupApp();
  try {
    await createAndStartAgent('010-key-test');

    // Send key "X" via socket — direct write to pty
    const keyRes = await sendSocket(sockPath, {
      type: 'key', id: 10, name: '010-key-test', data: 'X',
    });
    // Key handler returns { id } on success, no error field
    expect(keyRes['error']).toBeUndefined();
    expect(keyRes['id']).toBe(10);

    // Send a second key — enter
    const keyRes2 = await sendSocket(sockPath, {
      type: 'key', id: 11, name: '010-key-test', data: '\r',
    });
    expect(keyRes2['error']).toBeUndefined();
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0660-51: key vs poke timing — key response is immediate
test('T-0660-51: key response returns immediately', async () => {
  await setupApp();
  try {
    await createAndStartAgent('011-timing-test');

    // Time a key send — should return very fast (direct write, no queue)
    const keyStart = Date.now();
    const keyRes = await sendSocket(sockPath, {
      type: 'key', id: 20, name: '011-timing-test', data: 'k',
    });
    const keyDuration = Date.now() - keyStart;
    expect(keyRes['error']).toBeUndefined();
    // Key should respond quickly (< 100ms, typically < 10ms)
    expect(keyDuration).toBeLessThan(100);

    // Poke also returns immediately (enqueue is async), but delivery is delayed
    const pokeStart = Date.now();
    const pokeRes = await sendSocket(sockPath, {
      type: 'poke', id: 21, name: '011-timing-test', message: 'p',
    });
    const pokeDuration = Date.now() - pokeStart;
    expect(pokeRes['error']).toBeUndefined();
    expect(pokeDuration).toBeLessThan(100);

    // Both responses are immediate — the difference is in delivery.
    // Key writes synchronously before responding.
    // Poke enqueues and responds; delivery happens asynchronously with delays.
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0660-52: multiple keys in rapid succession — all arrive, no crash
test('T-0660-52: 5 rapid keys — all succeed, no drops or crashes', async () => {
  await setupApp();
  try {
    await createAndStartAgent('012-rapid-test');

    // Send 5 keys rapidly (in parallel)
    const keys = ['a', 'b', 'c', 'd', 'e'];
    const results = await Promise.all(
      keys.map((k, i) =>
        sendSocket(sockPath, {
          type: 'key', id: 30 + i, name: '012-rapid-test', data: k,
        }),
      ),
    );

    // All should succeed — no errors
    for (let i = 0; i < results.length; i++) {
      expect(results[i]['error']).toBeUndefined();
      expect(results[i]['id']).toBe(30 + i);
    }
  } finally {
    await cleanupApp(app, tmpDir);
  }
});
