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

function seedDb(
  tmpDir: string,
  opts: {
    nepicId: string | null;
    terminalId: string | null;
    sidebarVisible: number;
    sessions?: Array<{
      id: string;
      name: string;
      role: string;
      nepicId: string;
      napkinSlug?: string;
      status: string;
      ccSessionUuid: string | null;
      cwd: string;
      parentId?: string | null;
      createdAt?: number;
    }>;
  },
): void {
  const dbDir = path.join(tmpDir, '.nap');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'nap.db');

  const schemaPath = path.join(__dirname, '..', '..', 'src', 'main', 'database.ts');
  const schemaSource = fs.readFileSync(schemaPath, 'utf8');
  const match = schemaSource.match(/export const SCHEMA = `([\s\S]*?)`;/);
  if (!match) throw new Error('Could not extract SCHEMA from database.ts');
  const schema = match[1];

  const nepicVal = opts.nepicId ? `'${opts.nepicId}'` : 'NULL';
  const termVal = opts.terminalId ? `'${opts.terminalId}'` : 'NULL';
  let sql = `${schema}\nINSERT OR REPLACE INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ${nepicVal}, ${termVal}, ${opts.sidebarVisible});`;

  if (opts.sessions) {
    const nepicIds = new Set(opts.sessions.map((s) => s.nepicId));
    for (const nid of nepicIds) {
      sql += `\nINSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('${nid}', '${nid}', '${nid}', ${Date.now()});`;
    }
    for (const s of opts.sessions) {
      const uuid = s.ccSessionUuid ? `'${s.ccSessionUuid}'` : 'NULL';
      const parentId = s.parentId ? `'${s.parentId}'` : 'NULL';
      const napkinSlug = s.napkinSlug ? `'${s.napkinSlug}'` : 'NULL';
      const createdAt = s.createdAt ?? Date.now();
      sql += `\nINSERT INTO sessions (id, name, role, nepic_id, napkin_slug, status, cc_session_uuid, cwd, parent_id, created_at) VALUES ('${s.id}', '${s.name}', '${s.role}', '${s.nepicId}', ${napkinSlug}, '${s.status}', ${uuid}, '${s.cwd}', ${parentId}, ${createdAt});`;
    }
  }

  execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '\\"')}"`);
}

async function launchIsolated(
  tmpDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; socketPath: string }> {
  const socketPath = testSocketPath();
  const app = await electron.launch({
    args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
    env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1', ...extraEnv },
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
// T-1600-01: tier detection — nap start claude vs bare
// =========================================================================
base.describe.serial('T-1600-01: tier detection — nap start claude vs bare', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1600-01-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('claude session gets ccSessionUuid, bare session does not', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
    await waitForSocket(socketPath);

    // Start a claude session (tier 2)
    const claudeRes = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: 'claude-agent',
      command: 'claude --verbose "test prompt"',
      isClaude: true,
    });
    expect(claudeRes.ok).toBe(true);
    const claudeId = claudeRes.sessionId as string;

    // Start a bare session (tier 1)
    const bareRes = await socketRequest(socketPath, {
      id: 2,
      type: 'start',
      name: 'bare-shell',
      command: 'echo hello',
      isClaude: false,
    });
    expect(bareRes.ok).toBe(true);
    const bareId = bareRes.sessionId as string;

    // Check session shapes via main process
    const result = await app.evaluate((_electron, ids: [string, string]) => {
      const claude = globalThis.__napTest!.getSession(ids[0]);
      const bare = globalThis.__napTest!.getSession(ids[1]);
      return {
        claudeHasUuid: !!claude?.ccSessionUuid,
        bareHasUuid: !!bare?.ccSessionUuid,
        claudeName: claude?.name,
        bareName: bare?.name,
      };
    }, [claudeId, bareId] as [string, string]);

    expect(result.claudeHasUuid).toBe(true);
    expect(result.bareHasUuid).toBe(false);
    expect(result.claudeName).toBe('claude-agent');
    expect(result.bareName).toBe('bare-shell');
  });
});

