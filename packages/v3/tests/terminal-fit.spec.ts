import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { launchApp, cleanupApp, makeTmpDir } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

// ── Terminal fit test ──
//
// Bug: fitAddon.fit() runs synchronously in useEffect, before the browser has
// completed layout. This can produce tiny cols, which the PTY uses to wrap text.
//
// Fix: defer fit/resize/focus to requestAnimationFrame, ensuring layout is done.
//
// Test strategy: the timing is hard to reproduce in Playwright (useEffect fires
// after layout in most cases). Instead, we test the MECHANISM: fit must be
// deferred to rAF. The __lastEffectFit__ hook records { deferred: true } when
// fit runs inside rAF.

function createFixture(tmpDir: string): void {
  const nepicDir = path.join(tmpDir, '.nap', 'nepics', 'test-nepic');

  const files: Record<string, object | string> = {
    '30-napkins/0100-explore/.napkin.nap.json': { status: 'doing' },
    '30-napkins/0100-explore/0100-explore.nap.md': '# Test\n\n* content\n',
    '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json': {
      cc_session_uuid: 'uuid-ta', role: 'test-arch', name: '001-test-arch',
      nepic: 'test-nepic', created_at: 1711700000000, started: true, exited: false,
    },
    '20-architects/001-architect/.agent.nap.json': {
      cc_session_uuid: 'uuid-arch', role: 'architect', name: '001-architect',
      nepic: 'test-nepic', created_at: 1711600000000, started: true, exited: false,
    },
  };

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(nepicDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
}

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

async function boot(): Promise<void> {
  tmpDir = makeTmpDir();
  createFixture(tmpDir);
  app = await launchApp(tmpDir);
  page = await app.firstWindow();

  await page.waitForFunction(
    () => (window as any).__napStore__?.getState()?.napkins?.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

// Test that fit is deferred to rAF (the mechanism) and produces correct cols
test('terminal fit is deferred to rAF and produces correct cols', async () => {
  await boot();

  const termId = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeTerminalId,
  );
  expect(termId).toBeTruthy();

  // Wait for terminal to be open
  await page.waitForFunction(
    (id) => {
      const entry = (window as any).__getTerminal__?.(id);
      return entry?.opened && entry.terminal.cols > 0;
    },
    termId,
    { timeout: 10000 },
  );

  // Clear the fit log
  await page.evaluate(() => {
    delete (window as any).__lastEffectFit__;
  });

  // Force Terminal unmount + remount to trigger the useEffect
  await page.evaluate(() => {
    (window as any).__napStore__.setState({ activeTerminalId: null });
  });
  await page.waitForTimeout(100);

  await page.evaluate((id) => {
    (window as any).__napStore__.getState().setActiveTerminal(id);
  }, termId);

  // Wait for rAF to fire
  await page.waitForTimeout(200);

  // Check the fit log: must be deferred (inside rAF) and have correct cols
  const fitResult = await page.evaluate(() => (window as any).__lastEffectFit__);
  expect(fitResult).toBeTruthy();
  expect(fitResult.deferred).toBe(true);
  expect(fitResult.cols).toBeGreaterThan(40);

  await cleanupApp(app, tmpDir);
});

// Verify initial boot also defers fit
test('initial boot defers terminal fit to rAF', async () => {
  await boot();

  const termId = await page.evaluate(() =>
    (window as any).__napStore__.getState().activeTerminalId,
  );
  if (!termId) {
    await cleanupApp(app, tmpDir);
    return;
  }

  const fitResult = await page.evaluate(() => (window as any).__lastEffectFit__);
  expect(fitResult).toBeTruthy();
  expect(fitResult.deferred).toBe(true);
  expect(fitResult.cols).toBeGreaterThan(40);

  await cleanupApp(app, tmpDir);
});
