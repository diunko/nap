/**
 * RS-P10..P13: Reset session + gate step Playwright tests.
 *
 * RS-P10: reset session — full cycle (settings button)
 * RS-P11: reset session preserves tokens (GitLab, VPN required)
 * RS-P12: __wipeCurrentSession__() from console
 * RS-P13: normal boot — gate step invisible
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

// GitLab fixture for RS-P11
let GITLAB_TOKEN = '';
try {
  const envContent = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  const match = envContent.match(/^GITLAB_API_TOKEN=(.+)$/m);
  if (match) GITLAB_TOKEN = match[1].trim();
} catch { /* .env not found */ }
const GITLAB_HASH = '#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_GITLAB_HASH = `https://github.com/diunko/nap-test-main${GITLAB_HASH}`;

// ── RS-P13: normal boot — gate step invisible ──

test('RS-P13: normal boot — gate step invisible, no [start] button', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Loading gate should appear during pipeline
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // No [start] button should ever appear — gate(true) auto-resolves
  const gateStart = panel.locator('[data-testid="gate-start"]');
  expect(await gateStart.count()).toBe(0);

  // Pipeline should complete normally
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  // Loading gate gone
  expect(await loadingGate.count()).toBe(0);

  // No gate-start in final DOM
  expect(await gateStart.count()).toBe(0);

  console.log('[RS-P13] PASS — normal boot: gate step invisible, no [start] button');
});

// ── RS-P10: reset session — full cycle ──

test('RS-P10: reset session — wipe → loading gate with [start] → click → fresh clone', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Verify nav populated (first visit)
  const cards = panel.locator('[data-testid="napkin-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 5_000 });
  console.log('[RS-P10] first visit: nav populated');

  // Open settings and click reset session
  const settingsBtn = panel.locator('[data-testid="header-bar"] span').last();
  // Use the gear icon to open settings
  await panel.evaluate(() => {
    (window as any).__napStore__.getState().toggleSettings();
  });
  await panel.waitForTimeout(500);

  const resetBtn = panel.locator('[data-testid="reset-session-btn"]');
  await expect(resetBtn).toBeVisible({ timeout: 3_000 });
  await resetBtn.click();
  console.log('[RS-P10] clicked reset session');

  // Loading gate should reappear
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // [start] button should appear (gate step with autoStart=false)
  const gateStart = panel.locator('[data-testid="gate-start"]');
  await expect(gateStart).toBeVisible({ timeout: 10_000 });
  console.log('[RS-P10] loading gate with [start] button visible');

  // Other steps should be pending
  const stepTexts = await panel.evaluate(() => {
    const steps = document.querySelectorAll('[data-testid^="pipeline-step-"]');
    return Array.from(steps).map((el) => el.textContent ?? '');
  });
  console.log('[RS-P10] step states:', stepTexts);

  // Click [start] → pipeline runs
  await gateStart.click();
  console.log('[RS-P10] clicked [start]');

  // Pipeline should complete — header-bar appears
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  // Loading gate gone
  expect(await loadingGate.count()).toBe(0);

  // Nav should be populated again (fresh clone)
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
    { timeout: 10_000 },
  );
  const cards2 = panel.locator('[data-testid="napkin-card"]');
  await expect(cards2.first()).toBeVisible({ timeout: 5_000 });

  console.log('[RS-P10] PASS — reset → [start] → fresh clone → nav populated');
});

// ── RS-P12: __wipeCurrentSession__() from console ──

test('RS-P12: __wipeCurrentSession__() — console API triggers reset', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Verify first visit complete
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 5_000 });

  // Call __wipeCurrentSession__() from console
  await panel.evaluate(() => {
    (window as any).__wipeCurrentSession__();
  });
  console.log('[RS-P12] called __wipeCurrentSession__()');

  // Loading gate should reappear with [start] button
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  const gateStart = panel.locator('[data-testid="gate-start"]');
  await expect(gateStart).toBeVisible({ timeout: 10_000 });
  console.log('[RS-P12] loading gate with [start] button visible');

  // Click [start] → pipeline runs → completes
  await gateStart.click();
  await expect(headerBar).toBeVisible({ timeout: 60_000 });
  expect(await loadingGate.count()).toBe(0);

  // Nav populated (fresh clone)
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
    { timeout: 10_000 },
  );

  console.log('[RS-P12] PASS — console wipe → [start] → fresh clone → nav populated');
});

// ── RS-P11: reset preserves tokens (VPN required) ──

test.describe('RS-P11: reset preserves tokens (VPN-required)', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  test('RS-P11: reset session — GitLab token survives in chrome.storage.sync', async ({ context, extensionId }) => {
    test.skip(!GITLAB_TOKEN, 'GITLAB_API_TOKEN not set in .env');
    test.setTimeout(180_000);

    // First visit: GitLab repo → enter token via inline form → clone succeeds
    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);

    // Wait for clone failure (no token)
    await panel.waitForFunction(
      () => {
        const gate = document.querySelector('[data-testid="loading-gate"]');
        return gate?.textContent?.includes('authentication failed') ?? false;
      },
      { timeout: 45_000 },
    );

    // Enter token via inline form
    const tokenInput = panel.locator('[data-testid="inline-token-input"]');
    await tokenInput.fill(GITLAB_TOKEN);
    await panel.locator('[data-testid="save-and-retry"]').click();

    // Wait for pipeline complete
    const headerBar = panel.locator('[data-testid="header-bar"]');
    await expect(headerBar).toBeVisible({ timeout: 60_000 });
    console.log('[RS-P11] first visit: token entered, clone succeeded');

    // Reset session
    await panel.evaluate(() => {
      (window as any).__wipeCurrentSession__();
    });
    console.log('[RS-P11] called __wipeCurrentSession__()');

    // Loading gate with [start] button
    const gateStart = panel.locator('[data-testid="gate-start"]');
    await expect(gateStart).toBeVisible({ timeout: 10_000 });

    // Click [start] → clone should succeed (token still in chrome.storage.sync)
    await gateStart.click();

    // Pipeline should complete WITHOUT auth failure (token persists globally)
    await expect(headerBar).toBeVisible({ timeout: 60_000 });

    // No inline token input (no auth error)
    const tokenInput2 = panel.locator('[data-testid="inline-token-input"]');
    expect(await tokenInput2.count()).toBe(0);

    // Nav populated
    await panel.waitForFunction(
      () => (window as any).__napStore__?.getState()?.navSections?.length > 0,
      { timeout: 10_000 },
    );

    console.log('[RS-P11] PASS — reset preserved token, fresh clone succeeded without auth prompt');
  });
});
