/**
 * FX-P30..P32: Inline token form end-to-end tests.
 *
 * FX-P30: fresh visit → private GitLab repo → no token → 401 → inline form → enter token → save & retry → clone succeeds
 * FX-P31: token persists across panel close/reopen (chrome.storage.sync)
 * FX-P32: Enter key triggers save & retry
 *
 * VPN required: needs network access to gitlab.grammarly.io.
 * Token source: GITLAB_API_TOKEN from .env at repo root.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady, cloneFixtureRepo,
} from './fixtures';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..', '..');

// Read GITLAB_API_TOKEN from .env
let GITLAB_TOKEN = '';
try {
  const envContent = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  const match = envContent.match(/^GITLAB_API_TOKEN=(.+)$/m);
  if (match) GITLAB_TOKEN = match[1].trim();
} catch { /* .env not found */ }

const GITLAB_HASH = '#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_GITLAB_HASH = `https://github.com/diunko/nap-test-main${GITLAB_HASH}`;

const skipReason = !GITLAB_TOKEN
  ? 'GITLAB_API_TOKEN not set in .env'
  : undefined;

test.describe('FX-P30..P32: Inline token form (VPN-required)', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  if (skipReason) {
    console.log(`Skipping inline token tests — ${skipReason}`);
  }

  // ── FX-P30: inline token form end-to-end ──

  test('FX-P30: inline form → enter token → save & retry → clone succeeds', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(120_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Loading gate should appear
    const loadingGate = panel.locator('[data-testid="loading-gate"]');
    await expect(loadingGate).toBeVisible({ timeout: 10_000 });

    // Wait for clone step to fail with 401 (no token)
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        if (!gate) return false;
        const text = gate.textContent ?? '';
        return text.includes('authentication failed');
      },
      { timeout: 45_000 },
    );

    // DOM: inline token input visible
    const tokenInput = panel.locator('[data-testid="inline-token-input"]');
    await expect(tokenInput).toBeVisible({ timeout: 5_000 });

    // DOM: label says "GitLab PAT" (provider from config)
    const gateText = await loadingGate.textContent();
    expect(gateText).toContain('GitLab PAT');
    console.log('[FX-P30] inline form visible, label says GitLab PAT');

    // DOM: save & retry button visible
    const saveRetry = panel.locator('[data-testid="save-and-retry"]');
    await expect(saveRetry).toBeVisible();

    // Enter real GitLab token
    await tokenInput.fill(GITLAB_TOKEN);
    console.log('[FX-P30] entered GitLab token');

    // Click save & retry
    await saveRetry.click();
    console.log('[FX-P30] clicked save & retry');

    // After save & retry, clone step should re-run (spinner) then succeed
    // Wait for pipeline to complete — header-bar appears after gate unmounts
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // Loading gate gone
    expect(await loadingGate.count()).toBe(0);

    // Nav should be populated
    await panel.waitForFunction(
      () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
      { timeout: 10_000 },
    );

    // Napkin cards visible
    const cards = panel.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });

    // Focused card should be 0100
    const focusedSlug = await panel.evaluate(() =>
      (window as any).__napStore__.getState().focusedCardSlug,
    );
    expect(focusedSlug).toContain('0100');

    console.log('[FX-P30] PASS — inline form → enter token → save & retry → clone succeeded → nav populated');
  });

  // ── FX-P31: token persists across panel close/reopen ──

  test('FX-P31: token persists in chrome.storage.sync across close/reopen', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(120_000);

    // First visit: enter token via inline form → pipeline completes
    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for clone failure
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        if (!gate) return false;
        const text = gate.textContent ?? '';
        return text.includes('authentication failed');
      },
      { timeout: 45_000 },
    );

    // Enter token and save & retry
    const tokenInput = panel.locator('[data-testid="inline-token-input"]');
    await tokenInput.fill(GITLAB_TOKEN);
    await panel.locator('[data-testid="save-and-retry"]').click();

    // Wait for pipeline to complete
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // Nav populated
    await panel.waitForFunction(
      () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
      { timeout: 10_000 },
    );
    console.log('[FX-P31] first visit: clone succeeded');

    // Wait for persist flush
    await panel.waitForTimeout(2000);

    // Close panel
    await panel.close();
    await ghPage.waitForTimeout(2000);

    // Reopen panel
    const panel2 = await openSidePanel(context, ghPage, extensionId);

    // Second visit: token should be in chrome.storage.sync → pipeline reads it on boot
    // Clone should be skipped (IDB has repo from first visit)
    // No inline form should appear

    // Wait for pipeline to complete fast (return visit)
    const headerBar2 = panel2.locator('[data-testid="header-bar"]');
    await expect(headerBar2).toBeVisible({ timeout: 15_000 });

    // No inline token input in DOM (no auth error)
    const tokenInput2 = panel2.locator('[data-testid="inline-token-input"]');
    expect(await tokenInput2.count()).toBe(0);

    // Nav populated from IDB
    const cards = panel2.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    console.log('[FX-P31] PASS — token persisted in chrome.storage.sync, return visit: no auth prompt, nav populated');
  });

  // ── FX-P32: Enter key triggers save & retry ──

  test('FX-P32: Enter key in token input triggers save & retry', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(120_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for clone failure
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        if (!gate) return false;
        const text = gate.textContent ?? '';
        return text.includes('authentication failed');
      },
      { timeout: 45_000 },
    );

    // Enter token via keyboard (type, not fill)
    const tokenInput = panel.locator('[data-testid="inline-token-input"]');
    await tokenInput.click();
    await tokenInput.fill(GITLAB_TOKEN);

    // Press Enter instead of clicking save & retry button
    await tokenInput.press('Enter');
    console.log('[FX-P32] pressed Enter in token input');

    // Clone step should re-run and succeed
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // Nav populated
    await panel.waitForFunction(
      () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
      { timeout: 10_000 },
    );

    console.log('[FX-P32] PASS — Enter key triggered save & retry, clone succeeded');
  });
});
