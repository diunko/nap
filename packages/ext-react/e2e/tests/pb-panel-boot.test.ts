/**
 * PB-P01..P08: Panel boot Playwright tests.
 * Boot gate states, auto-clone, return visit, refresh PR, idle pane, content script fallback.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  cmdClickLink, switchToTerminal, typeInTerminal,
  waitForPanelReady, getEditorContent,
} from './fixtures';

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_HASH = `https://github.com/diunko/nap-test-main${NAP_HASH}`;
const PR_URL_WITH_HASH = `https://github.com/diunko/nap-test-main/pull/1${NAP_HASH}`;
const GITHUB_URL_NO_HASH = 'https://github.com/diunko/nap-test-main';
const NON_GITHUB_URL = 'https://example.com';

/**
 * Navigate to a URL without waiting for content script (for non-GitHub pages).
 */
async function navigateToUrl(
  context: import('@playwright/test').BrowserContext,
  url: string,
): Promise<import('@playwright/test').Page> {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  return page;
}

// ── PB-P01: gate → SESSION (normal start, hash in URL) ──

test('PB-P01: gate → SESSION — normal start with hash', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // DOM: no boot-message overlay
  const bootMessage = panel.locator('[data-testid="boot-message"]');
  expect(await bootMessage.count()).toBe(0);

  // DOM: header bar visible (pipeline completed, Panel mounted)
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible();

  // DOM: tab bar visible
  const tabBar = panel.locator('[data-testid="tab-bar"]');
  await expect(tabBar).toBeVisible();

  // Store: mainRepoConfig set correctly
  const state = await panel.evaluate(() => {
    const s = (window as any).__napStore__?.getState();
    if (!s) return { mainRepoConfig: null, prNum: 0 };
    return {
      mainRepoConfig: s.mainRepoConfig,
      prNum: s.prNum,
    };
  });
  expect(state.mainRepoConfig).not.toBeNull();
  expect(state.mainRepoConfig.owner).toBe('diunko');
  expect(state.mainRepoConfig.repo).toBe('nap-test-main');

  console.log('[PB-P01] PASS — gate → SESSION, config applied, no message overlay');
});

// ── PB-P02: gate → MESSAGE (github, no hash) ──

test('PB-P02: gate → MESSAGE — github, no hash', async ({ context, extensionId }) => {
  // Navigate to GitHub WITHOUT hash — need content script for trigger button
  const ghPage = await openGitHub(context, GITHUB_URL_NO_HASH);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for boot to resolve
  await panel.waitForTimeout(2000);

  // DOM: boot-message visible with "review link" text
  const bootMessage = panel.locator('[data-testid="boot-message"]');
  await expect(bootMessage).toBeVisible({ timeout: 5_000 });
  await expect(bootMessage).toContainText('review link');

  // DOM: no session UI (no header bar, no sidebar, no editor)
  const headerBar = panel.locator('[data-testid="header-bar"]');
  expect(await headerBar.count()).toBe(0);

  const sidebar = panel.locator('[data-testid="napkin-card"]');
  expect(await sidebar.count()).toBe(0);

  // No store exposed (no session created)
  const hasStore = await panel.evaluate(
    () => (window as any).__napStore__ != null,
  );
  expect(hasStore).toBe(false);

  console.log('[PB-P02] PASS — gate → MESSAGE (no hash), no session UI');
});

// ── PB-P03: gate → MESSAGE (not GitHub) ──

