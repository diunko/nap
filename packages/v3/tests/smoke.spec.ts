import { test, expect } from '@playwright/test';
import { launchApp, cleanupApp, makeTmpDir, createTestNepicDir } from './helpers';

test('app launches and window exists', async () => {
  const tmpDir = makeTmpDir();
  createTestNepicDir(tmpDir, {
    'nepic/20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
      created_at: 1711600000000,
    },
  });

  const app = await launchApp(tmpDir);
  const window = await app.firstWindow();
  expect(window).toBeTruthy();

  await cleanupApp(app, tmpDir);
});
