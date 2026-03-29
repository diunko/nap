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

/**
 * Launch an isolated Electron app with its own --cwd (and thus its own .nap/nap.db).
 * Each test gets a fresh database — no session name collisions, safe for parallelism.
 */
async function launchIsolated(
  socketPath: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-'));
  const app = await electron.launch({
    args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
    env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1', ...extraEnv },
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
// T-0200-01: SQLite store — interface parity (via app.evaluate)
// =========================================================================
base.describe.serial('T-0200-01: SQLite store — interface parity', () => {
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

  base('createSession returns Session with correct types', async () => {
    const s = await app.evaluate(() => {
      const { createSession } = globalThis.__napTest!;
      return createSession({ cwd: '/tmp', name: 'parity-test' });
    });
    expect(typeof s.id).toBe('string');
    expect(s.name).toBe('parity-test');
    expect(s.status).toBe('running');
    expect(s.cwd).toBe('/tmp');
    expect(s.parentId).toBeNull();
    expect(typeof s.createdAt).toBe('number');
    expect(s.ccSessionUuid).toBeDefined();
  });

  base('getSession returns Session for existing, undefined for missing', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp', name: 'get-test' });
      const found = getSession(s.id);
      const missing = getSession('does-not-exist');
      return { created: s, found: found ?? null, missing: missing ?? null };
    });
    expect(result.found).not.toBeNull();
    expect(result.found!.id).toBe(result.created.id);
    expect(result.found!.name).toBe(result.created.name);
    expect(result.found!.status).toBe('running');
    expect(result.found!.cwd).toBe('/tmp');
    expect(result.found!.parentId).toBeNull();
    expect(result.found!.createdAt).toBe(result.created.createdAt);
    expect(result.missing).toBeNull();
  });

  base('getAllSessions returns Session[]', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getAllSessions } = globalThis.__napTest!;
      const s1 = createSession({ cwd: '/tmp', name: 'all-a' });
      const s2 = createSession({ cwd: '/tmp', name: 'all-b' });
      const all = getAllSessions();
      return { s1Id: s1.id, s2Id: s2.id, allIds: all.map((s: any) => s.id), isArray: Array.isArray(all) };
    });
    expect(result.isArray).toBe(true);
    expect(result.allIds).toContain(result.s1Id);
    expect(result.allIds).toContain(result.s2Id);
  });

  base('removeSession + getSession returns undefined', async () => {
    const result = await app.evaluate(() => {
      const { createSession, removeSession, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      removeSession(s.id);
      return getSession(s.id) ?? null;
    });
    expect(result).toBeNull();
  });

  base('optional fields: SQL null → TS undefined; parentId stays null', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      const retrieved = getSession(s.id)!;
      return {
        command: retrieved.command ?? '__undefined__',
        doneMessage: retrieved.doneMessage ?? '__undefined__',
        parentId: retrieved.parentId,
      };
    });
    expect(result.command).toBe('__undefined__');
    expect(result.doneMessage).toBe('__undefined__');
    expect(result.parentId).toBeNull();
  });
});

