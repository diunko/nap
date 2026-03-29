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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0500-'));
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
// T-0500-01: full CLI command sequence runs unattended
// =========================================================================
base.describe.serial('T-0500-01: full CLI command sequence runs unattended', () => {
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

  base('full integration sequence', async () => {
    const cliPath = path.resolve(CLI_PATH);

    // 1. nap start agent-a (cat stays alive, receives pokes via stdin)
    const startA = await runCliAsync(
      ['start', 'cat', '--name', 'agent-a'],
      socketPath,
    );
    expect(startA.exitCode).toBe(0);
    const jsonA = JSON.parse(startA.stdout.trim());
    expect(jsonA.name).toBe('agent-a');
    await waitForTerminal(page, 'agent-a');

    // 2. nap start agent-b (sleeps, then signals done)
    const startB = await runCliAsync(
      ['start', `sleep 3 && node ${cliPath} done finished-sleeping`, '--name', 'agent-b'],
      socketPath,
    );
    expect(startB.exitCode).toBe(0);
    const jsonB = JSON.parse(startB.stdout.trim());
    expect(jsonB.name).toBe('agent-b');
    await waitForTerminal(page, 'agent-b');

    // 3. nap ps --json -> 3 sessions (shell + agent-a + agent-b)
    const ps1 = await runCliAsync(['ps', '--json'], socketPath);
    expect(ps1.exitCode).toBe(0);
    const sessions1 = JSON.parse(ps1.stdout) as { name: string; status: string }[];
    expect(sessions1.length).toBe(3);
    const names1 = sessions1.map((s) => s.name);
    expect(names1).toContain('shell');
    expect(names1).toContain('agent-a');
    expect(names1).toContain('agent-b');

    // 4. nap poke agent-a "wake up" -> exit 0
    const poke = await runCliAsync(['poke', 'agent-a', 'wake up'], socketPath);
    expect(poke.exitCode).toBe(0);

    // 5. nap peek agent-a -> exit 0
    const peek = await runCliAsync(['peek', 'agent-a'], socketPath);
    expect(peek.exitCode).toBe(0);

    // 6. nap nap agent-b --timeout 15 -> output contains "finished-sleeping"
    const napResult = await runCliAsync(
      ['nap', 'agent-b', '--timeout', '15'],
      socketPath,
    );
    expect(napResult.exitCode).toBe(0);
    expect(napResult.stdout).toContain('finished-sleeping');

    // 7. nap kill agent-a -> exit 0
    const kill = await runCliAsync(['kill', 'agent-a'], socketPath);
    expect(kill.exitCode).toBe(0);

    // 8. nap ps -> agent-a status is "exited"
    await waitForStatus(page, 'agent-a', 'exited', 5_000);
    const ps2 = await runCliAsync(['ps', '--json'], socketPath);
    expect(ps2.exitCode).toBe(0);
    const sessions2 = JSON.parse(ps2.stdout) as { name: string; status: string }[];
    const agentA2 = sessions2.find((s) => s.name === 'agent-a');
    expect(agentA2).toBeDefined();
    expect(agentA2!.status).toBe('exited');

    // 9. nap close agent-a -> exit 0
    const close = await runCliAsync(['close', 'agent-a'], socketPath);
    expect(close.exitCode).toBe(0);

    // 10. nap ps -> 2 sessions remain (shell + agent-b)
    const ps3 = await runCliAsync(['ps', '--json'], socketPath);
    expect(ps3.exitCode).toBe(0);
    const sessions3 = JSON.parse(ps3.stdout) as { name: string; status: string }[];
    expect(sessions3.length).toBe(2);
    const names3 = sessions3.map((s) => s.name);
    expect(names3).toContain('shell');
    expect(names3).toContain('agent-b');
  });
});

