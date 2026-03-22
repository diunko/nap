import {
  test as base,
  expect,
  _electron as electron,
} from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
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
    // Insert nepic rows for FK satisfaction
    const nepicIds = new Set(opts.sessions.map((s) => s.nepicId));
    for (const nid of nepicIds) {
      sql += `\nINSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('${nid}', '${nid}', '${nid}', ${Date.now()});`;
    }
    for (const s of opts.sessions) {
      const uuid = s.ccSessionUuid ? `'${s.ccSessionUuid}'` : 'NULL';
      const parentId = s.parentId ? `'${s.parentId}'` : 'NULL';
      const napkinSlug = s.napkinSlug ? `'${s.napkinSlug}'` : 'NULL';
      sql += `\nINSERT INTO sessions (id, name, role, nepic_id, napkin_slug, status, cc_session_uuid, cwd, parent_id, created_at) VALUES ('${s.id}', '${s.name}', '${s.role}', '${s.nepicId}', ${napkinSlug}, '${s.status}', ${uuid}, '${s.cwd}', ${parentId}, ${Date.now()});`;
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
// T-0800-01: find architect session for active nepic
// =========================================================================
base.describe.serial('T-0800-01: find architect session for active nepic', () => {
  let app: ElectronApplication;
  let socketPath: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-01-'));

  base.beforeAll(async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('query returns architect matching active nepic, includes ccSessionUuid', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getArchitectForNepic, getDb } = globalThis.__napTest!;
      const db = getDb();

      // Create nepic rows (FK constraint requires them)
      db.prepare("INSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('nepic-A', 'A', 'nepic-a', ?)")
        .run(Date.now());
      db.prepare("INSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('nepic-B', 'B', 'nepic-b', ?)")
        .run(Date.now());

      // Create architect for nepic-A
      const sessionA = createSession({
        cwd: '/tmp',
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-A',
      });

      // Create architect for nepic-B
      createSession({
        cwd: '/tmp',
        name: '002-architect',
        role: 'architect',
        nepicId: 'nepic-B',
      });

      // Query for nepic-A's architect
      const found = getArchitectForNepic('nepic-A');
      return {
        foundId: found?.id ?? null,
        expectedId: sessionA.id,
        foundNepicId: found?.nepicId ?? null,
        hasCcSessionUuid: !!found?.ccSessionUuid,
      };
    });

    expect(result.foundId).toBe(result.expectedId);
    expect(result.foundNepicId).toBe('nepic-A');
    expect(result.hasCcSessionUuid).toBe(true);
  });

  base('query does not return non-architect sessions', async () => {
    const result = await app.evaluate(() => {
      const { createSession, getArchitectForNepic, getDb } = globalThis.__napTest!;
      const db = getDb();

      db.prepare("INSERT OR IGNORE INTO nepics (id, name, slug, created_at) VALUES ('nepic-C', 'C', 'nepic-c', ?)")
        .run(Date.now());

      // Create a non-architect session for nepic-C
      createSession({
        cwd: '/tmp',
        name: '001-fs-eng',
        role: 'fs-eng',
        nepicId: 'nepic-C',
      });

      return getArchitectForNepic('nepic-C');
    });

    expect(result).toBeUndefined();
  });
});

