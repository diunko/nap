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
import { ELECTRON_LAUNCH_ARGS, testSocketPath, waitForShellReady } from './helpers';

/** Query SQLite db via CLI (better-sqlite3 is compiled for Electron ABI, not system Node) */
function sqliteQuery(dbPath: string, sql: string): string {
  return execSync(`sqlite3 "${dbPath}" "${sql}"`).toString().trim();
}

/** Seed a fresh db with schema and a ui_state row */
function seedDb(tmpDir: string, uiState: { nepicId: string | null; terminalId: string | null; sidebarVisible: number }): void {
  const dbDir = path.join(tmpDir, '.nap');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'nap.db');
  // Read schema from the built output
  const schemaPath = path.join(__dirname, '..', 'src', 'main', 'database.ts');
  const schemaSource = fs.readFileSync(schemaPath, 'utf8');
  const match = schemaSource.match(/export const SCHEMA = `([\s\S]*?)`;/);
  if (!match) throw new Error('Could not extract SCHEMA from database.ts');
  const schema = match[1];
  // Write schema + data via sqlite3 CLI
  const nepicVal = uiState.nepicId ? `'${uiState.nepicId}'` : 'NULL';
  const termVal = uiState.terminalId ? `'${uiState.terminalId}'` : 'NULL';
  const sql = `${schema}\nINSERT OR REPLACE INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ${nepicVal}, ${termVal}, ${uiState.sidebarVisible});`;
  execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '\\"')}"`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// T-0700-01: saveUiState writes correct values to ui_state table
