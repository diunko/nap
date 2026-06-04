/**
 * FX3-S10..S14, FX3-P01, FX3-P10: Settings during loading + GitLab error classification Playwright tests.
 *
 * FX3-S10: settings gear visible during loading gate
 * FX3-S11: settings gear visible when pipeline errored
 * FX3-S12: settings overlay opens during loading, tokens saveable
 * FX3-S13: opening settings doesn't interrupt pipeline
 * FX3-P01: GitLab 401 → inline form → enter token → clone succeeds (VPN required)
 * FX3-P10: full recovery path via settings gear (VPN required)
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

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL = `https://github.com/diunko/nap-test-main${NAP_HASH}`;

// Non-existent repo — triggers clone error
const BAD_HASH = '#nap-repo=github/diunko/this-repo-does-not-exist-nap-test-xyzzy';
const GITHUB_URL_BAD_REPO = `https://github.com/diunko/nap-test-main${BAD_HASH}`;

// GitLab fixture
let GITLAB_TOKEN = '';
try {
  const envContent = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  const match = envContent.match(/^GITLAB_API_TOKEN=(.+)$/m);
  if (match) GITLAB_TOKEN = match[1].trim();
} catch { /* .env not found */ }
const GITLAB_HASH = '#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_GITLAB_HASH = `https://github.com/diunko/nap-test-main${GITLAB_HASH}`;

// ── FX3-S10: settings gear visible during loading gate ──

test('FX3-S10: settings gear visible during loading gate', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Loading gate should appear
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Settings gear should be visible DURING loading
  const settingsGear = panel.locator('[data-testid="loading-gate-settings-gear"]');
  await expect(settingsGear).toBeVisible({ timeout: 5_000 });

  console.log('[FX3-S10] PASS — settings gear visible during loading');

  // Let pipeline finish to clean up
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });
});

// ── FX3-S11: settings gear visible when pipeline errored ──

test('FX3-S11: settings gear visible when pipeline errored', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  // Use bad repo to trigger error
  const ghPage = await openGitHub(context, GITHUB_URL_BAD_REPO);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for pipeline error
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="loading-gate"]');
      return gate?.textContent?.includes('authentication failed') ?? false;
    },
    { timeout: 45_000 },
  );

  // Settings gear still visible on error screen
  const settingsGear = panel.locator('[data-testid="loading-gate-settings-gear"]');
  await expect(settingsGear).toBeVisible();

  console.log('[FX3-S11] PASS — settings gear visible when pipeline errored');
});

// ── FX3-S12: settings overlay opens during loading, tokens saveable ──

test('FX3-S12: settings overlay opens during loading, tokens saveable', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for loading gate
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Click settings gear
  const settingsGear = panel.locator('[data-testid="loading-gate-settings-gear"]');
  await settingsGear.click();

  // Settings overlay should open
  const settingsOverlay = panel.locator('[data-testid="settings-overlay"]');
  await expect(settingsOverlay).toBeVisible({ timeout: 3_000 });

  // Token inputs should be functional
  const ghTokenInput = panel.locator('[data-testid="settings-github-token"]');
  await expect(ghTokenInput).toBeVisible();
  await ghTokenInput.fill('ghp_test_fx3s12');

  const glTokenInput = panel.locator('[data-testid="settings-gitlab-token"]');
  await expect(glTokenInput).toBeVisible();
  await glTokenInput.fill('glpat-test_fx3s12');

  // Debug mode checkbox should be present
  const debugCheckbox = panel.locator('[data-testid="settings-debug-mode"]');
  await expect(debugCheckbox).toBeVisible();

  // Save button should work
  const saveBtn = settingsOverlay.locator('button').filter({ hasText: 'Save' });
  await saveBtn.click();

  // Overlay should close
  await expect(settingsOverlay).not.toBeVisible({ timeout: 3_000 });

  console.log('[FX3-S12] PASS — settings overlay opened during loading, tokens saved');

  // Let pipeline finish
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });
});

// ── FX3-S13: opening settings doesn't interrupt pipeline ──

