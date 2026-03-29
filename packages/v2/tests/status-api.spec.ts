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
import { NdjsonParser, serialize } from '../src/shared/ndjson';
import { ELECTRON_LAUNCH_ARGS, waitForShellReady } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOCKET_DIR = path.join(os.tmpdir(), 'nap-test');

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
      reject(new Error('timeout'));
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

async function launchIsolated(
  socketPath: string,
): Promise<{ app: ElectronApplication; page: Page; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0300-'));
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

async function closeIsolated(
  app: ElectronApplication,
  socketPath: string,
  tmpDir: string,
): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// =========================================================================
// T2: changeNapkinStatus — SQLite update, existing napkin
// =========================================================================
base.describe.serial('T2: changeNapkinStatus — SQLite update, existing napkin', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('existing napkin row updated to new status', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, getDb, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t2';
      const napkinSlug = '0200-test';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      changeNapkinStatus(napkinSlug, 'backlog');
      changeNapkinStatus(napkinSlug, 'doing');

      const row = getDb().prepare('SELECT status FROM napkins WHERE slug = ?').get(napkinSlug) as { status: string };
      return { status: row.status };
    }, tmpDir);

    expect(result.status).toBe('doing');
  });
});

// =========================================================================
// T3: changeNapkinStatus — auto-create napkin row
// =========================================================================
base.describe.serial('T3: changeNapkinStatus — auto-create napkin row', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('napkin row created with correct slug and status when none exists', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, getDb, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t3';
      const napkinSlug = '0300-auto';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      const db = getDb();
      const before = db.prepare('SELECT id FROM napkins WHERE slug = ?').get(napkinSlug);

      changeNapkinStatus(napkinSlug, 'todo');

      const after = db.prepare('SELECT slug, status, nepic_id FROM napkins WHERE slug = ?').get(napkinSlug) as
        { slug: string; status: string; nepic_id: string } | undefined;

      return { before: before ?? null, after: after ?? null };
    }, tmpDir);

    expect(result.before).toBeNull();
    expect(result.after).not.toBeNull();
    expect(result.after!.slug).toBe('0300-auto');
    expect(result.after!.status).toBe('todo');
    expect(result.after!.nepic_id).toBeDefined();
  });
});

// =========================================================================
// T4: changeNapkinStatus — symlink created in new status dir
// =========================================================================
base.describe.serial('T4: changeNapkinStatus — symlink created in new status dir', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('symlink at 40-board/40-doing/<slug> points to ../../30-napkins/<slug>', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t4';
      const napkinSlug = '0200-sym';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      changeNapkinStatus(napkinSlug, 'doing');

      const symlinkPath = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '40-doing', napkinSlug);
      const exists = fs.existsSync(symlinkPath);
      const target = exists ? fs.readlinkSync(symlinkPath) : '';
      return { exists, target };
    }, tmpDir);

    expect(result.exists).toBe(true);
    expect(result.target).toBe('../../30-napkins/0200-sym');
  });
});

// =========================================================================
// T5: changeNapkinStatus — old symlink removed
// =========================================================================
base.describe.serial('T5: changeNapkinStatus — old symlink removed', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('old symlink gone after status change, new one exists', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t5';
      const napkinSlug = '0200-move';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      changeNapkinStatus(napkinSlug, 'backlog');
      const oldPath = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '20-backlog', napkinSlug);
      const oldExistsBefore = fs.existsSync(oldPath);

      changeNapkinStatus(napkinSlug, 'doing');
      const oldExistsAfter = fs.existsSync(oldPath);
      const newPath = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '40-doing', napkinSlug);
      const newExists = fs.existsSync(newPath);

      return { oldExistsBefore, oldExistsAfter, newExists };
    }, tmpDir);

    expect(result.oldExistsBefore).toBe(true);
    expect(result.oldExistsAfter).toBe(false);
    expect(result.newExists).toBe(true);
  });
});

// =========================================================================
// T6: First status set — no old symlink to remove
// =========================================================================
base.describe.serial('T6: First status set — no old symlink to remove', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('no error, symlink created when no prior symlink exists', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t6';
      const napkinSlug = '0600-first';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      let threw = false;
      try {
        changeNapkinStatus(napkinSlug, 'todo');
      } catch {
        threw = true;
      }

      const symlinkPath = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '30-todo', napkinSlug);
      return { threw, exists: fs.existsSync(symlinkPath) };
    }, tmpDir);

    expect(result.threw).toBe(false);
    expect(result.exists).toBe(true);
  });
});

// =========================================================================
// T7: Target board dir missing — auto-create
// =========================================================================
base.describe.serial('T7: Target board dir missing — auto-create', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('creates board dir and symlink when target dir does not exist', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t7';
      const napkinSlug = '0700-autodir';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      const boardDir = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '50-review');
      const dirExistsBefore = fs.existsSync(boardDir);

      changeNapkinStatus(napkinSlug, 'review');

      return {
        dirExistsBefore,
        dirExistsAfter: fs.existsSync(boardDir),
        symlinkExists: fs.existsSync(path.join(boardDir, napkinSlug)),
      };
    }, tmpDir);

    expect(result.dirExistsBefore).toBe(false);
    expect(result.dirExistsAfter).toBe(true);
    expect(result.symlinkExists).toBe(true);
  });
});

// =========================================================================
// T8: Invalid status rejected
// =========================================================================
base.describe.serial('T8: Invalid status rejected', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('throws on invalid status "shipped"', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t8';
      const napkinSlug = '0200-invalid';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      try {
        changeNapkinStatus(napkinSlug, 'shipped');
        return { threw: false, message: '' };
      } catch (err: any) {
        return { threw: true, message: err.message };
      }
    }, tmpDir);

    expect(result.threw).toBe(true);
    expect(result.message).toContain('Invalid status');
  });
});