test('PB-P03: gate → MESSAGE — not GitHub', async ({ context, extensionId }) => {
  // Navigate to a non-GitHub page — no content script, so open panel via URL
  const page = await navigateToUrl(context, NON_GITHUB_URL);
  // Wait for page to be loaded
  await page.waitForTimeout(1000);

  // Open side panel by navigating directly to its URL
  // Since there's no content script on example.com, we use the direct panel URL
  const panelUrl = `chrome-extension://${extensionId}/side-panel.html`;
  const panel = await context.newPage();
  await panel.goto(panelUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });

  // Wait for boot to resolve
  await panel.waitForTimeout(2000);

  // DOM: boot-message visible with "GitHub" text
  const bootMessage = panel.locator('[data-testid="boot-message"]');
  await expect(bootMessage).toBeVisible({ timeout: 5_000 });
  await expect(bootMessage).toContainText('GitHub');

  // DOM: no session UI
  const headerBar = panel.locator('[data-testid="header-bar"]');
  expect(await headerBar.count()).toBe(0);

  // No store exposed
  const hasStore = await panel.evaluate(
    () => (window as any).__napStore__ != null,
  );
  expect(hasStore).toBe(false);

  console.log('[PB-P03] PASS — gate → MESSAGE (not GitHub), no session UI');
});

// ── PB-P04: auto-clone gate test (first visit) ──

test('PB-P04: auto-clone gate test — first visit', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // Wait for auto-clone to complete
  await cloneFixtureRepo(panel);

  // DOM: napkin cards visible in sidebar
  const cards = panel.locator('[data-testid="napkin-card"]');
  expect(await cards.count()).toBeGreaterThan(0);

  // DOM: focused card matches napkin from hash (0100)
  const focusedSlug = await panel.evaluate(() =>
    (window as any).__napStore__.getState().focusedCardSlug,
  );
  expect(focusedSlug).toContain('0100');

  // DOM: delivery-pipeline card visible with status
  const dpCard = cards.filter({ hasText: 'delivery-pipeline' }).first();
  await expect(dpCard).toBeVisible();

  // No content script dependency for config — store has config from tab URL
  const config = await panel.evaluate(() =>
    (window as any).__napStore__.getState().mainRepoConfig,
  );
  expect(config).not.toBeNull();
  expect(config.owner).toBe('diunko');

  // cloningStatus should be 'done'
  const cloningStatus = await panel.evaluate(() =>
    (window as any).__napStore__.getState().cloningStatus,
  );
  expect(cloningStatus).toBe('done');

  console.log('[PB-P04] PASS — auto-clone from boot gate, nav populated, napkin focused');
});

// ── PB-P05: return visit — IDB restore ──

test('PB-P05: return visit — IDB restore', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  // First visit: clone + populate
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Record first visit state
  const firstState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      navCount: s.navSections.length,
      mainRepoConfig: s.mainRepoConfig,
    };
  });
  expect(firstState.navCount).toBeGreaterThan(0);

  // Wait for persist flush
  await panel.waitForTimeout(1500);

  // Close panel and reopen
  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel2);

  // Nav should populate FAST from IDB scan (not clone) — 10s not 45s
  await panel2.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 10_000 },
  );

  // DOM: napkin cards visible
  const cards = panel2.locator('[data-testid="napkin-card"]');
  expect(await cards.count()).toBeGreaterThan(0);

  // cloningStatus stays idle (no clone triggered)
  const returnState = await panel2.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      cloningStatus: s.cloningStatus,
      navCount: s.navSections.length,
      mainRepoConfig: s.mainRepoConfig,
    };
  });
  expect(returnState.cloningStatus).toBe('idle');
  expect(returnState.navCount).toBeGreaterThan(0);
  expect(returnState.mainRepoConfig).not.toBeNull();

  console.log('[PB-P05] PASS — return visit: IDB restore, no clone, nav instant');
});

// ── PB-P06: refresh PR button ──