test('FX3-S13: opening settings does not interrupt pipeline', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for loading gate
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Open settings while pipeline is running
  const settingsGear = panel.locator('[data-testid="loading-gate-settings-gear"]');
  await settingsGear.click();

  const settingsOverlay = panel.locator('[data-testid="settings-overlay"]');
  await expect(settingsOverlay).toBeVisible({ timeout: 3_000 });

  // Wait a bit with settings open — pipeline should continue in background
  await panel.waitForTimeout(2000);

  // Close settings
  const closeBtn = settingsOverlay.locator('button').filter({ hasText: 'Close' });
  await closeBtn.click();
  await expect(settingsOverlay).not.toBeVisible({ timeout: 3_000 });

  // Pipeline should eventually complete (wasn't interrupted)
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  console.log('[FX3-S13] PASS — settings opened during pipeline, pipeline completed normally');
});

// ── FX3-P01: GitLab 401 → inline form → enter token → clone succeeds (VPN required) ──

test.describe('FX3-P01/P10: GitLab recovery (VPN-required)', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  test('FX3-P01: GitLab 401 → correct error → inline form → clone succeeds', async ({ context, extensionId }) => {
    test.skip(!GITLAB_TOKEN, 'GITLAB_API_TOKEN not set in .env');
    test.setTimeout(120_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for clone failure — should say "authentication failed" (not "can't reach")
    // With test manifest, GitLab host permission is granted → real 401 reaches the code
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        return gate?.textContent?.includes('authentication failed') ?? false;
      },
      { timeout: 45_000 },
    );

    const gateText = await panel.locator('[data-testid="loading-gate"]').textContent();
    // Should NOT say "can't reach" — that was the bug
    expect(gateText).toContain('authentication failed');
    expect(gateText).not.toContain("can't reach");
    console.log('[FX3-P01] error correctly classified as "authentication failed"');

    // Inline token form should be visible
    const tokenInput = panel.locator('[data-testid="inline-token-input"]');
    await expect(tokenInput).toBeVisible({ timeout: 5_000 });
    expect(gateText).toContain('GitLab PAT');

    // Enter token and save & retry
    await tokenInput.fill(GITLAB_TOKEN);
    await panel.locator('[data-testid="save-and-retry"]').click();

    // Pipeline should complete
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // Nav populated
    const cards = panel.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    console.log('[FX3-P01] PASS — GitLab 401 → inline form → token → clone succeeded');
  });

  // ── FX3-P10: full recovery via settings gear (alternative path) ──

  test('FX3-P10: GitLab 401 → settings gear → enter token → retry → clone succeeds', async ({ context, extensionId }) => {
    test.skip(!GITLAB_TOKEN, 'GITLAB_API_TOKEN not set in .env');
    test.setTimeout(120_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for clone failure
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        return gate?.textContent?.includes('authentication failed') ?? false;
      },
      { timeout: 45_000 },
    );

    // Settings gear should be visible
    const settingsGear = panel.locator('[data-testid="loading-gate-settings-gear"]');
    await expect(settingsGear).toBeVisible();

    // Open settings
    await settingsGear.click();
    const settingsOverlay = panel.locator('[data-testid="settings-overlay"]');
    await expect(settingsOverlay).toBeVisible({ timeout: 3_000 });

    // Enter GitLab token via settings
    const glTokenInput = panel.locator('[data-testid="settings-gitlab-token"]');
    await glTokenInput.fill(GITLAB_TOKEN);

    // Save and close
    const saveBtn = settingsOverlay.locator('button').filter({ hasText: 'Save' });
    await saveBtn.click();
    await expect(settingsOverlay).not.toBeVisible({ timeout: 3_000 });

    // Now retry the clone step via retry-all (since we used settings, not inline form)
    const retryAll = panel.locator('[data-testid="retry-all"]');
    await expect(retryAll).toBeVisible();
    await retryAll.click();

    // Pipeline should restart and clone should succeed with the new token
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // Nav populated
    const cards = panel.locator('[data-testid="napkin-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    console.log('[FX3-P10] PASS — settings gear → enter token → retry-all → clone succeeded');
  });
});