// =========================================================================
// T9: Socket round-trip — napkin-status command
// =========================================================================
base.describe.serial('T9: Socket round-trip — napkin-status command', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('napkin-status request returns ok, updates SQLite and symlink', async () => {
    // Create napkin fixture
    await app.evaluate((_electron, dir) => {
      const { fs, path } = globalThis.__napTest!;
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', 'test-nepic-t9', '30-napkins', '0200-socket'), { recursive: true });
    }, tmpDir);

    const res = await socketRequest(socketPath, {
      type: 'napkin-status',
      id: 1,
      napkinSlug: '0200-socket',
      status: 'doing',
    });
    expect(res['ok']).toBe(true);

    // Verify SQLite
    const dbResult = await app.evaluate(() => {
      const row = globalThis.__napTest!.getDb()
        .prepare('SELECT status FROM napkins WHERE slug = ?')
        .get('0200-socket') as { status: string } | undefined;
      return row ?? null;
    });
    expect(dbResult).not.toBeNull();
    expect(dbResult!.status).toBe('doing');

    // Verify symlink
    const symExists = await app.evaluate((_electron, dir) => {
      const { fs, path } = globalThis.__napTest!;
      return fs.existsSync(path.join(dir, '.nap', 'nepics', 'test-nepic-t9', '40-board', '40-doing', '0200-socket'));
    }, tmpDir);
    expect(symExists).toBe(true);
  });
});

// =========================================================================
// T10: Socket — napkin slug not found, no dir on disk
// =========================================================================
base.describe.serial('T10: Socket — napkin slug not found', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('returns error for non-existent napkin slug, no SQLite row created', async () => {
    const res = await socketRequest(socketPath, {
      type: 'napkin-status',
      id: 1,
      napkinSlug: '9999-bogus',
      status: 'doing',
    });
    expect(res['error']).toBe('not_found');

    const row = await app.evaluate(() => {
      return globalThis.__napTest!.getDb()
        .prepare('SELECT id FROM napkins WHERE slug = ?')
        .get('9999-bogus') ?? null;
    });
    expect(row).toBeNull();
  });
});

// =========================================================================
// T11: IPC notification fires after status change
// =========================================================================
base.describe.serial('T11: IPC notification fires after status change', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('renderer receives napkin:status-changed IPC with correct payload', async () => {
    // Set up IPC listener in renderer before triggering change
    await page.evaluate(() => {
      (window as any).__napkinStatusEvents = [];
      (window as any).electronAPI.onNapkinStatusChanged((data: { slug: string; status: string }) => {
        (window as any).__napkinStatusEvents.push(data);
      });
    });

    // Create napkin fixture
    await app.evaluate((_electron, dir) => {
      const { fs, path } = globalThis.__napTest!;
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', 'test-nepic-t11', '30-napkins', '0200-ipc'), { recursive: true });
    }, tmpDir);

    // Trigger status change via socket
    const res = await socketRequest(socketPath, {
      type: 'napkin-status',
      id: 1,
      napkinSlug: '0200-ipc',
      status: 'review',
    });
    expect(res['ok']).toBe(true);

    // Wait for IPC event to arrive in renderer
    const events = await page.waitForFunction(() => {
      const evts = (window as any).__napkinStatusEvents;
      return evts.length > 0 ? evts : null;
    }, undefined, { timeout: 5000 });

    const data = await events.jsonValue();
    expect(data).toHaveLength(1);
    expect(data[0].slug).toBe('0200-ipc');
    expect(data[0].status).toBe('review');
  });
});

// =========================================================================
// T12: Existing session `status` command still works
// =========================================================================
base.describe.serial('T12: Existing session status command still works', () => {
  let app: ElectronApplication;
  let page: Page;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, page, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('session status request returns running for active session', async () => {
    const startRes = await socketRequest(socketPath, {
      type: 'start',
      id: 1,
      command: 'sleep 60',
      name: 'regression-t12',
    });
    expect(startRes['ok']).toBe(true);

    const statusRes = await socketRequest(socketPath, {
      type: 'status',
      id: 2,
      name: 'regression-t12',
    });
    expect(statusRes['ok']).toBe(true);
    expect(statusRes['status']).toBe('running');
  });
});

// =========================================================================
// T15: SQLite authoritative — symlink failure doesn't rollback
// =========================================================================
base.describe.serial('T15: SQLite authoritative — symlink failure does not rollback', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('SQLite updated even when symlink operation fails', async () => {
    const result = await app.evaluate((_electron, dir) => {
      const { changeNapkinStatus, getDb, fs, path } = globalThis.__napTest!;
      const nepicSlug = 'test-nepic-t15';
      const napkinSlug = '0200-auth';
      fs.mkdirSync(path.join(dir, '.nap', 'nepics', nepicSlug, '30-napkins', napkinSlug), { recursive: true });

      // Create board dir and make it read-only to force symlink failure
      const targetDir = path.join(dir, '.nap', 'nepics', nepicSlug, '40-board', '40-doing');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.chmodSync(targetDir, 0o444);

      let threw = false;
      try {
        changeNapkinStatus(napkinSlug, 'doing');
      } catch {
        threw = true;
      }

      // Restore permissions for cleanup
      fs.chmodSync(targetDir, 0o755);

      const row = getDb().prepare('SELECT status FROM napkins WHERE slug = ?').get(napkinSlug) as
        { status: string } | undefined;
      return { threw, status: row?.status ?? null };
    }, tmpDir);

    expect(result.threw).toBe(false);
    expect(result.status).toBe('doing');
  });
});
