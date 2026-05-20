/**
 * FM-P01..P05: Focus mode — Playwright DOM assertions
 *
 * FM-P01: show-all renders architects + separator + napkins
 * FM-P02: focus mode shows only the focused card
 * FM-P03: focus toggle round-trip — focus follows clicks
 * FM-P04: Ctrl+Shift+F keyboard shortcut
 * FM-P05: focus mode persists across close/reopen
 */
import type { Page } from '@playwright/test';
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, switchToTerminal,
  typeInTerminal, waitForPanelReady,
} from './fixtures';

const NEPIC = '/home/user/nap-test-nap/nepics/01-v1';

/**
 * Ensure fixture repo has >= 1 architect and >= 2 napkins.
 * Creates missing directories via terminal, waits for nav refresh.
 */
async function ensureFixtures(panel: Page): Promise<void> {
  const info = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const arch = s.navSections.find((sec: any) => sec.name.startsWith('20-architects'));
    const nap = s.navSections.find((sec: any) => sec.name.startsWith('30-napkins'));
    return {
      hasArch: !!(arch?.children?.length > 0),
      napCount: nap?.children?.length ?? 0,
    };
  });

  if (info.hasArch && info.napCount >= 2) return;

  await switchToTerminal(panel);

  if (!info.hasArch) {
    await typeInTerminal(panel, `mkdir -p ${NEPIC}/20-architects/001-architect`);
    await panel.waitForTimeout(500);
    await typeInTerminal(panel, `echo '# architect prompt' > ${NEPIC}/20-architects/001-architect/prompt.md`);
    await panel.waitForTimeout(500);
  }

  if (info.napCount < 2) {
    await typeInTerminal(panel, `mkdir -p ${NEPIC}/30-napkins/0200-crust-validation`);
    await panel.waitForTimeout(500);
    await typeInTerminal(panel, `echo '{"status":"backlog"}' > ${NEPIC}/30-napkins/0200-crust-validation/.napkin.nap.json`);
    await panel.waitForTimeout(500);
    await typeInTerminal(panel, `echo '# crust' > ${NEPIC}/30-napkins/0200-crust-validation/0200-crust-validation.nap.md`);
    await panel.waitForTimeout(500);
  }

  // Wait for nav refresh to pick up new directories
  await panel.waitForFunction(() => {
    const s = (window as any).__napStore__.getState();
    const arch = s.navSections.find((sec: any) => sec.name.startsWith('20-architects'));
    const nap = s.navSections.find((sec: any) => sec.name.startsWith('30-napkins'));
    return !!(arch?.children?.length > 0 && nap?.children?.length >= 2);
  }, { timeout: 15_000 });
}

// ── FM-P01: show-all renders architects + separator + napkins ──

test('FM-P01: show-all renders architects + separator + napkins', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  await ensureFixtures(panel);

  // Start: focus mode on
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(true);

  // Toggle to show-all
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(false);

  // Architect cards visible
  const archCards = panel.locator('[data-testid="architect-card"]');
  expect(await archCards.count()).toBeGreaterThanOrEqual(1);
  await expect(archCards.first()).toBeVisible();

  // Separator visible
  const sep = panel.locator('[data-testid="section-separator"]');
  await expect(sep).toBeVisible();

  // Napkin cards visible (>= 2)
  const napCards = panel.locator('[data-testid="napkin-card"]');
  expect(await napCards.count()).toBeGreaterThanOrEqual(2);

  // Vertical order: architects → separator → napkins
  const aBox = await archCards.first().boundingBox();
  const sBox = await sep.boundingBox();
  const nBox = await napCards.first().boundingBox();
  expect(aBox).toBeTruthy();
  expect(sBox).toBeTruthy();
  expect(nBox).toBeTruthy();
  expect(aBox!.y).toBeLessThan(sBox!.y);
  expect(sBox!.y).toBeLessThan(nBox!.y);

  console.log('[FM-P01] PASS — architects + separator + napkins in correct DOM order');
});

// ── FM-P02: focus mode shows only focused card ──

test('FM-P02: focus mode shows only focused card', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  await ensureFixtures(panel);

  // Toggle to show-all — verify multiple cards
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);

  const totalShowAll = (await panel.locator('[data-testid="napkin-card"]').count()) +
                       (await panel.locator('[data-testid="architect-card"]').count());
  expect(totalShowAll).toBeGreaterThan(1);

  // Toggle back to focus
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(true);

  // Exactly one card visible
  const napCount = await panel.locator('[data-testid="napkin-card"]').count();
  const archCount = await panel.locator('[data-testid="architect-card"]').count();
  expect(napCount + archCount).toBe(1);

  // No separator
  expect(await panel.locator('[data-testid="section-separator"]').count()).toBe(0);

  // Visible card matches focusedCardSlug
  const slug = await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug);
  expect(slug).toBeTruthy();

  console.log('[FM-P02] PASS — focus mode shows exactly one card, no separator');
});