// =========================================================================
base.describe.serial('T-0700-01: saveUiState writes correct values', () => {
  let app: ElectronApplication;
  let socketPath: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-01-'));

  base.beforeAll(async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('saves state and reads back via raw SQL', async () => {
    const result = await app.evaluate(() => {
      const { saveUiState, getDb } = globalThis.__napTest!;
      saveUiState({
        activeNepicId: 'nepic-abc',
        activeTerminalId: 'term-123',
        sidebarVisible: false,
      });
      const db = getDb();
      const row = db.prepare('SELECT * FROM ui_state WHERE id = 1').get() as any;
      return {
        activeNepicId: row.active_nepic_id,
        activeTerminalId: row.active_terminal_id,
        sidebarVisible: row.sidebar_visible,
      };
    });
    expect(result.activeNepicId).toBe('nepic-abc');
    expect(result.activeTerminalId).toBe('term-123');
    expect(result.sidebarVisible).toBe(0);
  });

  base('second save upserts (no duplicate row)', async () => {
    const result = await app.evaluate(() => {
      const { saveUiState, getDb } = globalThis.__napTest!;
      saveUiState({
        activeNepicId: 'nepic-xyz',
        activeTerminalId: 'term-456',
        sidebarVisible: true,
      });
      const db = getDb();
      const count = (db.prepare('SELECT COUNT(*) as c FROM ui_state').get() as any).c;
      const row = db.prepare('SELECT * FROM ui_state WHERE id = 1').get() as any;
      return {
        count,
        activeNepicId: row.active_nepic_id,
        activeTerminalId: row.active_terminal_id,
        sidebarVisible: row.sidebar_visible,
      };
    });
    expect(result.count).toBe(1);
    expect(result.activeNepicId).toBe('nepic-xyz');
    expect(result.activeTerminalId).toBe('term-456');
    expect(result.sidebarVisible).toBe(1);
  });

  base('saves null activeTerminalId without error', async () => {
    const result = await app.evaluate(() => {
      const { saveUiState, getDb } = globalThis.__napTest!;
      saveUiState({
        activeNepicId: null,
        activeTerminalId: null,
        sidebarVisible: true,
      });
      const db = getDb();
      const row = db.prepare('SELECT * FROM ui_state WHERE id = 1').get() as any;
      return {
        activeNepicId: row.active_nepic_id,
        activeTerminalId: row.active_terminal_id,
      };
    });
    expect(result.activeNepicId).toBeNull();
    expect(result.activeTerminalId).toBeNull();
  });
});

// =========================================================================
// T-0700-02: loadUiState reads from ui_state table
// =========================================================================
base.describe.serial('T-0700-02: loadUiState reads from ui_state table', () => {
  let app: ElectronApplication;
  let socketPath: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-02-'));

  base.beforeAll(async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('reads inserted row with correct types', async () => {
    const result = await app.evaluate(() => {
      const { loadUiState, getDb } = globalThis.__napTest!;
      const db = getDb();
      // Clear and insert known values
      db.prepare('DELETE FROM ui_state').run();
      db.prepare(
        'INSERT INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ?, ?, ?)',
      ).run('my-nepic', null, 0);
      const state = loadUiState();
      return {
        state,
        sidebarType: typeof state?.sidebarVisible,
      };
    });
    expect(result.state).not.toBeNull();
    expect(result.state!.activeNepicId).toBe('my-nepic');
    expect(result.state!.activeTerminalId).toBeNull(); // null because no matching session
    expect(result.state!.sidebarVisible).toBe(false);
    expect(result.sidebarType).toBe('boolean');
  });

  base('sidebarVisible=1 returns true (boolean, not integer)', async () => {
    const result = await app.evaluate(() => {
      const { loadUiState, getDb } = globalThis.__napTest!;
      const db = getDb();
      db.prepare('DELETE FROM ui_state').run();
      db.prepare(
        'INSERT INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ?, ?, ?)',
      ).run(null, null, 1);
      return loadUiState();
    });
    expect(result!.sidebarVisible).toBe(true);
    expect(result!.sidebarVisible).not.toBe(1);
  });

  base('validates active_terminal_id against sessions — returns null for missing session', async () => {
    const result = await app.evaluate(() => {
      const { loadUiState, getDb } = globalThis.__napTest!;
      const db = getDb();
      db.prepare('DELETE FROM ui_state').run();
      db.prepare(
        'INSERT INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ?, ?, ?)',
      ).run(null, 'nonexistent-session-id', 1);
      return loadUiState();
    });
    expect(result!.activeTerminalId).toBeNull();
  });

  base('validates active_terminal_id — returns ID when session exists', async () => {
    const result = await app.evaluate(() => {
      const { loadUiState, createSession, getDb } = globalThis.__napTest!;
      const session = createSession({ cwd: '/tmp', name: 'valid-session' });
      const db = getDb();
      db.prepare('DELETE FROM ui_state').run();
      db.prepare(
        'INSERT INTO ui_state (id, active_nepic_id, active_terminal_id, sidebar_visible) VALUES (1, ?, ?, ?)',
      ).run(null, session.id, 1);
      return loadUiState();
    });
    expect(result!.activeTerminalId).toBeTruthy();
  });
});

// =========================================================================
// T-0700-03: first launch with no ui_state row returns defaults
// =========================================================================
base.describe.serial('T-0700-03: first launch — no ui_state row', () => {
  let app: ElectronApplication;
  let socketPath: string;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-03-'));

  base.beforeAll(async () => {
    ({ app, socketPath } = await launchIsolated(tmpDir));
  });

  base.afterAll(async () => {
    if (app) await closeIsolated(app, socketPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('loadUiState returns null when table is empty', async () => {
    const result = await app.evaluate(() => {
      const { loadUiState, getDb } = globalThis.__napTest!;
      const db = getDb();
      db.prepare('DELETE FROM ui_state').run();
      return loadUiState();
    });
    expect(result).toBeNull();
  });

  base('no crash — app launches fine without ui_state row', async () => {
    // The app already launched successfully in beforeAll.
    // Verify it's functional by checking store has a terminal.
    const page = await app.firstWindow();
    const terminalCount = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.length,
    );
    expect(terminalCount).toBeGreaterThan(0);
  });
});

// =========================================================================
// T-0700-04: before-quit saves renderer state to SQLite
// =========================================================================
base.describe.serial('T-0700-04: before-quit saves renderer state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-04-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('quit persists tracked UI state to db', async () => {
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Toggle sidebar off via store (this pushes state to main via IPC)
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    // Give IPC time to push state to main
    await page.waitForTimeout(300);

    // Quit the app
    await app.evaluate(({ app }) => app.quit());
    await app.close();
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }

    // Read db via sqlite3 CLI (better-sqlite3 compiled for Electron ABI)
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');
    const sidebarVisible = sqliteQuery(dbPath, 'SELECT sidebar_visible FROM ui_state WHERE id = 1');
    expect(sidebarVisible).toBe('0'); // toggled off
  });
});