// =========================================================================
// T-1600-03: agent exits while running → exited + exitCode
// =========================================================================
base.describe.serial('T-1600-03: agent exit stores exitCode', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1600-03-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('pty exit stores exitCode and sets status to exited', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
    await waitForSocket(socketPath);

    // Start a session that exits with code 42
    const res = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: 'exit-42',
      command: 'exit 42',
    });
    expect(res.ok).toBe(true);
    const sessionId = res.sessionId as string;

    // Wait for pty to exit and status to update
    const session = await app.evaluate(async (_electron, sid: string) => {
      for (let i = 0; i < 50; i++) {
        const s = globalThis.__napTest!.getSession(sid);
        if (s?.status === 'exited') return s;
        await new Promise((r) => setTimeout(r, 100));
      }
      return globalThis.__napTest!.getSession(sid);
    }, sessionId);

    expect(session?.status).toBe('exited');
    expect(session?.exitCode).toBe(42);
    expect(session?.exitedAt).toBeGreaterThan(0);
  });
});

// =========================================================================
// T-1600-04: schema migration — new columns populated
// =========================================================================
base.describe.serial('T-1600-04: schema — new columns populated on create', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1600-04-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('createSession populates launches, homeDir, exitCode defaults', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));

    const result = await app.evaluate(() => {
      const { createSession, getSession, getDb } = globalThis.__napTest!;
      const db = getDb();

      db.prepare("INSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('nepic-schema', 'schema', 'nepic-schema', ?)")
        .run(Date.now());

      // Create a napkin agent (tier 3) — should auto-compute homeDir
      const session = createSession({
        cwd: '/tmp',
        name: '001-test-arch',
        role: 'test-arch',
        nepicId: 'nepic-schema',
        napkinSlug: '0100-test',
      });

      // Read back via raw SQL to verify DB columns
      const raw = db.prepare('SELECT launches, home_dir, exit_code, last_resumed_at FROM sessions WHERE id = ?')
        .get(session.id) as { launches: number; home_dir: string | null; exit_code: number | null; last_resumed_at: number | null };

      const full = getSession(session.id);

      return {
        launches: raw.launches,
        homeDir: raw.home_dir,
        exitCode: raw.exit_code,
        lastResumedAt: raw.last_resumed_at,
        sessionLaunches: full?.launches,
        sessionHomeDir: full?.homeDir,
      };
    });

    expect(result.launches).toBe(1);
    expect(result.homeDir).toBe('30-napkins/0100-test/agents/001-test-arch');
    expect(result.exitCode).toBeNull();
    expect(result.lastResumedAt).toBeNull();
    expect(result.sessionLaunches).toBe(1);
    expect(result.sessionHomeDir).toBe('30-napkins/0100-test/agents/001-test-arch');
  });
});

// =========================================================================
// T-1600-05: broadened queries — done sessions found
// =========================================================================
base.describe.serial('T-1600-05: broadened queries find done sessions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1600-05-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('getArchitectForNepic returns done architect (status != exited)', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));

    const result = await app.evaluate(() => {
      const { createSession, setSessionDone, getArchitectForNepic, getDb } = globalThis.__napTest!;
      const db = getDb();

      db.prepare("INSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('nepic-broad', 'broad', 'nepic-broad', ?)")
        .run(Date.now());

      const session = createSession({
        cwd: '/tmp',
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-broad',
      });

      // Mark as done
      setSessionDone(session.id, 'work complete');

      // Query should find it (status='done' != 'exited')
      const found = getArchitectForNepic('nepic-broad');
      return {
        foundId: found?.id ?? null,
        expectedId: session.id,
        foundStatus: found?.status ?? null,
      };
    });

    expect(result.foundId).toBe(result.expectedId);
    expect(result.foundStatus).toBe('done');
  });
});

// =========================================================================
// T-1600-06: --role and --dir flags pass through socket
// =========================================================================
base.describe.serial('T-1600-06: --role and --dir flags pass through', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1600-06-'));
  let app: ElectronApplication;
  let socketPath: string;

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('socket start with role and homeDir stores them in session', async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
    await waitForSocket(socketPath);

    const res = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: '001-test-arch',
      command: 'claude --verbose "test"',
      role: 'test-arch',
      homeDir: '20-architects/001-test-arch',
      isClaude: true,
    });
    expect(res.ok).toBe(true);
    const sessionId = res.sessionId as string;

    const session = await app.evaluate((_electron, sid: string) => {
      return globalThis.__napTest!.getSession(sid);
    }, sessionId);

    expect(session?.role).toBe('test-arch');
    expect(session?.homeDir).toBe('20-architects/001-test-arch');
    expect(session?.ccSessionUuid).toBeTruthy();
  });
});