// ── FM-P03: focus toggle round-trip ──

test('FM-P03: focus toggle round-trip — focus follows clicks', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  await ensureFixtures(panel);

  // Start: focus on 0100-delivery-pipeline
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug))
    .toBe('0100-delivery-pipeline');

  // Step 1: Toggle to show-all
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(false);

  // 0100 still expanded — file entries visible
  const entries = panel.locator('[data-testid="file-entry"]');
  expect(await entries.count()).toBeGreaterThan(0);

  // Step 2: Click 0200 → focus follows
  await focusNapkinCard(panel, 'crust-validation');
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug))
    .toBe('0200-crust-validation');

  // Step 3: Toggle focus → only 0200
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.locator('[data-testid="napkin-card"]').count()).toBe(1);
  await expect(panel.locator('[data-testid="napkin-card"]')).toContainText('crust-validation');
  expect(await panel.locator('[data-testid="architect-card"]').count()).toBe(0);

  // Step 4: Toggle show-all → 0200 still focused
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug))
    .toBe('0200-crust-validation');

  // Step 5: Toggle focus → still 0200, NOT reset to 0100
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug))
    .toBe('0200-crust-validation');
  await expect(panel.locator('[data-testid="napkin-card"]')).toContainText('crust-validation');

  console.log('[FM-P03] PASS — focus follows clicks through toggles, not pinned to URL');
});

// ── FM-P04: Ctrl+Shift+F keyboard shortcut ──

test('FM-P04: Ctrl+Shift+F toggles focus mode', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Start in focus mode
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(true);

  // Ctrl+Shift+F → show-all
  await panel.keyboard.press('Control+Shift+F');
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(false);

  // Napkin cards visible (show-all)
  expect(await panel.locator('[data-testid="napkin-card"]').count()).toBeGreaterThanOrEqual(1);

  // Again → back to focus
  await panel.keyboard.press('Control+Shift+F');
  await panel.waitForTimeout(300);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(true);

  // Only one card in focus mode
  const total = (await panel.locator('[data-testid="napkin-card"]').count()) +
                (await panel.locator('[data-testid="architect-card"]').count());
  expect(total).toBe(1);

  console.log('[FM-P04] PASS — Ctrl+Shift+F toggles focus mode');
});

// ── FM-P05: focus mode persists across close/reopen ──

test('FM-P05: focus mode persists across close/reopen', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  await ensureFixtures(panel);

  // Set state: show-all + 0200 focused
  await panel.locator('[data-testid="focus-toggle-btn"]').click();
  await panel.waitForTimeout(300);
  await focusNapkinCard(panel, 'crust-validation');
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusMode)).toBe(false);
  expect(await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug))
    .toBe('0200-crust-validation');

  // Wait for persist flush
  await panel.waitForTimeout(1500);

  // ── Close + reopen ──
  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel2);

  // Wait for hydration + nav
  await panel2.waitForFunction(() => {
    const store = (window as any).__napStore__;
    if (!store) return false;
    const hydrated = store.persist?.hasHydrated?.() ?? false;
    return hydrated && store.getState().navSections.length > 0;
  }, { timeout: 15_000 });

  // Verify: show-all mode, 0200 focused
  const s1 = await panel2.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { focusMode: s.focusMode, slug: s.focusedCardSlug };
  });
  expect(s1.focusMode).toBe(false);
  expect(s1.slug).toBe('0200-crust-validation');

  // DOM: multiple cards (show-all)
  expect(await panel2.locator('[data-testid="napkin-card"]').count()).toBeGreaterThanOrEqual(2);

  // ── Toggle to focus, close, reopen ──
  await panel2.locator('[data-testid="focus-toggle-btn"]').click();
  await panel2.waitForTimeout(1500); // persist flush

  await panel2.close();
  await ghPage.waitForTimeout(2000);

  const panel3 = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel3);

  await panel3.waitForFunction(() => {
    const store = (window as any).__napStore__;
    if (!store) return false;
    const hydrated = store.persist?.hasHydrated?.() ?? false;
    return hydrated && store.getState().navSections.length > 0;
  }, { timeout: 15_000 });

  // Verify: focus mode on, 0200 still focused
  const s2 = await panel3.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { focusMode: s.focusMode, slug: s.focusedCardSlug };
  });
  expect(s2.focusMode).toBe(true);
  expect(s2.slug).toBe('0200-crust-validation');

  // DOM: only one card, it's 0200
  const totalCards = (await panel3.locator('[data-testid="napkin-card"]').count()) +
                     (await panel3.locator('[data-testid="architect-card"]').count());
  expect(totalCards).toBe(1);
  await expect(panel3.locator('[data-testid="napkin-card"]')).toContainText('crust-validation');

  console.log('[FM-P05] PASS — focusMode + focusedCardSlug persist across close/reopen');
});