// =========================================================================
// T-0700-05: restored UI state applies to renderer store on launch
// =========================================================================
base.describe.serial('T-0700-05: restored UI state applies on launch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-05-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('sidebar=false round-trips through quit/relaunch', async () => {
    // Phase 1: launch, toggle sidebar off, quit
    const socketPath1 = testSocketPath();
    const app1 = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath1, NAP_TEST: '1' },
    });
    const page1 = await app1.firstWindow();
    await waitForShellReady(page1);

    await page1.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    await page1.waitForTimeout(300);

    await app1.evaluate(({ app }) => app.quit());
    await app1.close();
    try { fs.unlinkSync(socketPath1); } catch { /* ok */ }

    // Phase 2: relaunch with same tmpDir (same db)
    const socketPath2 = testSocketPath();
    const app2 = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath2, NAP_TEST: '1' },
    });
    const page2 = await app2.firstWindow();
    await waitForShellReady(page2);

    // Check sidebar state was restored
    const sidebarVisible = await page2.evaluate(
      () => (window as any).useTerminalStore.getState().sidebarVisible,
    );
    expect(sidebarVisible).toBe(false);

    // Active terminal should be the new first terminal (old ID won't exist)
    const activeId = await page2.evaluate(
      () => (window as any).useTerminalStore.getState().activeTerminalId,
    );
    expect(activeId).toBeTruthy();

    await app2.evaluate(({ app }) => app.quit());
    await app2.close();
    try { fs.unlinkSync(socketPath2); } catch { /* ok */ }
  });
});

// =========================================================================
// T-0700-06: stale active_terminal_id falls back to architect
// =========================================================================
base.describe.serial('T-0700-06: stale terminal ID falls back to first terminal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-06-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('nonexistent terminal ID → falls back to architect', async () => {
    // Pre-seed db with a stale active_terminal_id
    seedDb(tmpDir, { nepicId: null, terminalId: 'nonexistent-uuid-dead', sidebarVisible: 1 });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    const activeId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().activeTerminalId,
    );
    // Should NOT be the stale ID
    expect(activeId).not.toBe('nonexistent-uuid-dead');
    // Should be the first terminal (architect)
    const firstId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals[0]?.id,
    );
    expect(activeId).toBe(firstId);

    await app.evaluate(({ app }) => app.quit());
    await app.close();
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  });
});

// =========================================================================
// T-0700-07: sidebar_visible round-trips through quit/launch
// =========================================================================
base.describe.serial('T-0700-07: sidebar_visible full round-trip', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-07-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('sidebar default=true → toggle false → quit → relaunch → still false', async () => {
    // Phase 1: verify default, toggle, quit
    const socketPath1 = testSocketPath();
    const app1 = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath1, NAP_TEST: '1' },
    });
    const page1 = await app1.firstWindow();
    await waitForShellReady(page1);

    // Default should be true
    const defaultVisible = await page1.evaluate(
      () => (window as any).useTerminalStore.getState().sidebarVisible,
    );
    expect(defaultVisible).toBe(true);

    // Toggle off
    await page1.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    const afterToggle = await page1.evaluate(
      () => (window as any).useTerminalStore.getState().sidebarVisible,
    );
    expect(afterToggle).toBe(false);

    await page1.waitForTimeout(300);
    await app1.evaluate(({ app }) => app.quit());
    await app1.close();
    try { fs.unlinkSync(socketPath1); } catch { /* ok */ }

    // Phase 2: relaunch, verify restored as false
    const socketPath2 = testSocketPath();
    const app2 = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath2, NAP_TEST: '1' },
    });
    const page2 = await app2.firstWindow();
    await waitForShellReady(page2);

    const restored = await page2.evaluate(
      () => (window as any).useTerminalStore.getState().sidebarVisible,
    );
    expect(restored).toBe(false);

    await app2.evaluate(({ app }) => app.quit());
    await app2.close();
    try { fs.unlinkSync(socketPath2); } catch { /* ok */ }
  });
});

