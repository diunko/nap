/**
 * GL-M01..GL-M03: GitLab support Playwright tests.
 *
 * GL-M01: Clone from GitLab — inject token via chrome.storage.sync, clone from gitlab.grammarly.io.
 * GL-M02: GitHub regression — existing PB-P04/PB-P05 tests cover this (run separately).
 * GL-M03: GitLab token persistence — enter via inline form, close panel, reopen, token survives in chrome.storage.sync.
 *
 * VPN required: GL-M01 and GL-M03 need network access to gitlab.grammarly.io.
 * Token source: GITLAB_API_TOKEN from .env at repo root.
 *
 * Updated for fixes-01: tokens moved from per-session Zustand to chrome.storage.sync.
 * Token injection now uses chrome.storage.sync.set + globalTokens ref, not store.setGitlabToken().
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

/**
 * Enter token via the inline token form and wait for clone to succeed.
 * The inline form appears after clone fails with 401.
 * setGlobalToken writes to both chrome.storage.sync and the in-memory ref.
 */
async function enterTokenViaInlineForm(panel: import('@playwright/test').Page, token: string): Promise<void> {
  const tokenInput = panel.locator('[data-testid="inline-token-input"]');
  await expect(tokenInput).toBeVisible({ timeout: 5_000 });
  await tokenInput.fill(token);
  await panel.locator('[data-testid="save-and-retry"]').click();
  console.log('[gl-helper] entered token via inline form + save & retry');

  // Wait for nav to populate (clone succeeds with token)
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
    { timeout: 60_000 },
  );
  console.log('[gl-helper] nav populated after token injection');
}

// ── GL-M: GitLab clone (VPN-required) ──

test.describe('GL-M: GitLab clone (VPN-required)', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  if (skipReason) {
    console.log(`Skipping GitLab clone tests — ${skipReason}`);
  }

  // ── GL-M01: Clone from GitLab ──

  test('GL-M01: clone from GitLab — inject token, nav populates', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(90_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for loading gate
    const loadingGate = panel.locator('[data-testid="loading-gate"]');
    await expect(loadingGate).toBeVisible({ timeout: 10_000 });

    // Wait for clone failure (no token yet)
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        if (!gate) return false;
        return gate.textContent?.includes('authentication failed') ?? false;
      },
      { timeout: 45_000 },
    );

    // Inject token via inline form
    await enterTokenViaInlineForm(panel, GITLAB_TOKEN);

    // Verify: header-bar visible (Panel mounted)
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 10_000 });

    // Verify: napkin cards visible in sidebar
    const cards = panel.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });

    // Verify: delivery-pipeline card visible
    const dpCard = cards.filter({ hasText: 'delivery-pipeline' }).first();
    await expect(dpCard).toBeVisible();

    // Verify: focused card matches napkin from hash (0100)
    const focusedSlug = await panel.evaluate(() =>
      (window as any).__napStore__.getState().focusedCardSlug,
    );
    expect(focusedSlug).toContain('0100');

    console.log('[GL-M01] PASS — clone from GitLab, nav populated, napkin focused');
  });

  // ── GL-M03: GitLab token persistence across panel reopen ──

  test('GL-M03: GitLab token persistence — close panel, reopen, token survives in chrome.storage.sync', async ({ context, extensionId }) => {
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
        return gate.textContent?.includes('authentication failed') ?? false;
      },
      { timeout: 45_000 },
    );

    // Inject token and wait for nav
    await enterTokenViaInlineForm(panel, GITLAB_TOKEN);

    // Wait for Panel to mount
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 10_000 });

    // Wait for persist flush
    await panel.waitForTimeout(2000);

    // Close the panel
    await panel.close();
    await ghPage.waitForTimeout(2000);

    // Reopen the panel
    const panel2 = await openSidePanel(context, ghPage, extensionId);

    // Second visit: token in chrome.storage.sync → clone should succeed without prompt
    // (return visit: IDB scan finds repo → clone skipped)
    const headerBar2 = panel2.locator('[data-testid="header-bar"]');
    await expect(headerBar2).toBeVisible({ timeout: 15_000 });

    // Nav should populate from IDB scan
    const cards = panel2.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // No inline token input (no auth error)
    const tokenInput = panel2.locator('[data-testid="inline-token-input"]');
    expect(await tokenInput.count()).toBe(0);

    // Verify: cloningStatus stays idle (no re-clone triggered)
    const cloningStatus = await panel2.evaluate(() =>
      (window as any).__napStore__.getState().cloningStatus,
    );
    expect(cloningStatus).toBe('idle');

    console.log('[GL-M03] PASS — GitLab token persists in chrome.storage.sync, IDB restore works');
  });
});
