import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F8_FIXTURE,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let nepicDir: string;

// T-0200-60: Launch with fixture → ptys spawned → store shows running agents
test('T-0200-60: launch with fixture → ptys spawned → store shows running agents', async () => {
  tmpDir = makeTmpDir();
  nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.some((a: any) => a.running === true);
    },
    { timeout: 15000 },
  );

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      runningIds: s.napkins.flatMap((n: any) =>
        n.agents.filter((a: any) => a.running).map((a: any) => a.id),
      ),
      exitedIds: s.napkins.flatMap((n: any) =>
        n.agents.filter((a: any) => a.exited).map((a: any) => a.id),
      ),
    };
  });

  expect(state.runningIds).toContain('uuid-ta');
  expect(state.runningIds).toContain('uuid-fresh');
  expect(state.exitedIds).toContain('uuid-fs');
  expect(state.runningIds).not.toContain('uuid-fs');

  await cleanupApp(app, tmpDir);
});

// T-0200-61: Agent pty exits → marker on real disk → store shows exited
test('T-0200-61: agent pty exits → marker on real disk → store shows exited', async () => {
  tmpDir = makeTmpDir();
  nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for running
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.some((a: any) => a.running === true);
    },
    { timeout: 15000 },
  );

  // Kill one pty
  await app.evaluate(async () => {
    (global as any).__napPtyManager__.kill('uuid-ta');
  });

  // Wait for store to show exited
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      const agent = s?.napkins?.[0]?.agents?.find((a: any) => a.id === 'uuid-ta');
      return agent?.exited === true && agent?.running === false;
    },
    { timeout: 10000 },
  );

  // Verify marker on real disk
  const markerPath = path.join(
    nepicDir,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json',
  );
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
  expect(marker.exited).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0200-62: Quit → reopen → same agents running, exited still exited
test('T-0200-62: quit → reopen → same agents running, exited still exited', async () => {
  tmpDir = makeTmpDir();
  nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Phase 1: verify running
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.some((a: any) => a.running);
    },
    { timeout: 15000 },
  );

  // Phase 2: quit
  await app.evaluate(({ app }) => app.quit());
  await app.close();

  // Phase 3: relaunch
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Phase 4: verify same state
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.some((a: any) => a.running);
    },
    { timeout: 15000 },
  );

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      runningIds: s.napkins.flatMap((n: any) =>
        n.agents.filter((a: any) => a.running).map((a: any) => a.id),
      ),
      exitedIds: s.napkins.flatMap((n: any) =>
        n.agents.filter((a: any) => a.exited).map((a: any) => a.id),
      ),
    };
  });
  expect(state.runningIds).toContain('uuid-ta');
  expect(state.exitedIds).toContain('uuid-fs');

  await cleanupApp(app, tmpDir);
});

// T-0200-63: Quit does NOT write exited flags to real disk
test('T-0200-63: quit does NOT write exited flags to real disk', async () => {
  tmpDir = makeTmpDir();
  nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);

  const markerPath = path.join(
    nepicDir,
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json',
  );
  const before = fs.readFileSync(markerPath, 'utf-8');

  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.some((a: any) => a.running);
    },
    { timeout: 15000 },
  );

  await app.evaluate(({ app }) => app.quit());
  await app.close();

  const after = fs.readFileSync(markerPath, 'utf-8');
  expect(JSON.parse(after).exited).toBe(false);
  expect(after).toBe(before);
});

// T-0200-64: Case C agent → started=true written to real disk
test('T-0200-64: Case C agent → started=true written to real disk', async () => {
  tmpDir = makeTmpDir();
  nepicDir = createTestNepicDir(tmpDir, F8_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for Case C agent to be running
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      const agent = s?.napkins?.[1]?.agents?.[0];
      return agent?.running === true;
    },
    { timeout: 15000 },
  );

  const markerPath = path.join(
    nepicDir,
    '30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json',
  );
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
  expect(marker.started).toBe(true);

  await cleanupApp(app, tmpDir);
});