// =========================================================================
// T-0200-02: Schema init is idempotent (via app.evaluate + require)
// =========================================================================
base.describe('T-0200-02: Schema init is idempotent', () => {
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

  base('double init: no errors, all 4 tables exist, rows unchanged', async () => {
    const result = await app.evaluate(() => {
      const { Database, path, fs, os, SCHEMA } = globalThis.__napTest!;

      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-02-'));
      const dbPath = path.join(testDir, '.nap', 'nap.db');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      try {
        // First init
        const db1 = new Database(dbPath);
        db1.pragma('journal_mode = WAL');
        db1.pragma('foreign_keys = ON');
        db1.exec(SCHEMA);
        db1.prepare(
          "INSERT INTO sessions (id, name, status, cwd, created_at) VALUES (?, ?, 'running', ?, ?)",
        ).run('test-id', 'pre-reinit', '/tmp', Date.now());
        db1.close();

        // Second init — same file, must not error
        const db2 = new Database(dbPath);
        db2.pragma('journal_mode = WAL');
        db2.pragma('foreign_keys = ON');
        db2.exec(SCHEMA);

        const tables = db2
          .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
          .all()
          .map((r: any) => r.name);

        const sessions = db2.prepare('SELECT * FROM sessions').all();
        db2.close();

        return {
          tables,
          sessionCount: sessions.length,
          firstName: (sessions[0] as any)?.name,
        };
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    expect(result.tables).toContain('nepics');
    expect(result.tables).toContain('napkins');
    expect(result.tables).toContain('sessions');
    expect(result.tables).toContain('ui_state');
    expect(result.sessionCount).toBe(1);
    expect(result.firstName).toBe('pre-reinit');
  });
});

// =========================================================================
// T-0200-03: CC session UUID generation and storage
// =========================================================================
base.describe.serial('T-0200-03: CC session UUID generation and storage', () => {
  let app: ElectronApplication;
  let socketPath: string;
  let tmpDir: string;

  const UUID_V4_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  base.beforeAll(async () => {
    socketPath = testSocketPath();
    ({ app, tmpDir } = await launchIsolated(socketPath));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath, tmpDir);
  });

  base('createSession generates a valid v4 UUID', async () => {
    const uuid = await app.evaluate(() => {
      const { createSession } = globalThis.__napTest!;
      return createSession({ cwd: '/tmp' }).ccSessionUuid;
    });
    expect(uuid).toMatch(UUID_V4_RE);
  });

  base('UUID round-trips through getSession', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      const retrieved = getSession(s.id);
      return { original: s.ccSessionUuid, retrieved: retrieved?.ccSessionUuid };
    });
    expect(result.retrieved).toBe(result.original);
  });

  base('UUID matches raw SQL cc_session_uuid column', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getDb } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      const db = getDb();
      const row = db
        .prepare('SELECT cc_session_uuid FROM sessions WHERE id = ?')
        .get(s.id) as { cc_session_uuid: string };
      return { storeUuid: s.ccSessionUuid, sqlUuid: row.cc_session_uuid };
    });
    expect(result.sqlUuid).toBe(result.storeUuid);
  });
});

