import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F6_FIXTURE,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

// T-0150-60: create agent → marker on real disk → renderer shows new agent
test('T-0150-60: create agent → marker on real disk → renderer shows new agent', async () => {
  tmpDir = makeTmpDir();
  const nepicDir = createTestNepicDir(tmpDir, F6_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Wait for store to be populated
  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Trigger createAgent in main process
  await app.evaluate(async () => {
    const model = (global as any).__napModel__;
    await model.createAgent('0100-explore', {
      name: '002-fs-eng',
      role: 'fs-eng',
      cc_session_uuid: 'uuid-new',
    });
  });

  // Assert on renderer store
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.length === 2;
    },
    { timeout: 10000 },
  );

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      agentCount: s.napkins[0].agents.length,
      names: s.napkins[0].agents.map((a: any) => a.name),
    };
  });
  expect(state.agentCount).toBe(2);
  expect(state.names).toContain('002-fs-eng');

  // Verify real file on disk
  const markerPath = path.join(
    nepicDir,
    '30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json',
  );
  expect(fs.existsSync(markerPath)).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0150-61: agent exits → renderer shows exited state
test('T-0150-61: agent exits → renderer shows exited state', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F6_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  await app.evaluate(async () => {
    await (global as any).__napModel__.setAgentExited('0100-explore', '001-test-arch');
  });

  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.[0]?.exited === true;
    },
    { timeout: 10000 },
  );

  const state = await page.evaluate(() => (window as any).__napStore__.getState());
  expect(state.napkins[0].agents[0].exited).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0150-62: status change → renderer reflects new status
test('T-0150-62: status change → renderer reflects new status', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F6_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  await app.evaluate(async () => {
    await (global as any).__napModel__.setNapkinStatus('0100-explore', 'review');
  });

  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.status === 'review';
    },
    { timeout: 10000 },
  );

  const state = await page.evaluate(() => (window as any).__napStore__.getState());
  expect(state.napkins[0].status).toBe('review');

  await cleanupApp(app, tmpDir);
});

// T-0150-63: load → quit → reopen → renderer shows same state
test('T-0150-63: load → quit → reopen → renderer shows same state', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F6_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Phase 1: mutate state
  await app.evaluate(async () => {
    const model = (global as any).__napModel__;
    await model.createAgent('0100-explore', {
      name: '002-fs-eng',
      role: 'fs-eng',
      cc_session_uuid: 'uuid-new',
    });
    await model.setNapkinStatus('0100-explore', 'review');
  });

  // Wait for writes to propagate
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.length === 2 && s?.napkins?.[0]?.status === 'review';
    },
    { timeout: 10000 },
  );

  // Phase 2: quit
  await app.evaluate(({ app }) => app.quit());
  await app.close();

  // Phase 3: relaunch from same tmpDir
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  // Phase 4: verify persistent state survived
  await page.waitForFunction(
    () => {
      const s = (window as any).__napStore__?.getState();
      return s?.napkins?.[0]?.agents?.length === 2;
    },
    { timeout: 15000 },
  );

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      agentCount: s.napkins[0].agents.length,
      status: s.napkins[0].status,
      hasNewAgent: s.napkins[0].agents.some((a: any) => a.name === '002-fs-eng'),
    };
  });
  expect(state.agentCount).toBe(2);
  expect(state.status).toBe('review');
  expect(state.hasNewAgent).toBe(true);

  await cleanupApp(app, tmpDir);
});