// =========================================================================
// T-0500-02: parent-child chain three levels deep
// =========================================================================
base.describe.serial('T-0500-02: parent-child chain three levels deep', () => {
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

  base('shell -> child -> grandchild done chain propagates correctly', async () => {
    const cliPath = path.resolve(CLI_PATH);

    // Get shell terminal ID
    const shellId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals[0]?.id as string,
    );
    expect(shellId).toBeTruthy();

    // Start child via socket with parentId = shellId
    // Child command: start grandchild -> nap nap grandchild -> nap done
    const childCommand = [
      `node ${cliPath} start "sleep 2 && node ${cliPath} done child-result" --name grandchild`,
      `node ${cliPath} nap grandchild --timeout 10`,
      `node ${cliPath} done got-grandchild`,
    ].join(' && ');

    const childRes = await socketRequest(socketPath, {
      type: 'start',
      id: reqId++,
      command: childCommand,
      name: 'child',
      parentId: shellId,
    });
    expect(childRes['ok']).toBe(true);
    const childId = childRes['sessionId'] as string;
    await waitForTerminal(page, 'child');

    // Wait for grandchild to appear
    await waitForTerminal(page, 'grandchild', 15_000);

    // nap nap child from outside — should receive "got-grandchild"
    const napResult = await runCliAsync(
      ['nap', 'child', '--timeout', '20'],
      socketPath,
    );
    expect(napResult.exitCode).toBe(0);
    expect(napResult.stdout).toContain('got-grandchild');

    // Verify parent chain in renderer store
    const chain = await page.evaluate(() => {
      const store = (window as any).useTerminalStore.getState();
      return store.terminals.map((t: any) => ({
        name: t.name,
        id: t.id,
        parentId: t.parentId ?? null,
      }));
    }) as { name: string; id: string; parentId: string | null }[];

    const shellMeta = chain.find((t) => t.name === 'shell');
    const childMeta = chain.find((t) => t.name === 'child');
    const grandchildMeta = chain.find((t) => t.name === 'grandchild');

    expect(shellMeta).toBeDefined();
    expect(childMeta).toBeDefined();
    expect(grandchildMeta).toBeDefined();

    // Shell has no parent
    expect(shellMeta!.parentId).toBeNull();
    // Child's parent is shell
    expect(childMeta!.parentId).toBe(shellId);
    // Grandchild's parent is child
    expect(grandchildMeta!.parentId).toBe(childId);

    // Verify statuses
    await waitForStatus(page, 'grandchild', 'done', 5_000);
    await waitForStatus(page, 'child', 'done', 5_000);
  });
});

// =========================================================================
// T-0500-08: integration test script is idempotent
// =========================================================================
base.describe.serial('T-0500-08: integration test is idempotent', () => {
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

  base('sequence runs twice with same names — no stale conflicts', async () => {
    for (let run = 1; run <= 2; run++) {
      // Start a worker with the same name each run
      const startRes = await runCliAsync(
        ['start', 'cat', '--name', 'idem-worker'],
        socketPath,
      );
      expect(startRes.exitCode).toBe(0);
      await waitForTerminal(page, 'idem-worker');

      // Verify it exists in ps
      const psRes = await runCliAsync(['ps', '--json'], socketPath);
      expect(psRes.exitCode).toBe(0);
      const sessions = JSON.parse(psRes.stdout) as { name: string; status: string }[];
      expect(
        sessions.some((s) => s.name === 'idem-worker' && s.status === 'running'),
      ).toBe(true);

      // Poke it
      const pokeRes = await runCliAsync(
        ['poke', 'idem-worker', `run-${run}`],
        socketPath,
      );
      expect(pokeRes.exitCode).toBe(0);

      // Close it
      const closeRes = await runCliAsync(['close', 'idem-worker'], socketPath);
      expect(closeRes.exitCode).toBe(0);

      // Wait for terminal to be removed from renderer store
      await page.waitForFunction(
        (name: string) =>
          !(window as any).useTerminalStore
            .getState()
            .terminals.some((t: any) => t.name === name),
        'idem-worker',
        { timeout: 5_000 },
      );

      // Verify it's gone from ps
      const ps2 = await runCliAsync(['ps', '--json'], socketPath);
      const sessions2 = JSON.parse(ps2.stdout) as { name: string }[];
      expect(sessions2.some((s) => s.name === 'idem-worker')).toBe(false);
    }
  });
});
