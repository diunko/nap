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

/** Query SQLite db via CLI (better-sqlite3 is compiled for Electron ABI) */
function sqliteQuery(dbPath: string, sql: string): string {
  return execSync(`sqlite3 "${dbPath}" "${sql}"`).toString().trim();
}

/** Seed a db with schema, ui_state, and optional session rows */
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

/** Send a request over the nap socket */
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
// T-1500-01: clean quit does NOT mark sessions 'exited'
// =========================================================================
base.describe.serial('T-1500-01: clean quit does NOT mark sessions exited', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1500-01-'));
  const dbPath = path.join(tmpDir, '.nap', 'nap.db');

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('sessions preserve their status after app.quit()', async () => {
    // Phase 1: launch app, create sessions via socket, then quit
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for socket to be ready
    for (let i = 0; i < 50; i++) {
      try {
        await socketRequest(socketPath, { id: 0, type: 'ps' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Start a session that runs a long-lived command (stays 'running')
    const startRes = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: 'long-runner',
      command: 'sleep 600',
    });
    expect(startRes.ok).toBe(true);
    const longRunnerId = startRes.sessionId as string;

    // Start a session that will complete with nap done
    const startRes2 = await socketRequest(socketPath, {
      id: 2,
      type: 'start',
      name: 'done-agent',
      command: 'sleep 600',
    });
    expect(startRes2.ok).toBe(true);
    const doneAgentId = startRes2.sessionId as string;

    // Mark the second session as done
    await socketRequest(socketPath, {
      id: 3,
      type: 'done',
      sessionId: doneAgentId,
      message: 'finished',
    });

    // Verify pre-quit statuses via main process
    const preQuitStatuses = await app.evaluate(
      (_electron, [rId, dId]: [string, string]) => {
        const { getSession } = globalThis.__napTest!;
        return {
          running: getSession(rId)?.status,
          done: getSession(dId)?.status,
        };
      },
      [longRunnerId, doneAgentId] as [string, string],
    );
    expect(preQuitStatuses.running).toBe('running');
    expect(preQuitStatuses.done).toBe('done');

    // Teardown ptys (dispose handlers to prevent races) then quit
    await app.evaluate(({ app: electronApp }) => {
      globalThis.__napTest!.teardownPtys();
      electronApp.quit();
    });
    await app.close();
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }

    // Phase 2: read DB with sqlite3 CLI — statuses should be preserved
    const rows = sqliteQuery(dbPath, 'SELECT id, status FROM sessions ORDER BY name');
    const parsed = rows.split('\n').map((line) => {
      const [id, status] = line.split('|');
      return { id, status };
    });

    const longRunnerRow = parsed.find((r) => r.id === longRunnerId);
    const doneAgentRow = parsed.find((r) => r.id === doneAgentId);

    expect(longRunnerRow?.status).toBe('running');
    expect(doneAgentRow?.status).toBe('done');
  });
});

