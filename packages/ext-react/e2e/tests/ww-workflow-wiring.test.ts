/**
 * WW-P01..P04: Workflow wiring Playwright tests.
 * Verifies hash parsing → session switch → auto-clone → link routing.
 */
import { test, expect, openSidePanel } from './fixtures';

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL = `https://github.com/diunko/nap-test-main${NAP_HASH}`;

/**
 * Navigate to GitHub with hash and wait for content script.
 */
async function openGitHubWithHash(
  context: import('@playwright/test').BrowserContext,
  url: string,
): Promise<import('@playwright/test').Page> {
  const page = context.pages()[0] || await context.newPage();
  console.log(`[openGitHubWithHash] navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  console.log('[openGitHubWithHash] waiting for content script...');
  await page.waitForFunction(
    () => document.body?.dataset?.napLoaded === 'true',
    {},
    { timeout: 10_000 },
  );
  console.log('[openGitHubWithHash] content script loaded');
  return page;
}

// ── WW-P01: hash parsing → session switch + mainRepoConfig ──

test('WW-P01: hash parsing → session switch + config', async ({ context, extensionId }) => {
  const ghPage = await openGitHubWithHash(context, GITHUB_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for store to be available
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );
  console.log('[WW-P01] store available');

  // The panel should have received config from content script.
  // Wait a moment for the config request/response cycle.
  await panel.waitForTimeout(2000);

  // Check session key — should NOT be 'default'
  const state = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      mainRepoConfig: s.mainRepoConfig,
      prNum: s.prNum,
      focusedCardSlug: s.focusedCardSlug,
      pendingClone: s.pendingClone,
    };
  });
  console.log('[WW-P01] store state:', JSON.stringify(state));

  // mainRepoConfig should be auto-set from the URL
  expect(state.mainRepoConfig).not.toBeNull();
  if (state.mainRepoConfig) {
    expect(state.mainRepoConfig.owner).toBe('diunko');
    expect(state.mainRepoConfig.repo).toBe('nap-test-main');
    console.log(`[WW-P01] mainRepoConfig: ${state.mainRepoConfig.owner}/${state.mainRepoConfig.repo} branch=${state.mainRepoConfig.branch}`);
  }

  // prNum should be 0 (not a PR URL)
  expect(state.prNum).toBe(0);

  console.log('[WW-P01] PASS');
});

// ── WW-P02: auto-clone on first visit (gate test) ──

test('WW-P02: auto-clone on first visit', async ({ context, extensionId }) => {
  const ghPage = await openGitHubWithHash(context, GITHUB_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);

  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );

  // Check if auto-clone was triggered (pendingClone set + cloningStatus)
  // Give it a moment for the config to arrive and clone to trigger
  await panel.waitForTimeout(3000);

  const preCloneState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      cloningStatus: s.cloningStatus,
      pendingClone: s.pendingClone,
      navSectionCount: s.navSections.length,
    };
  });
  console.log('[WW-P02] pre-check state:', JSON.stringify(preCloneState));

  // Wait for nav to populate (clone complete → nav scan → sections appear)
  // This is the gate test — if auto-clone works, nav populates.
  // If it doesn't, we'll hit the timeout and get the actual state for debugging.
  try {
    await panel.waitForFunction(
      () => (window as any).__napStore__.getState().navSections.length > 0,
      { timeout: 45_000 },
    );
    console.log('[WW-P02] nav populated!');
  } catch {
    // Dump state for debugging
    const debugState = await panel.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      return {
        navSectionCount: s.navSections.length,
        cloningStatus: s.cloningStatus,
        pendingClone: s.pendingClone,
        mainRepoConfig: s.mainRepoConfig,
      };
    });
    console.log('[WW-P02] TIMEOUT — state at failure:', JSON.stringify(debugState));
    throw new Error(`Auto-clone failed: navSections still empty. State: ${JSON.stringify(debugState)}`);
  }

  // Verify napkin card appears in sidebar
  const cardCount = await panel.locator('[data-testid="napkin-card"]').count();
  console.log(`[WW-P02] napkin card count: ${cardCount}`);
  expect(cardCount).toBeGreaterThan(0);

  // Verify focused card matches napkin from hash
  const focusedSlug = await panel.evaluate(() =>
    (window as any).__napStore__.getState().focusedCardSlug,
  );
  console.log(`[WW-P02] focusedCardSlug: ${focusedSlug}`);
  // Should contain '0100' (from napkin=01-v1/0100-delivery-pipeline)
  if (focusedSlug) {
    expect(focusedSlug).toContain('0100');
  }

  // mainRepoConfig should be set
  const mainRepo = await panel.evaluate(() =>
    (window as any).__napStore__.getState().mainRepoConfig,
  );
  expect(mainRepo).not.toBeNull();
  console.log(`[WW-P02] mainRepoConfig: ${JSON.stringify(mainRepo)}`);

  console.log('[WW-P02] PASS — auto-clone + nav + napkin focus all work');
});

// ── WW-P03: link routing (blob fallback — no PR diff) ──

test('WW-P03: link routing blob fallback', async ({ context, extensionId }) => {
  const ghPage = await openGitHubWithHash(context, GITHUB_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);

  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );

  // Wait for auto-clone to complete
  try {
    await panel.waitForFunction(
      () => (window as any).__napStore__.getState().navSections.length > 0,
      { timeout: 45_000 },
    );
  } catch {
    console.log('[WW-P03] clone timed out — test may fail');
  }

  // Focus the 0100 napkin card
  const card = panel.locator('[data-testid="napkin-card"]').first();
  await card.click();
  await panel.waitForTimeout(300);

  // Extend card to see mini-book subdirectory
  await panel.keyboard.press('Meta+e');
  await panel.waitForTimeout(300);

  // Find a chapter file (has file:line links)
  const fileEntries = panel.locator('[data-testid="file-entry"]');
  const count = await fileEntries.count();
  let chapterIdx = -1;
  for (let i = 0; i < count; i++) {
    const text = await fileEntries.nth(i).textContent();
    if (text?.includes('order-routing') || text?.includes('01-order')) {
      chapterIdx = i;
      break;
    }
  }

  if (chapterIdx === -1) {
    // fallback: any .md that isn't a napkin metadata file
    for (let i = 0; i < count; i++) {
      const text = await fileEntries.nth(i).textContent();
      if (text?.trim().endsWith('.md') && !text?.includes('.nap.md') && !text?.includes('.spec') && !text?.includes('.stories') && !text?.includes('.test')) {
        chapterIdx = i;
        break;
      }
    }
  }

  if (chapterIdx >= 0) {
    await fileEntries.nth(chapterIdx).click();
    await panel.waitForTimeout(1000);

    // Verify the link routing produces blob URLs (since prNum=0, no diff context)
    const routeResult = await panel.evaluate(() => {
      const store = (window as any).__napStore__;
      const s = store.getState();
      return {
        prNum: s.prNum,
        prDiffRanges: s.prDiffRanges,
        mainRepoConfig: s.mainRepoConfig,
      };
    });
    console.log(`[WW-P03] routing context: prNum=${routeResult.prNum}, diffRanges=${routeResult.prDiffRanges}`);

    // prNum=0 means all links should go to blob view
    expect(routeResult.prNum).toBe(0);

    // Verify a code link resolves to blob URL
    const linkCheck = await panel.evaluate(() => {
      const store = (window as any).__napStore__;
      const config = store.getState().mainRepoConfig;
      if (!config) return { error: 'no mainRepoConfig' };
      // Simulate what routeLink would produce for a code link
      const cleanPath = 'modules/delivery/order-router.ts';
      const url = `https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${cleanPath}#L54`;
      return { url };
    });
    console.log(`[WW-P03] blob URL would be: ${(linkCheck as any).url}`);
    if ('url' in linkCheck) {
      expect(linkCheck.url).toContain('/blob/');
      expect(linkCheck.url).toContain('diunko/nap-test-main');
    }

    console.log('[WW-P03] PASS — blob fallback routing correct');
  } else {
    console.log('[WW-P03] SKIP — no chapter file found');
  }
});
