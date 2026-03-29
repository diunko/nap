import { test, expect } from '@playwright/test';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F10_FIXTURE,
  execNap,
} from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let sockPath: string;

async function setupApp(fixture: Record<string, object | null>): Promise<void> {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, fixture);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for store to be populated
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0 || store?.architects?.length > 0;
    },
    { timeout: 15000 },
  );

  // Get the socket path
  sockPath = path.join(tmpDir, '.nap', 'sock');
}

// T-0210-80
test('T-0210-80: nap create napkin via real CLI → napkin appears in sidebar', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('create napkin 0300-deploy --status todo', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.slug).toBe('0300-deploy');

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        return s?.napkins?.some((n: any) => n.slug === '0300-deploy');
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-81
test('T-0210-81: nap create agent via real CLI → agent appears in sidebar', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('create agent 003-test-eng --napkin 0100-explore --role test-eng', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.name).toBe('003-test-eng');

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        return s?.napkins?.some((n: any) =>
          n.agents?.some((a: any) => a.name === '003-test-eng'),
        );
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-82
test('T-0210-82: nap start via real CLI → agent shows running in renderer', async () => {
  await setupApp(F10_FIXTURE);
  try {
    // Create a fresh agent first (001-fs-eng may be auto-started by coordinator)
    const createResult = execNap('create agent 003-test-eng --napkin 0100-explore --role test-eng', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(createResult.exitCode).toBe(0);

    // Start the freshly created agent
    const result = execNap('start 003-test-eng read prompt.md', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agents = s?.napkins?.flatMap((n: any) => n.agents) || [];
        return agents.some((a: any) => a.name === '003-test-eng' && a.running);
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-83
test('T-0210-83: nap done via real CLI → dot turns blue (done=true)', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('done', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath, NAP_SESSION_ID: 'uuid-ta' },
    });
    expect(result.exitCode).toBe(0);

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agents = s?.napkins?.flatMap((n: any) => n.agents) || [];
        return agents.some((a: any) => a.id === 'uuid-ta' && a.done);
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-84
test('T-0210-84: nap set-status via real CLI → phase label changes in renderer', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('set-status 0100-explore review', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        return s?.napkins?.some(
          (n: any) => n.slug === '0100-explore' && n.status === 'review',
        );
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-85
test('T-0210-85: nap ps via real CLI → correct tree output', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('ps --json', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);
    const agents = JSON.parse(result.stdout);
    expect(agents.find((a: any) => a.name === '001-architect')).toBeDefined();
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-86
test('T-0210-86: nap stop via real CLI → agent stops', async () => {
  await setupApp(F10_FIXTURE);
  try {
    // Create and start a fresh agent
    execNap('create agent 003-stop-target --napkin 0100-explore --role test-eng', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    execNap('start 003-stop-target test', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });

    // Wait for it to be running
    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agents = s?.napkins?.flatMap((n: any) => n.agents) || [];
        return agents.some((a: any) => a.name === '003-stop-target' && a.running);
      },
      { timeout: 10000 },
    );

    // Stop it
    const result = execNap('stop 003-stop-target', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);

    await page.waitForFunction(
      () => {
        const s = (window as any).__napStore__?.getState();
        const agents = s?.napkins?.flatMap((n: any) => n.agents) || [];
        return agents.some((a: any) => a.name === '003-stop-target' && a.exited);
      },
      { timeout: 10000 },
    );
  } finally {
    await cleanupApp(app, tmpDir);
  }
});

// T-0210-87
test('T-0210-87: nap status (inspect) via real CLI → correct output', async () => {
  await setupApp(F10_FIXTURE);
  try {
    const result = execNap('status --napkin 0100-explore --json', {
      cwd: tmpDir,
      env: { NAP_SOCKET: sockPath },
    });
    expect(result.exitCode).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.phase).toBe('doing');
    expect(status.agentCount).toBe(2);
  } finally {
    await cleanupApp(app, tmpDir);
  }
});