// =========================================================================
// T-1500-02: agent exits while app running → marked 'exited'
// =========================================================================
base.describe.serial('T-1500-02: agent exits while app running → marked exited', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1500-02-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('session status becomes exited when agent process exits on its own', async () => {
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for socket
    for (let i = 0; i < 50; i++) {
      try {
        await socketRequest(socketPath, { id: 0, type: 'ps' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Start a session with a command that exits immediately
    const startRes = await socketRequest(socketPath, {
      id: 1,
      type: 'start',
      name: 'quick-exit',
      command: 'exit 0',
    });
    expect(startRes.ok).toBe(true);
    const sessionId = startRes.sessionId as string;

    // Wait for the session to become 'exited' in the main process
    await page.waitForFunction(
      (sid: string) => {
        const terminals = (window as any).useTerminalStore.getState().terminals;
        const t = terminals.find((t: any) => t.id === sid);
        return t?.status === 'exited';
      },
      sessionId,
      { timeout: 10_000 },
    );

    // Verify via app.evaluate too
    const status = await app.evaluate((_electron, sid: string) => {
      return globalThis.__napTest!.getSession(sid)?.status;
    }, sessionId);
    expect(status).toBe('exited');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-1500-03: resume on launch finds 'running' and 'done', skips 'exited'
// =========================================================================
base.describe.serial('T-1500-03: resume finds running and done, skips exited', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1500-03-'));
  const runningId = 'ses-running-1500-03';
  const doneId = 'ses-done-1500-03';
  const exitedId = 'ses-exited-1500-03';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('running and done sessions with ccSessionUuid are auto-resumed, exited excluded', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-1500-03',
      terminalId: null,
      sidebarVisible: 1,
      sessions: [
        {
          id: runningId,
          name: '001-test-eng',
          role: 'test-eng',
          nepicId: 'nepic-1500-03',
          napkinSlug: '0200-test',
          status: 'running',
          ccSessionUuid: 'uuid-running-03',
          cwd: tmpDir,
        },
        {
          id: doneId,
          name: '002-fs-eng',
          role: 'fs-eng',
          nepicId: 'nepic-1500-03',
          napkinSlug: '0200-test',
          status: 'done',
          ccSessionUuid: 'uuid-done-03',
          cwd: tmpDir,
        },
        {
          id: exitedId,
          name: '003-fs-eng',
          role: 'fs-eng',
          nepicId: 'nepic-1500-03',
          napkinSlug: '0200-test',
          status: 'exited',
          ccSessionUuid: 'uuid-exited-03',
          cwd: tmpDir,
        },
      ],
    });

    const { app, page, socketPath } = await launchIsolated(tmpDir);

    // Running and done sessions with ccSessionUuid are auto-resumed (live ptys)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(runningId);
    expect(livePtys).toContain(doneId);
    expect(livePtys).not.toContain(exitedId);

    // They appear in resumedSessions, not orphanedSessions
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });

    const resumedIds = resumeData.resumedSessions.map((s: any) => s.id);
    expect(resumedIds).toContain(runningId);
    expect(resumedIds).toContain(doneId);
    expect(resumedIds).not.toContain(exitedId);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-1500-04: 'done' architect resumes on next launch
// =========================================================================
base.describe.serial('T-1500-04: done architect resumes on next launch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1500-04-'));
  const architectId = 'arch-done-1500-04';
  const ccUuid = 'cc-uuid-done-1500-04';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('architect with status=done is found and resumed (live pty)', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-1500-04',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-1500-04',
        status: 'done',
        ccSessionUuid: ccUuid,
        cwd: tmpDir,
      }],
    });

    const { app, page, socketPath } = await launchIsolated(tmpDir);

    // The architect pty should have been spawned
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);

    // Resume data should report this architect
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });
    expect(resumeData.architectSession).not.toBeNull();
    expect(resumeData.architectSession!.id).toBe(architectId);
    expect(resumeData.architectSession!.ccSessionUuid).toBe(ccUuid);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-1500-05: quit → relaunch round-trip — sessions survive
// =========================================================================
base.describe.serial('T-1500-05: quit → relaunch round-trip — sessions survive', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1500-05-'));
  const dbPath = path.join(tmpDir, '.nap', 'nap.db');

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('session created in first launch survives quit, is auto-resumed in second launch', async () => {
    // Phase 1: launch, create session via socket, verify running, quit
    const socketPath1 = testSocketPath();
    const app1 = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath1, NAP_TEST: '1' },
    });
    const page1 = await app1.firstWindow();
    await waitForShellReady(page1);

    // Wait for socket
    for (let i = 0; i < 50; i++) {
      try {
        await socketRequest(socketPath1, { id: 0, type: 'ps' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Start a long-running session
    const startRes = await socketRequest(socketPath1, {
      id: 1,
      type: 'start',
      name: 'survivor',
      command: 'sleep 600',
    });
    expect(startRes.ok).toBe(true);
    const sessionId = startRes.sessionId as string;

    // Verify running
    const statusBefore = await app1.evaluate((_electron, sid: string) => {
      return globalThis.__napTest!.getSession(sid)?.status;
    }, sessionId);
    expect(statusBefore).toBe('running');

    // Teardown ptys cleanly then quit
    await app1.evaluate(({ app: electronApp }) => {
      globalThis.__napTest!.teardownPtys();
      electronApp.quit();
    });
    await app1.close();
    try { fs.unlinkSync(socketPath1); } catch { /* ok */ }

    // Verify DB status is still 'running' after quit
    const dbStatus = sqliteQuery(dbPath, `SELECT status FROM sessions WHERE id = '${sessionId}'`);
    expect(dbStatus).toBe('running');

    // Phase 2: relaunch with same tmpDir, session has ccSessionUuid → auto-resumed
    const { app: app2, page: page2, socketPath: socketPath2 } = await launchIsolated(tmpDir);

    // Session should be auto-resumed (has ccSessionUuid from createSession default)
    const livePtys = await app2.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(sessionId);

    const resumeData = await page2.evaluate(() => {
      return window.electronAPI.getResumeData();
    });

    const resumedIds = resumeData.resumedSessions.map((s: any) => s.id);
    expect(resumedIds).toContain(sessionId);

    await closeIsolated(app2, socketPath2);
  });
});
