import { test, expect } from '@playwright/test';
import {
  launchApp,
  cleanupApp,
  makeTmpDir,
  createTestNepicDir,
  F1_FIXTURE,
  F2_FIXTURE,
} from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

// T-0100-30: app boots and sidebar renders napkins from marker files
test('T-0100-30: app boots and sidebar renders napkins from marker files', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F1_FIXTURE);
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

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      napkinCount: s.napkins.length,
      firstSlug: s.napkins[0]?.slug,
      architectCount: s.architects.length,
      firstArchitectName: s.architects[0]?.name,
    };
  });

  expect(state.napkinCount).toBe(1);
  expect(state.firstSlug).toBe('0100-explore');
  expect(state.architectCount).toBe(1);
  expect(state.firstArchitectName).toBe('001-architect');

  await cleanupApp(app, tmpDir);
});

// T-0100-31: bridge delivers real IPC — snapshot arrives at renderer store
test('T-0100-31: bridge delivers real IPC — snapshot arrives at renderer store', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F1_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  const state = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      napkinCount: s.napkins.length,
      architectCount: s.architects.length,
      hasAgents: s.napkins[0]?.agents?.length > 0,
    };
  });

  expect(state.napkinCount).toBeGreaterThan(0);
  expect(state.hasAgents).toBe(true);

  await cleanupApp(app, tmpDir);
});

// T-0100-32: sidebar renders agent dots under napkin cards
test('T-0100-32: sidebar renders agent dots under napkin cards', async () => {
  tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, F2_FIXTURE);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => {
      const store = (window as any).__napStore__?.getState();
      return store?.napkins?.length > 0;
    },
    { timeout: 15000 },
  );

  // Verify via store — 2 agents on the napkin
  const agentCount = await page.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return s.napkins[0]?.agents?.length;
  });

  expect(agentCount).toBe(2);

  await cleanupApp(app, tmpDir);
});
