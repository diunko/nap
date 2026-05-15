import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const APP_DIR = path.join(__dirname, '..');

/**
 * Write a test fixture to real filesystem for medium tests.
 * Takes a Record<string, object | null> (same shape as MemoryFileSystem)
 * and writes it to a tmpDir.
 */
export function createTestNepicDir(
  tmpDir: string,
  fixture: Record<string, object | string | null>,
): string {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  for (const [filePath, content] of Object.entries(fixture)) {
    // Strip the "nepic/" prefix from fixture paths
    const realPath = filePath.startsWith('nepic/')
      ? filePath.slice('nepic/'.length)
      : filePath;

    const fullPath = path.join(nepicDir, realPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    if (content !== null) {
      if (typeof content === 'string') {
        fs.writeFileSync(fullPath, content);
      } else {
        fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
      }
    }
    // null = directory marker, directory already created by mkdirSync
  }

  return nepicDir;
}

/**
 * Launch v3 Electron app for testing.
 * Sets NAP_CWD to a tmpDir containing fixture data.
 */
export async function launchApp(tmpDir: string): Promise<ElectronApplication> {
  // Use a unique user-data-dir to avoid conflicts with running dev instance.
  // Clear NAP_SOCKET so tests don't inherit the dev instance's socket path.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-v3-electron-'));
  const { NAP_SOCKET: _, ...cleanEnv } = process.env;
  const app = await electron.launch({
    args: [APP_DIR, `--user-data-dir=${userDataDir}`],
    env: { ...cleanEnv, NAP_TEST: '1', NAP_CWD: tmpDir },
  });
  // Store for cleanup
  (app as any).__userDataDir = userDataDir;

  // Pipe main process stdout/stderr when TRACE=1
  if (process.env['TRACE'] === '1') {
    app.process().stdout?.on('data', (d: Buffer) => process.stdout.write(d));
    app.process().stderr?.on('data', (d: Buffer) => process.stderr.write(d));
  }

  return app;
}

export async function cleanupApp(app: ElectronApplication, tmpDir: string): Promise<void> {
  const userDataDir = (app as any).__userDataDir;
  try {
    // Try graceful quit with a timeout — if the app is hung, don't wait forever
    await Promise.race([
      app.evaluate(({ app }) => app.quit()),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // App may already be closed or unresponsive
  }
  try {
    await app.close();
  } catch {
    // Force-kill: app.close() can throw if process already exited
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
}

export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nap-v3-test-'));
}

// Fixture data matching F1 from test.md (without the "nepic/" prefix is handled by createTestNepicDir)
export const F1_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    created_at: 1711700000000,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    created_at: 1711600000000,
  },
};

// F6: lifecycle fixture (same data as F1 — used for write/watch medium tests)
export const F6_FIXTURE: Record<string, object | null> = F1_FIXTURE;

// F8: survivability fixture (three agent cases)
export const F8_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-test-arch',
    parent_id: 'uuid-ta',
    created_at: 1711700100000,
    started: true,
    exited: true,
  },
  'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog', nepic: 'test-nepic' },
  'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fresh',
    role: 'fs-eng',
    name: '001-fs-eng',
    napkin: '0200-build',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711800000000,
    started: false,
    exited: false,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

// F9: all-exited fixture
export const F9_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'done', nepic: 'test-nepic' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-1',
    role: 'test-arch',
    name: '001-test-arch',
    nepic: 'test-nepic',
    created_at: 1711700000000,
    started: true,
    exited: true,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    nepic: 'test-nepic',
    created_at: 1711600000000,
    started: true,
    exited: true,
  },
};

// F10: CLI integration fixture
export const F10_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'doing', nepic: 'test-nepic' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-ta',
    role: 'test-arch',
    name: '001-test-arch',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-architect',
    parent_id: 'uuid-arch',
    created_at: 1711700000000,
    started: true,
    exited: false,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fs',
    role: 'fs-eng',
    name: '002-fs-eng',
    napkin: '0100-explore',
    nepic: 'test-nepic',
    parent: '001-test-arch',
    parent_id: 'uuid-ta',
    created_at: 1711700100000,
    started: true,
    exited: true,
  },
  'nepic/30-napkins/0200-build/.napkin.nap.json': { status: 'backlog', nepic: 'test-nepic' },
  'nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-fresh',
    role: 'fs-eng',
    name: '001-fs-eng',
    napkin: '0200-build',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711800000000,
    started: false,
    exited: false,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    nepic: 'test-nepic',
    parent: null,
    parent_id: null,
    created_at: 1711600000000,
    started: true,
    exited: false,
  },
};

/**
 * Run the nap CLI binary as a subprocess.
 * Returns { stdout, stderr, exitCode }.
 */
export function execNap(
  command: string,
  opts: { cwd?: string; env?: Record<string, string> } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const { execFileSync } = require('child_process') as typeof import('child_process');
  const cliPath = require('path').join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js') as string;
  const args = command.split(' ').filter(Boolean);

  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      encoding: 'utf8',
      timeout: 10000,
    });
    return { stdout: stdout as string, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout as string) || '',
      stderr: (e.stderr as string) || '',
      exitCode: e.status || 1,
    };
  }
}

// F2-like fixture with 2 agents on one napkin
export const F2_FIXTURE: Record<string, object | null> = {
  'nepic/30-napkins/0100-explore/.napkin.nap.json': { status: 'done' },
  'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
    cc_session_uuid: 'uuid-1',
    role: 'test-arch',
    name: '001-test-arch',
    created_at: 1711700000000,
  },
  'nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json': {
    cc_session_uuid: 'uuid-2',
    role: 'fs-eng',
    name: '002-fs-eng',
    created_at: 1711700100000,
  },
  'nepic/20-architects/001-architect/.agent.nap.json': {
    cc_session_uuid: 'uuid-arch',
    role: 'architect',
    name: '001-architect',
    created_at: 1711600000000,
  },
};
