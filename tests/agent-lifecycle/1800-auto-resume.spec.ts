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

function sqliteQuery(dbPath: string, sql: string): string {
  return execSync(`sqlite3 "${dbPath}" "${sql}"`).toString().trim();
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

async function closeIsolated(
  app: ElectronApplication,
  socketPath: string,
): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  try { fs.unlinkSync(socketPath); } catch { /* ok */ }
}

// =========================================================================
// T-1800-01: all claude sessions resume on launch, bare terminals do not
// =========================================================================
base.describe.serial('T-1800-01: all claude sessions resume, bare excluded', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1800-01-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('3 claude sessions get ptys, 1 bare terminal does not', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-1800',
      terminalId: 'claude-arch',
      sidebarVisible: 1,
      sessions: [
        {
          id: 'claude-arch',
          name: '001-architect',
          role: 'architect',
          nepicId: 'nepic-1800',
          status: 'running',
          ccSessionUuid: 'uuid-arch-1800',
          cwd: tmpDir,
        },
        {
          id: 'claude-fs',
          name: '002-fs-eng',
          role: 'fs-eng',
          nepicId: 'nepic-1800',
          napkinSlug: '0100-test',
          status: 'running',
          ccSessionUuid: 'uuid-fs-1800',
          cwd: tmpDir,
        },
        {
          id: 'claude-te',
          name: '003-test-eng',
          role: 'test-eng',
          nepicId: 'nepic-1800',
          napkinSlug: '0100-test',
          status: 'done',
          ccSessionUuid: 'uuid-te-1800',
          cwd: tmpDir,
        },
        {
          id: 'bare-shell',
          name: 'shell',
          role: 'none',
          nepicId: 'nepic-1800',
          status: 'running',
          ccSessionUuid: null,
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

    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });

    // 3 claude sessions resumed + 1 default shell = at least 3 claude IDs present
    expect(livePtys).toContain('claude-arch');
    expect(livePtys).toContain('claude-fs');
    expect(livePtys).toContain('claude-te');
    // Bare terminal without ccSessionUuid is NOT resumed
    expect(livePtys).not.toContain('bare-shell');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-1800-02: exited sessions don't auto-resume
// =========================================================================
base.describe.serial('T-1800-02: exited sessions not auto-resumed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1800-02-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('exited session with ccSessionUuid is not resumed', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-1800-02',
      terminalId: null,
      sidebarVisible: 1,
      sessions: [{
        id: 'exited-claude',
        name: '001-fs-eng',
        role: 'fs-eng',
        nepicId: 'nepic-1800-02',
        status: 'exited',
        ccSessionUuid: 'uuid-exited-1800',
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

    const livePtys = await app.evaluate(() => {
      return globalThis.__napTest!.getLivePtyIds();
    });
    expect(livePtys).not.toContain('exited-claude');

    await closeIsolated(app, socketPath);
  });
});

// =========================================================================
// T-1800-03: launches counter increments on resume
// =========================================================================
base.describe.serial('T-1800-03: launches counter increments on resume', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-1800-03-'));
  const dbPath = path.join(tmpDir, '.nap', 'nap.db');

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('resumed session has launches=2 and lastResumedAt populated', async () => {
    seedDb(tmpDir, {
      nepicId: 'nepic-1800-03',
      terminalId: 'resume-count',
      sidebarVisible: 1,
      sessions: [{
        id: 'resume-count',
        name: '001-architect',
        role: 'architect',
        nepicId: 'nepic-1800-03',
        status: 'running',
        ccSessionUuid: 'uuid-count-1800',
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

    // Check that incrementSessionLaunch was called during resume
    const session = await app.evaluate(() => {
      return globalThis.__napTest!.getSession('resume-count');
    });

    // Seeded with launches=1 (default), after resume should be 2
    expect(session?.launches).toBe(2);
    expect(session?.lastResumedAt).toBeGreaterThan(0);

    await closeIsolated(app, socketPath);
  });
});