// =========================================================================
// T-0800-02: resume spawn uses `claude --resume <uuid>`
// =========================================================================
base.describe.serial('T-0800-02: resume spawn uses claude --resume <uuid>', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-02-'));
  const architectId = 'arch-0800-02';
  const ccUuid = 'cc-uuid-0800-02';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('startup spawns pty with --resume flag when cc_session_uuid exists', async () => {
    // Seed db with architect session that has a cc_session_uuid
    seedDb(tmpDir, {
      nepicId: 'nepic-resume',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-resume',
        status: 'running',
        ccSessionUuid: ccUuid,
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // The architect pty should have been spawned — check it's in live ptys
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);

    // The resume data should report this architect
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });
    expect(resumeData.architectSession).not.toBeNull();
    expect(resumeData.architectSession!.id).toBe('arch-0800-02');
    expect(resumeData.architectSession!.ccSessionUuid).toBe('cc-uuid-0800-02');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-03: no cc_session_uuid → fresh claude session
// =========================================================================
base.describe.serial('T-0800-03: no cc_session_uuid → fresh claude session', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-03-'));
  const architectId = 'arch-0800-03';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('startup spawns fresh claude when cc_session_uuid is null', async () => {
    // Seed db with architect session that has NULL cc_session_uuid
    seedDb(tmpDir, {
      nepicId: 'nepic-fresh',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-fresh',
        status: 'running',
        ccSessionUuid: null,
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Architect pty should be live (fresh spawn)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);

    // Resume data should report architect with no ccSessionUuid
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });
    expect(resumeData.architectSession).not.toBeNull();
    expect(resumeData.architectSession!.id).toBe('arch-0800-03');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-04: expired CC session falls back to fresh
// =========================================================================
base.describe.serial('T-0800-04: expired CC session falls back to fresh', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-04-'));
  const architectId = 'arch-0800-04';
  // Use a bogus uuid — `claude --resume <bogus>` will exit quickly
  const bogusUuid = 'bogus-uuid-does-not-exist-0800-04';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('pty exits quickly → fallback spawns fresh claude', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-expired',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-expired',
        status: 'running',
        ccSessionUuid: bogusUuid,
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for fallback — the initial pty exits quickly, then a fresh one spawns.
    // After fallback, architect id should still be in live ptys.
    await page.waitForFunction(
      (archId: string) => {
        // Check if the architect terminal exists in the renderer store
        const terminals = (window as any).useTerminalStore.getState().terminals;
        return terminals.some((t: any) => t.id === archId);
      },
      architectId,
      { timeout: 15_000 },
    );

    // Architect pty should still be live (fallback respawned it)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-05: orphaned session detection — status=running, no live pty
// =========================================================================
base.describe.serial('T-0800-05: orphaned session detection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-05-'));
  const orphanId = 'orphan-0800-05';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('session with status=running and no live pty appears as orphaned in renderer', async () => {
    // Seed with a non-architect running session (won't be auto-resumed)
    seedDb(tmpDir, {
      nepicId: 'nepic-orphan',
      terminalId: null,
      sidebarVisible: 1,
      sessions: [{
        id: orphanId,
        name: '001-test-eng',
        role: 'test-eng',
        nepicId: 'nepic-orphan',
        napkinSlug: '0200-test',
        status: 'running',
        ccSessionUuid: 'uuid-orphan-test',
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for orphaned terminal to appear in store
    const orphanedTerminal = await page.waitForFunction(
      (oid: string) => {
        const terminals = (window as any).useTerminalStore.getState().terminals;
        const t = terminals.find((t: any) => t.id === oid);
        return t ? { id: t.id, isOrphaned: t.isOrphaned, ccSessionUuid: t.ccSessionUuid } : null;
      },
      orphanId,
      { timeout: 10_000 },
    );

    const data = await orphanedTerminal.jsonValue();
    expect(data).not.toBeNull();
    expect(data!.isOrphaned).toBe(true);
    expect(data!.ccSessionUuid).toBe('uuid-orphan-test');

    // Verify it's NOT in live ptys (no pty was spawned for it)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).not.toContain(orphanId);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-07: multiple architects — resume the active one
// =========================================================================
base.describe.serial('T-0800-07: multiple architects — resume the active one', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-07-'));
  const doneArchId = 'arch-done-07';
  const runningArchId = 'arch-running-07';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('only the running architect is resumed, done architect is not', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-multi',
      terminalId: runningArchId,
      sidebarVisible: 1,
      sessions: [
        {
          id: doneArchId,
          name: '001-architect',
          role: 'architect',
          nepicId: 'nepic-multi',
          status: 'done',
          ccSessionUuid: 'uuid-done-arch',
          cwd: tmpDir,
        },
        {
          id: runningArchId,
          name: '002-architect',
          role: 'architect',
          nepicId: 'nepic-multi',
          status: 'running',
          ccSessionUuid: 'uuid-running-arch',
          cwd: tmpDir,
        },
      ],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Only the running architect should have a live pty
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(runningArchId);
    expect(livePtys).not.toContain(doneArchId);

    // Resume data should reference running architect
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });
    expect(resumeData.architectSession).not.toBeNull();
    expect(resumeData.architectSession!.id).toBe('arch-running-07');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-08: resumed architect terminal becomes active
// =========================================================================
base.describe.serial('T-0800-08: resumed architect becomes active terminal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-08-'));
  const architectId = 'arch-0800-08';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('activeTerminalId points to resumed architect after launch', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-active',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-active',
        status: 'running',
        ccSessionUuid: 'uuid-active-arch',
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for active terminal to be set to the architect
    const activeId = await page.waitForFunction(
      (archId: string) => {
        const store = (window as any).useTerminalStore.getState();
        return store.activeTerminalId === archId ? archId : null;
      },
      architectId,
      { timeout: 10_000 },
    );

    const id = await activeId.jsonValue();
    expect(id).toBe(architectId);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-09: orphaned agent click to resume
// =========================================================================
base.describe.serial('T-0800-09: orphaned agent click to resume', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-09-'));
  const orphanId = 'orphan-0800-09';
  const orphanUuid = 'uuid-orphan-resume-09';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('resumeOrphanedTerminal sends pty:resume IPC and clears orphaned flag', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-click',
      terminalId: null,
      sidebarVisible: 1,
      sessions: [{
        id: orphanId,
        name: '001-test-eng',
        role: 'test-eng',
        nepicId: 'nepic-click',
        napkinSlug: '0200-click',
        status: 'running',
        ccSessionUuid: orphanUuid,
        cwd: tmpDir,
      }],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Wait for orphaned terminal to appear
    await page.waitForFunction(
      (oid: string) => {
        const terminals = (window as any).useTerminalStore.getState().terminals;
        return terminals.some((t: any) => t.id === oid && t.isOrphaned);
      },
      orphanId,
      { timeout: 10_000 },
    );

    // Trigger resume via store action
    await page.evaluate((oid: string) => {
      const store = (window as any).useTerminalStore.getState();
      store.resumeOrphanedTerminal(oid);
      store.setActive(oid);
    }, orphanId);

    // After resume, isOrphaned should be false
    const afterResume = await page.evaluate((oid: string) => {
      const t = (window as any).useTerminalStore.getState().terminals.find((t: any) => t.id === oid);
      return { isOrphaned: t?.isOrphaned, activeTerminalId: (window as any).useTerminalStore.getState().activeTerminalId };
    }, orphanId);

    expect(afterResume.isOrphaned).toBe(false);
    expect(afterResume.activeTerminalId).toBe(orphanId);

    // The pty should now be live (main received pty:resume)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(orphanId);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-10: non-architect agents are NOT auto-resumed
// =========================================================================
base.describe.serial('T-0800-10: non-architect agents are NOT auto-resumed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-10-'));
  const architectId = 'arch-0800-10';
  const fsEngId = 'fseng-0800-10';
  const testEngId = 'testeng-0800-10';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('only architect auto-resumed; fs-eng and test-eng become orphaned', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-scope',
      terminalId: architectId,
      sidebarVisible: 1,
      sessions: [
        {
          id: architectId,
          name: '001-architect',
          role: 'architect',
          nepicId: 'nepic-scope',
          status: 'running',
          ccSessionUuid: 'uuid-arch-scope',
          cwd: tmpDir,
        },
        {
          id: fsEngId,
          name: '002-fs-eng',
          role: 'fs-eng',
          nepicId: 'nepic-scope',
          napkinSlug: '0200-scope',
          status: 'running',
          ccSessionUuid: 'uuid-fseng-scope',
          cwd: tmpDir,
        },
        {
          id: testEngId,
          name: '003-test-eng',
          role: 'test-eng',
          nepicId: 'nepic-scope',
          napkinSlug: '0200-scope',
          status: 'running',
          ccSessionUuid: 'uuid-testeng-scope',
          cwd: tmpDir,
        },
      ],
    });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Only architect should have a live pty
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);
    expect(livePtys).not.toContain(fsEngId);
    expect(livePtys).not.toContain(testEngId);

    // Wait for orphaned sessions to appear in renderer store
    await page.waitForFunction(
      ([fId, tId]: [string, string]) => {
        const terminals = (window as any).useTerminalStore.getState().terminals;
        const fs = terminals.find((t: any) => t.id === fId);
        const te = terminals.find((t: any) => t.id === tId);
        return fs?.isOrphaned && te?.isOrphaned;
      },
      [fsEngId, testEngId] as [string, string],
      { timeout: 10_000 },
    );

    const orphanData = await page.evaluate(([fId, tId]: [string, string]) => {
      const terminals = (window as any).useTerminalStore.getState().terminals;
      const fs = terminals.find((t: any) => t.id === fId);
      const te = terminals.find((t: any) => t.id === tId);
      return {
        fsEngOrphaned: fs?.isOrphaned,
        testEngOrphaned: te?.isOrphaned,
      };
    }, [fsEngId, testEngId] as [string, string]);

    expect(orphanData.fsEngOrphaned).toBe(true);
    expect(orphanData.testEngOrphaned).toBe(true);

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-0800-11: resume with no prior sessions — fresh launch
// =========================================================================
base.describe.serial('T-0800-11: no prior sessions — fresh launch', () => {
  let app: ElectronApplication;
  let socketPath: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-11-'));

  base.beforeAll(async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('app launches normally, default shell terminal exists, no --resume in ptys', async () => {
    const page = await app.firstWindow();

    const terminalCount = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.length,
    );
    expect(terminalCount).toBeGreaterThan(0);

    // First terminal should be the default shell
    const firstName = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals[0]?.name,
    );
    expect(firstName).toBe('shell');

    // Resume data should have no architect
    const resumeData = await page.evaluate(() => {
      return window.electronAPI.getResumeData();
    });
    expect(resumeData.architectSession).toBeNull();
    expect(resumeData.orphanedSessions).toHaveLength(0);
  });
});

// =========================================================================
// T-0800-12: architect resume + UI state restore integration
// =========================================================================
base.describe.serial('T-0800-12: full quit/relaunch — architect + UI state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0800-12-'));
  const architectId = 'arch-0800-12';

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('architect resumed, sidebar hidden, activeTerminalId restored after relaunch', async () => {
    // Seed db to simulate state after a previous session: architect running,
    // sidebar hidden, architect was the active terminal
    seedDb(tmpDir, {
      nepicId: 'nepic-12',
      terminalId: architectId,
      sidebarVisible: 0,
      sessions: [{
        id: architectId,
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-12',
        status: 'running',
        ccSessionUuid: 'uuid-arch-12',
        cwd: tmpDir,
      }],
    });

    // Launch with the pre-seeded db (simulates relaunch after quit)
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Sidebar should be hidden (restored from ui_state)
    const sidebarVisible = await page.evaluate(
      () => (window as any).useTerminalStore.getState().sidebarVisible,
    );
    expect(sidebarVisible).toBe(false);

    // Architect should have been auto-resumed (live pty)
    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).toContain(architectId);

    // Active terminal should point to architect
    const activeId = await page.waitForFunction(
      (archId: string) => {
        const store = (window as any).useTerminalStore.getState();
        return store.activeTerminalId === archId ? archId : null;
      },
      architectId,
      { timeout: 10_000 },
    );
    expect(await activeId.jsonValue()).toBe(architectId);

    await closeIsolated(app, socketPath);
  });
});