// =========================================================================
// T-0200-05: Session status transitions persist
// =========================================================================
base.describe.serial('T-0200-05: Session status transitions persist', () => {
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

  base('create → done: status and doneMessage persist', async () => {
    const result = await app.evaluate(() => {
      const { createSession, setSessionDone, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      setSessionDone(s.id, 'task complete');
      const updated = getSession(s.id)!;
      return { status: updated.status, doneMessage: updated.doneMessage };
    });
    expect(result.status).toBe('done');
    expect(result.doneMessage).toBe('task complete');
  });

  base('create → exited: status persists, exitedAt set', async () => {
    const result = await app.evaluate(() => {
      const { createSession, setSessionStatus, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      setSessionStatus(s.id, 'exited');
      const updated = getSession(s.id)!;
      return { status: updated.status, exitedAt: updated.exitedAt };
    });
    expect(result.status).toBe('exited');
    expect(result.exitedAt).toBeGreaterThan(0);
  });

  base('done idempotency: SQL guard prevents overwrite', async () => {
    const result = await app.evaluate(() => {
      const { createSession, setSessionDone, getSession } = globalThis.__napTest!;
      const s = createSession({ cwd: '/tmp' });
      setSessionDone(s.id, 'first');
      setSessionDone(s.id, 'second');
      const updated = getSession(s.id)!;
      return { status: updated.status, doneMessage: updated.doneMessage };
    });
    expect(result.status).toBe('done');
    // SQL guard (AND status != 'done') prevents the second call from overwriting
    expect(result.doneMessage).toBe('first');
  });
});

// =========================================================================
// T-0200-06: Database file creation (via app.evaluate + require)
// =========================================================================
base.describe('T-0200-06: Database file creation', () => {
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

  base('creates file and .nap/ directory from scratch', async () => {
    const result = await app.evaluate(() => {
      const { Database, path, fs, os, SCHEMA } = globalThis.__napTest!;

      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-06-'));
      const napDir = path.join(testDir, '.nap');
      const dbPath = path.join(napDir, 'nap.db');

      const napDirExistsBefore = fs.existsSync(napDir);

      fs.mkdirSync(napDir, { recursive: true });
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.exec(SCHEMA);
      db.close();

      const dbExists = fs.existsSync(dbPath);
      fs.rmSync(testDir, { recursive: true, force: true });

      return { napDirExistsBefore, dbExists };
    });
    expect(result.napDirExistsBefore).toBe(false);
    expect(result.dbExists).toBe(true);
  });

  base('getDbPath returns <cwd>/.nap/nap.db', async () => {
    const result = await app.evaluate(() => {
      const { path } = globalThis.__napTest!;
      return path.join('/projects/myapp', '.nap', 'nap.db');
    });
    expect(result).toBe(path.join('/projects/myapp', '.nap', 'nap.db'));
  });

  base('opening existing db does not throw', async () => {
    const result = await app.evaluate(() => {
      const { Database, path, fs, os, SCHEMA } = globalThis.__napTest!;

      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-06b-'));
      const dbPath = path.join(testDir, '.nap', 'nap.db');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      try {
        const db1 = new Database(dbPath);
        db1.pragma('journal_mode = WAL');
        db1.exec(SCHEMA);
        db1.close();

        // Reopen — should not throw
        let threw = false;
        try {
          const db2 = new Database(dbPath);
          db2.pragma('journal_mode = WAL');
          db2.exec(SCHEMA);
          db2.close();
        } catch {
          threw = true;
        }
        return { threw };
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
    expect(result.threw).toBe(false);
  });
});

// =========================================================================
// T-0200-07: nap start generates UUID and spawns pty with --session-id
// =========================================================================
base.describe.serial(
  'T-0200-07: nap start generates UUID, pty gets --session-id',
  () => {
    let app: ElectronApplication;
    let page: Page;
    let socketPath: string;
    let tmpDir: string;
    let fakeBinDir: string;

    base.beforeAll(async () => {
      socketPath = testSocketPath();

      // Fake "claude" script that echoes its args — lets us verify --session-id injection
      fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-fakebin-'));
      fs.writeFileSync(
        path.join(fakeBinDir, 'claude'),
        '#!/bin/bash\necho "INJECTED: $@"',
        { mode: 0o755 },
      );

      ({ app, page, tmpDir } = await launchIsolated(socketPath, {
        PATH: `${fakeBinDir}:${process.env.PATH || ''}`,
      }));
    });

    base.afterAll(async () => {
      if (app) await closeIsolated(app, socketPath, tmpDir);
      fs.rmSync(fakeBinDir, { recursive: true, force: true });
    });

    base(
      'session has ccSessionUuid, pty receives --session-id <uuid>',
      async () => {
        const res = await socketRequest(socketPath, {
          type: 'start',
          id: 1,
          command: 'claude --verbose test',
          name: 'uuid-check-07',
        });
        expect(res['ok']).toBe(true);
        const sessionId = res['sessionId'] as string;

        // Read ccSessionUuid via sqlite3 CLI
        // (can't import better-sqlite3 in Playwright — it's compiled for Electron ABI)
        const dbPath = path.join(tmpDir, '.nap', 'nap.db');
        const uuid = execSync(
          `sqlite3 "${dbPath}" "SELECT cc_session_uuid FROM sessions WHERE id = '${sessionId}'"`,
        )
          .toString()
          .trim();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );

        // Verify --session-id <uuid> appears in pty output (fake claude echoes args)
        await page.waitForFunction(
          ([tid, text]: [string, string]) => {
            const entry = (window as any).getTerminal(tid);
            if (!entry) return false;
            const buf = entry.terminal.buffer.active;
            for (let i = 0; i < buf.length; i++) {
              if (buf.getLine(i)?.translateToString().includes(text))
                return true;
            }
            return false;
          },
          [sessionId, `--session-id ${uuid}`] as [string, string],
          { timeout: 10_000 },
        );
      },
    );
  },
);

// =========================================================================
// T-0200-08: nap ps returns SQLite-backed sessions
// =========================================================================
base.describe.serial(
  'T-0200-08: nap ps returns SQLite-backed sessions',
  () => {
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

    base(
      'start two sessions → ps lists both with names, statuses, uptimes',
      async () => {
        // Baseline count (fresh DB — only the default shell terminal)
        const initialPs = await socketRequest(socketPath, {
          type: 'ps',
          id: 1,
        });
        const initialCount = ((initialPs['sessions'] as any[]) || []).length;

        const r1 = await socketRequest(socketPath, {
          type: 'start',
          id: 2,
          command: 'sleep 60',
          name: 'ps-alpha',
        });
        expect(r1['ok']).toBe(true);

        const r2 = await socketRequest(socketPath, {
          type: 'start',
          id: 3,
          command: 'sleep 60',
          name: 'ps-beta',
        });
        expect(r2['ok']).toBe(true);

        const ps = await socketRequest(socketPath, { type: 'ps', id: 4 });
        expect(ps['ok']).toBe(true);

        const sessions = ps['sessions'] as any[];
        expect(sessions.length).toBe(initialCount + 2);

        const alpha = sessions.find((s: any) => s.name === 'ps-alpha');
        const beta = sessions.find((s: any) => s.name === 'ps-beta');
        expect(alpha).toBeDefined();
        expect(beta).toBeDefined();
        expect(alpha.status).toBe('running');
        expect(beta.status).toBe('running');
        expect(typeof alpha.uptime).toBe('string');
        expect(typeof beta.uptime).toBe('string');
      },
    );
  },
);

// =========================================================================
// T-0200-09: nap done persists to SQLite, survives pty exit
// =========================================================================
base.describe.serial('T-0200-09: nap done persists to SQLite', () => {
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

  base(
    'done persists through pty exit — status stays "done", not "exited"',
    async () => {
      const startRes = await socketRequest(socketPath, {
        type: 'start',
        id: 1,
        command: 'sleep 999',
        name: 'done-persist-09',
      });
      expect(startRes['ok']).toBe(true);
      const sessionId = startRes['sessionId'] as string;

      // Wait for terminal to appear in renderer
      await page.waitForFunction(
        (n: string) =>
          (window as any).useTerminalStore
            .getState()
            .terminals.some((t: any) => t.name === n),
        'done-persist-09',
        { timeout: 10_000 },
      );

      // Mark as done
      const doneRes = await socketRequest(socketPath, {
        type: 'done',
        id: 2,
        sessionId,
        message: 'completed successfully',
      });
      expect(doneRes['ok']).toBe(true);

      // Verify done status
      const statusAfterDone = await socketRequest(socketPath, {
        type: 'status',
        id: 3,
        name: 'done-persist-09',
      });
      expect(statusAfterDone['status']).toBe('done');
      expect(statusAfterDone['doneMessage']).toBe('completed successfully');

      // Kill the pty — triggers exit handler which should NOT overwrite 'done'
      await socketRequest(socketPath, {
        type: 'kill',
        id: 4,
        name: 'done-persist-09',
      });

      // Give exit handler time to fire
      await new Promise((r) => setTimeout(r, 1500));

      // Status must still be 'done'
      const statusAfterKill = await socketRequest(socketPath, {
        type: 'status',
        id: 5,
        name: 'done-persist-09',
      });
      expect(statusAfterKill['status']).toBe('done');
      expect(statusAfterKill['doneMessage']).toBe('completed successfully');
    },
  );
});

// =========================================================================
// T-0200-10: Database location is .nap/nap.db next to .nap/sock
// =========================================================================
base.describe(
  'T-0200-10: Database location is .nap/nap.db next to .nap/sock',
  () => {
    base('db and socket both in <cwd>/.nap/', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0200-10-'));

      // Launch WITHOUT NAP_SOCKET override — socket uses natural location at <cwd>/.nap/sock
      const env: Record<string, string> = { ...process.env } as any;
      delete env['NAP_SOCKET'];
      env['NAP_TEST'] = '1';

      const app = await electron.launch({
        args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
        env,
      });

      try {
        const page = await app.firstWindow();
        await waitForShellReady(page);

        const napDir = path.join(tmpDir, '.nap');
        const dbFilePath = path.join(napDir, 'nap.db');
        const sockFilePath = path.join(napDir, 'sock');

        // Wait for socket file to appear
        for (let i = 0; i < 50; i++) {
          if (fs.existsSync(sockFilePath)) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        // Both files in <tmpDir>/.nap/
        expect(fs.existsSync(dbFilePath)).toBe(true);
        expect(fs.existsSync(sockFilePath)).toBe(true);

        // Socket is functional → proves DB was initialized before request handling
        const alive = await isSocketAlive(sockFilePath);
        expect(alive).toBe(true);

        const res = await socketRequest(sockFilePath, { type: 'ps', id: 1 });
        expect(res['ok']).toBe(true);
      } finally {
        await app.evaluate(({ app }) => app.quit());
        await app.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  },
);