test('PB-P06: refresh PR button', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context, PR_URL_WITH_HASH);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Record session state before refresh
  const preState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      prNum: s.prNum,
      mainRepoConfig: s.mainRepoConfig,
      navCount: s.navSections.length,
    };
  });
  expect(preState.prNum).toBe(1);

  // DOM: refresh-pr button visible
  const refreshBtn = panel.locator('[data-testid="refresh-pr-btn"]');
  await expect(refreshBtn).toBeVisible();

  // Click refresh PR
  await refreshBtn.click();
  await panel.waitForTimeout(2000);

  // Session is NOT recreated — nav still there
  const postState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      prNum: s.prNum,
      mainRepoConfig: s.mainRepoConfig,
      navCount: s.navSections.length,
    };
  });

  // Nav not disrupted
  expect(postState.navCount).toBeGreaterThan(0);
  // Config intact
  expect(postState.mainRepoConfig).not.toBeNull();
  expect(postState.prNum).toBe(1);

  // DOM: napkin cards still visible (no remount)
  const cards = panel.locator('[data-testid="napkin-card"]');
  expect(await cards.count()).toBeGreaterThan(0);

  console.log('[PB-P06] PASS — refresh PR: button click, session intact, nav undisrupted');
});

// ── PB-P07: idle pane ──

test('PB-P07: idle pane — DOM: editor visible, terminal hidden, repo/branch shown', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // No file selected initially — idle pane should be visible

  // DOM: editor surface visible (default), terminal hidden
  const editorSurface = panel.locator('#editor-surface');
  await expect(editorSurface).toHaveCSS('visibility', 'visible');

  const terminalSurface = panel.locator('#terminal-surface');
  await expect(terminalSurface).toHaveCSS('visibility', 'hidden');

  // DOM: idle pane visible with repo/branch info
  const idlePane = panel.locator('[data-testid="idle-pane"]');
  await expect(idlePane).toBeVisible({ timeout: 5_000 });
  await expect(idlePane).toContainText('diunko/nap-test-main');
  await expect(idlePane).toContainText('main');

  // DOM: activeSurface is 'editor'
  const surface = await panel.evaluate(() =>
    (window as any).__napStore__.getState().activeSurface,
  );
  expect(surface).toBe('editor');

  // Click Terminal tab → terminal visible, editor hidden
  await switchToTerminal(panel);
  await expect(terminalSurface).toHaveCSS('visibility', 'visible');
  await expect(editorSurface).toHaveCSS('visibility', 'hidden');

  // Click a file in sidebar → editor shows file, idle pane gone
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  await expect(editorSurface).toHaveCSS('visibility', 'visible');
  // Idle pane should be gone (file is now open)
  await expect(idlePane).not.toBeVisible();

  // Monaco editor should have content
  const viewLines = panel.locator('.monaco-editor .view-lines');
  await expect(viewLines).toContainText('delivery pipeline', { timeout: 5_000 });

  console.log('[PB-P07] PASS — idle pane: editor visible, repo/branch shown, terminal hidden, file replaces idle');
});

// ── PB-P08: content script fallback — link clicks work ──

test('PB-P08: content script fallback — link clicks navigate', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Open the chapter that has code links
  await focusNapkinCard(panel, 'delivery-pipeline');

  // Extend card to see mini-book
  await panel.keyboard.press('Meta+e');
  await panel.waitForTimeout(300);

  // Click chapter file
  await clickFileInNav(panel, '01-order-routing.md');

  // Verify content loaded with code links
  const content = await getEditorContent(panel);
  expect(content).toContain('order-router.ts');

  const urlBefore = ghPage.url();

  // Cmd+click a code link — should navigate GitHub tab
  await cmdClickLink(panel, '/modules/delivery/order-router.ts#L54');

  // GitHub tab should navigate to the code URL
  await ghPage.waitForURL(
    (url) => url.toString() !== urlBefore,
    { timeout: 15_000 },
  );

  const finalUrl = ghPage.url();
  console.log(`[PB-P08] GitHub tab navigated to: ${finalUrl}`);

  // URL should contain the file reference
  expect(finalUrl).toContain('nap-test-main');
  expect(finalUrl).toContain('order-router');

  console.log('[PB-P08] PASS — link click navigated GitHub tab');
});
