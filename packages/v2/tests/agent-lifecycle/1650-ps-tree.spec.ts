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
import { ELECTRON_LAUNCH_ARGS, testSocketPath, waitForShellReady } from '../helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function waitForSocket(socketPath: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      await socketRequest(socketPath, { id: 0, type: 'ps' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Socket not ready after 5s');
}

async function launchIsolated(
  tmpDir: string,
): Promise<{ app: ElectronApplication; page: Page; socketPath: string }> {
  const socketPath = testSocketPath();
  const app = await electron.launch({
    args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
    env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
  });
  const page = await app.firstWindow();
  await waitForShellReady(page);
  return { app, page, socketPath };
}

async function closeIsolated(
  app: ElectronApplication,
  socketPath: string,
): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  try { fs.unlinkSync(socketPath); } catch { /* ok */ }
}

// =========================================================================
// T-1650-01: nap ps returns tree with metadata
// =========================================================================
base.describe.serial('T-1650-01: nap ps tree output includes metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1650-01-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('ps response includes pid, role, napkinSlug, ccSessionUuid, resumable, parentId', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
    await waitForSocket(socketPath);

    // Create an architect (parent)
    const archRes = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: '001-architect',
      command: 'claude --verbose "architect"',
      role: 'architect',
      isClaude: true,
    });
    expect(archRes.ok).toBe(true);
    const archId = archRes.sessionId as string;

    // Create a child agent
    const childRes = await socketRequest(socketPath, {
      id: 2,
      type: 'start',
      name: '001-fs-eng',
      command: 'claude --verbose "implement"',
      role: 'fs-eng',
      napkinSlug: '0100-test',
      parentId: archId,
      isClaude: true,
    });
    expect(childRes.ok).toBe(true);

    // Create a bare terminal
    const bareRes = await socketRequest(socketPath, {
      id: 3,
      type: 'start',
      name: 'bare-shell',
      command: 'echo hello',
      isClaude: false,
    });
    expect(bareRes.ok).toBe(true);

    // Query nap ps
    const psRes = await socketRequest(socketPath, { id: 4, type: 'ps' });
    expect(psRes.ok).toBe(true);

    const sessions = psRes.sessions as Array<{
      name: string;
      pid: number | null;
      role: string | null;
      napkinSlug: string | null;
      ccSessionUuid: string | null;
      resumable: boolean;
      parentId: string | null;
      status: string;
    }>;

    // Find our sessions (there's also the default shell)
    const arch = sessions.find((s) => s.name === '001-architect');
    const child = sessions.find((s) => s.name === '001-fs-eng');
    const bare = sessions.find((s) => s.name === 'bare-shell');

    expect(arch).toBeTruthy();
    expect(arch!.role).toBe('architect');
    expect(arch!.pid).toBeGreaterThan(0);
    expect(arch!.ccSessionUuid).toBeTruthy();
    expect(arch!.resumable).toBe(true);

    expect(child).toBeTruthy();
    expect(child!.role).toBe('fs-eng');
    expect(child!.napkinSlug).toBe('0100-test');
    expect(child!.parentId).toBe(archId);
    expect(child!.resumable).toBe(true);

    expect(bare).toBeTruthy();
    expect(bare!.ccSessionUuid).toBeNull();
    expect(bare!.resumable).toBe(false);
  });
});
