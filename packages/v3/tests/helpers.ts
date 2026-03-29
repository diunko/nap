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
  fixture: Record<string, object | null>,
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
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
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
  const app = await electron.launch({
    args: [APP_DIR],
    env: { ...process.env, NAP_TEST: '1', NAP_CWD: tmpDir },
  });
  return app;
}

export async function cleanupApp(app: ElectronApplication, tmpDir: string): Promise<void> {
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
