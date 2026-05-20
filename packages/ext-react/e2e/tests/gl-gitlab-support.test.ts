/**
 * GL-M01..GL-M03: GitLab support Playwright tests.
 *
 * GL-M01: Clone from GitLab — inject token, clone from gitlab.grammarly.io.
 * GL-M02: GitHub regression — existing PB-P04/PB-P05 tests cover this (run separately).
 * GL-M03: GitLab token persistence — enter token, close panel, reopen, token survives.
 *
 * VPN required: GL-M01 and GL-M03 need network access to gitlab.grammarly.io.
 * Token source: GITLAB_API_TOKEN from .env at repo root.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady, switchToTerminal, typeInTerminal,
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

const GITLAB_CLONE_URL = 'https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap.git';
const GITLAB_HASH = '#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL_WITH_GITLAB_HASH = `https://github.com/diunko/nap-test-main${GITLAB_HASH}`;

const skipReason = !GITLAB_TOKEN
  ? 'GITLAB_API_TOKEN not set in .env'
  : undefined;

/**
 * Helper: inject GitLab token and ensure a successful clone from GitLab.
 *
 * Race condition: auto-clone fires when init + shell are ready, which may
 * happen before or after our token injection. We handle both:
 * - If token was set in time → auto-clone succeeds → nav populates
 * - If auto-clone ran without token → clone failed → we re-clone manually
 */
async function injectTokenAndClone(panel: import('@playwright/test').Page, token: string): Promise<void> {
  // Inject token immediately
  await panel.evaluate((t) => {
    (window as any).__napStore__.getState().setGitlabToken(t);
  }, token);

  // Give auto-clone 15 seconds to succeed (it's fast when token was injected in time)
  try {
    await panel.waitForFunction(
      () => (window as any).__napStore__.getState().navSections.length > 0,
      { timeout: 15_000 },
    );
    console.log('[gl-helper] auto-clone succeeded with injected token');
    return;
  } catch {
    // Auto-clone failed or is hung without token — fall through to manual clone
  }

  console.log('[gl-helper] auto-clone did not populate nav — re-cloning manually');

  // Switch to terminal and manually clone
  await switchToTerminal(panel);
  await panel.waitForTimeout(500);

  // Remove partially-created directory from the failed auto-clone
  await typeInTerminal(panel, 'rm -rf /home/user/nap-test-nap');
  await panel.waitForTimeout(1000);

  // Clone manually — token is now in the store, so getAuth will return it
  await typeInTerminal(panel, `git clone ${GITLAB_CLONE_URL}`);

  // Wait for nav to populate from the manual clone
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 60_000 },
  );
  console.log('[gl-helper] manual re-clone succeeded');
}

// ── GL-M: GitLab clone (VPN-required) ──

test.describe('GL-M: GitLab clone (VPN-required)', () => {
  test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io');

  if (skipReason) {
    console.log(`Skipping GitLab clone tests — ${skipReason}`);
  }

  // ── GL-M01: Clone from GitLab ──

  test('GL-M01: clone from GitLab — auto-clone with PAT, nav populates', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(90_000);

    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);
    await waitForPanelReady(panel);

    await injectTokenAndClone(panel, GITLAB_TOKEN);

    // Verify: napkin cards visible in sidebar
    const cards = panel.locator('[data-testid="napkin-card"]');
    expect(await cards.count()).toBeGreaterThan(0);

    // Verify: delivery-pipeline card visible
    const dpCard = cards.filter({ hasText: 'delivery-pipeline' }).first();
    await expect(dpCard).toBeVisible();

    // Verify: focused card matches napkin from hash (0100)
    const focusedSlug = await panel.evaluate(() =>
      (window as any).__napStore__.getState().focusedCardSlug,
    );
    expect(focusedSlug).toContain('0100');

    // Verify: session key contains 'gitlab' provider
    const sessionKey = await panel.evaluate(() => {
      const store = (window as any).__napStore__;
      return (store as any).persist?.getOptions?.()?.name ?? '';
    });
    expect(sessionKey).toContain('gitlab');

    console.log('[GL-M01] PASS — clone from GitLab, nav populated, napkin focused');
  });

  // ── GL-M03: GitLab token persistence across panel reopen ──

  test('GL-M03: GitLab token persistence — close panel, reopen, token survives', async ({ context, extensionId }) => {
    test.skip(!!skipReason, skipReason!);
    test.setTimeout(120_000);

    // First visit: open panel with GitLab hash
    const ghPage = await openGitHub(context, GITHUB_URL_WITH_GITLAB_HASH);
    const panel = await openSidePanel(context, ghPage, extensionId);
    await waitForPanelReady(panel);

    await injectTokenAndClone(panel, GITLAB_TOKEN);

    // Verify token is in the store
    const tokenBefore = await panel.evaluate(() =>
      (window as any).__napStore__.getState().gitlabToken,
    );
    expect(tokenBefore).toBeTruthy();

    // Wait for Zustand persist flush
    await panel.waitForTimeout(2000);

    // Close the panel
    await panel.close();
    await ghPage.waitForTimeout(2000);

    // Reopen the panel
    const panel2 = await openSidePanel(context, ghPage, extensionId);
    await waitForPanelReady(panel2);

    // Nav should populate from IDB scan (return visit — no re-clone needed)
    await panel2.waitForFunction(
      () => (window as any).__napStore__.getState().navSections.length > 0,
      { timeout: 15_000 },
    );

    // Verify: napkin cards visible (IDB persisted the clone)
    const cards = panel2.locator('[data-testid="napkin-card"]');
    expect(await cards.count()).toBeGreaterThan(0);

    // Verify: gitlabToken survived the panel reopen (persisted via Zustand)
    const tokenAfter = await panel2.evaluate(() =>
      (window as any).__napStore__.getState().gitlabToken,
    );
    expect(tokenAfter).toBeTruthy();

    // Verify: cloningStatus stays idle (no re-clone triggered)
    const cloningStatus = await panel2.evaluate(() =>
      (window as any).__napStore__.getState().cloningStatus,
    );
    expect(cloningStatus).toBe('idle');

    console.log('[GL-M03] PASS — GitLab token persists across panel close/reopen, IDB restore works');
  });
});