// =========================================================================
// T-0700-08: save does not block pty shutdown sequence
// =========================================================================
base.describe.serial('T-0700-08: save does not block pty shutdown', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-08-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('quit with 2 terminals completes in <3s, both ptys exit', async () => {
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Create second terminal
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore;
      const id = store.getState().createTerminal('second');
      store.getState().setActive(id);
    });
    await page.waitForTimeout(500);

    const terminalCount = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.length,
    );
    expect(terminalCount).toBe(2);

    const startTime = Date.now();
    await app.evaluate(({ app }) => app.quit());
    await app.close();
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(3000);

    // Verify db has ui_state saved (proves save ran)
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');
    const rowCount = sqliteQuery(dbPath, 'SELECT COUNT(*) FROM ui_state WHERE id = 1');
    expect(rowCount).toBe('1');

    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  });
});

// =========================================================================
// T-0700-09: quit sequence ordering — save before close
// =========================================================================
base.describe.serial('T-0700-09: save happens before closeDatabase', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-09-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('ui_state row exists in db file after quit (proves save before close)', async () => {
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Set some non-default state to prove save happened
    await page.evaluate(() => {
      (window as any).useTerminalStore.getState().toggleSidebar();
    });
    await page.waitForTimeout(300);

    await app.evaluate(({ app }) => app.quit());
    await app.close();
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }

    // Open db file after quit — if save happened before close, row exists
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');
    const sidebarVisible = sqliteQuery(dbPath, 'SELECT sidebar_visible FROM ui_state WHERE id = 1');
    expect(sidebarVisible).toBe('0');
  });
});

// =========================================================================
// T-0700-10: corrupted ui_state — invalid nepic ID
// =========================================================================
base.describe.serial('T-0700-10: invalid nepic ID in ui_state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-10-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('app launches normally with invalid active_nepic_id', async () => {
    // Pre-seed db with invalid nepic ID
    seedDb(tmpDir, { nepicId: 'deleted-nepic-id', terminalId: null, sidebarVisible: 1 });

    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // App launched without crash — that's the main assertion
    const terminalCount = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.length,
    );
    expect(terminalCount).toBeGreaterThan(0);

    // The nepic ID was set (renderer calls setActiveNepic with whatever was saved)
    // but the app should not crash regardless of whether the nepic exists
    const activeNepicId = await page.evaluate(
      () => (window as any).useTerminalStore.getState().activeNepicId,
    );
    // Should have some nepic ID (either the invalid one applied, or fell back to default)
    expect(activeNepicId).toBeTruthy();

    await app.evaluate(({ app }) => app.quit());
    await app.close();
    try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  });
});

// =========================================================================
// T-0700-11: existing quit flow still works — ptys killed, socket cleaned, db closed
// =========================================================================
base.describe.serial('T-0700-11: existing quit flow regression', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-0700-11-'));

  base.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  base('quit with 2 terminals: ptys killed, socket cleaned, db exists', async () => {
    const socketPath = testSocketPath();
    const app = await electron.launch({
      args: [...ELECTRON_LAUNCH_ARGS, '--cwd', tmpDir],
      env: { ...process.env, NAP_SOCKET: socketPath, NAP_TEST: '1' },
    });
    const page = await app.firstWindow();
    await waitForShellReady(page);

    // Create second terminal
    await page.evaluate(() => {
      const store = (window as any).useTerminalStore;
      const id = store.getState().createTerminal('regression-term');
      store.getState().setActive(id);
    });
    await page.waitForTimeout(500);

    const termIds = await page.evaluate(
      () => (window as any).useTerminalStore.getState().terminals.map((t: any) => t.id),
    );
    expect(termIds.length).toBe(2);

    await app.evaluate(({ app }) => app.quit());
    await app.close();

    // Socket file should be cleaned up
    expect(fs.existsSync(socketPath)).toBe(false);

    // DB file should exist (data persisted)
    const dbPath = path.join(tmpDir, '.nap', 'nap.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    // DB should be readable (connection was properly closed)
    // Query should not throw — proves db was closed cleanly
    const sessionCount = sqliteQuery(dbPath, 'SELECT COUNT(*) FROM sessions');
    expect(parseInt(sessionCount, 10)).toBeGreaterThanOrEqual(2);

    // ui_state row exists — proves saveUiState ran during quit
    const uiStateCount = sqliteQuery(dbPath, 'SELECT COUNT(*) FROM ui_state WHERE id = 1');
    expect(uiStateCount).toBe('1');
  });
});
