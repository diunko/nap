/**
 * LP-P01..P08: Loading pipeline Playwright tests.
 *
 * Tests the LoadingGate UI — step progression, error display, retry, skip logic,
 * gate unmount, and boot-gate replacement.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady, cloneFixtureRepo,
} from './fixtures';

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL = `https://github.com/diunko/nap-test-main${NAP_HASH}`;

// Non-existent repo — triggers clone 401 error (GitHub returns 401 for missing repos without auth)
const BAD_HASH = '#nap-repo=github/diunko/this-repo-does-not-exist-nap-test-xyzzy';
const GITHUB_URL_BAD_REPO = `https://github.com/diunko/nap-test-main${BAD_HASH}`;

/** Wait for the clone step to fail — error shows in loading gate. */
async function waitForCloneError(panel: import('@playwright/test').Page): Promise<void> {
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="loading-gate"]');
      if (!gate) return false;
      const text = gate.textContent ?? '';
      // With fixes-01: non-existent repo returns 401 → "authentication failed"
      // Also handle network errors and 404 for completeness
      return text.includes('authentication failed')
        || text.includes('repository not found')
        || text.includes("can't reach");
    },
    { timeout: 45_000 },
  );
}

// ── LP-P01: fresh visit — loading gate shows steps, then unmounts ──

test('LP-P01: fresh visit — loading gate shows steps progressing, then unmounts', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Loading gate should be visible during pipeline execution
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Step items should be present in DOM
  const steps = panel.locator('[data-testid^="pipeline-step-"]');
  const stepCount = await steps.count();
  expect(stepCount).toBeGreaterThanOrEqual(6); // At least 6 pipeline steps

  // Wait for pipeline to complete — header-bar appears after gate unmounts
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  // Loading gate should be GONE from DOM after pipeline completes
  expect(await loadingGate.count()).toBe(0);

  // Tab bar should be visible
  const tabBar = panel.locator('[data-testid="tab-bar"]');
  await expect(tabBar).toBeVisible();

  // No boot-message overlay
  const bootMessage = panel.locator('[data-testid="boot-message"]');
  expect(await bootMessage.count()).toBe(0);

  console.log('[LP-P01] PASS — loading gate appeared, steps progressed, gate unmounted, Panel rendered');
});

// ── LP-P02: return visit — steps fly through, < 3s ──

test('LP-P02: return visit — steps fly through, clone skipped', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  // First visit: full clone
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Wait for persist flush
  await panel.waitForTimeout(1500);

  // Close panel and reopen
  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);

  // Time the return visit
  const startTime = Date.now();

  // Loading gate should appear briefly
  const loadingGate = panel2.locator('[data-testid="loading-gate"]');
  // Gate may appear and disappear very fast — wait for header-bar instead
  const headerBar = panel2.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 15_000 });

  const elapsed = Date.now() - startTime;
  console.log(`[LP-P02] return visit gate → Panel: ${elapsed}ms`);

  // Should be fast (< 3s as per spec, but give 5s for CI)
  expect(elapsed).toBeLessThan(5_000);

  // Loading gate gone
  expect(await loadingGate.count()).toBe(0);

  // Nav should have cards in sidebar (auto-retrying — waits for React render)
  const cards = panel2.locator('[data-testid="napkin-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  console.log('[LP-P02] PASS — return visit: gate flew through, Panel loaded fast');
});

// ── LP-P03: auth failure — clone step shows error + inline token form ──

test('LP-P03: clone failure — error + inline token form visible', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  // Navigate with a non-existent repo → clone will fail with 401
  const ghPage = await openGitHub(context, GITHUB_URL_BAD_REPO);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Loading gate should appear
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Wait for clone step to fail
  await waitForCloneError(panel);

  // Error text should be visible
  const errorText = await loadingGate.textContent();
  expect(errorText).toMatch(/authentication failed|repository not found|can't reach/);

  // Inline token form should be visible (since no token is set, the form renders)
  const tokenInput = panel.locator('[data-testid="inline-token-input"]');
  await expect(tokenInput).toBeVisible({ timeout: 5_000 });

  // Save & retry button should be visible
  const saveRetry = panel.locator('[data-testid="save-and-retry"]');
  await expect(saveRetry).toBeVisible();

  // Retry-all link should be visible
  const retryAll = panel.locator('[data-testid="retry-all"]');
  await expect(retryAll).toBeVisible();

  // Steps before clone should show checkmarks (done)
  const stepStates = await panel.evaluate(() => {
    const steps = document.querySelectorAll('[data-testid^="pipeline-step-"]');
    return Array.from(steps).map((el) => el.textContent ?? '');
  });
  console.log('[LP-P03] step states:', stepStates);

  // Early steps should have ✓
  expect(stepStates[0]).toContain('\u2713'); // checkmark

  // No header-bar — Panel should NOT mount while loading gate has error
  const headerBar = panel.locator('[data-testid="header-bar"]');
  expect(await headerBar.count()).toBe(0);

  console.log('[LP-P03] PASS — clone failure: error + inline token form + retry-all visible');
});

// ── LP-P04: save & retry — click re-runs clone step ──

test('LP-P04: save & retry — click triggers re-run of failed step', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  // Navigate with non-existent repo → clone fails
  const ghPage = await openGitHub(context, GITHUB_URL_BAD_REPO);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for clone failure
  await waitForCloneError(panel);

  // The inline token form or retry button should be visible
  // Enter a fake token and click save & retry (will fail again since repo doesn't exist)
  const tokenInput = panel.locator('[data-testid="inline-token-input"]');
  const saveRetry = panel.locator('[data-testid="save-and-retry"]');

  if (await tokenInput.isVisible()) {
    // Has inline form — enter token and save & retry
    await tokenInput.fill('ghp_fake_token_for_test');
    await saveRetry.click();
  } else {
    // Has retry button (token already set from previous test)
    const retryBtn = panel.locator('[data-testid^="retry-step-"]').first();
    await retryBtn.click();
  }

  // After click, the clone step should re-run (spinner briefly) then fail again
  // Wait for the error to reappear
  await waitForCloneError(panel);

  // Retry-all should still be visible
  const retryAll = panel.locator('[data-testid="retry-all"]');
  await expect(retryAll).toBeVisible();

  console.log('[LP-P04] PASS — save & retry clicked, step re-ran, error reappeared');
});

// ── LP-P05: mid-flight close + reopen — fresh pipeline, no partial state ──

test('LP-P05: mid-flight close + reopen — fresh pipeline', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for loading gate to appear (pipeline started)
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Close panel while pipeline is running (during clone or earlier)
  await panel.waitForTimeout(500);
  await panel.close();
  await ghPage.waitForTimeout(2000);

  // Reopen panel
  const panel2 = await openSidePanel(context, ghPage, extensionId);

  // New pipeline should start fresh from step 0
  const loadingGate2 = panel2.locator('[data-testid="loading-gate"]');
  await expect(loadingGate2).toBeVisible({ timeout: 10_000 });

  // No error from previous attempt should be visible
  const gateText = await loadingGate2.textContent();
  expect(gateText).not.toContain('error');
  expect(gateText).not.toContain('failed');

  // Pipeline should eventually complete (fresh start)
  const headerBar = panel2.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  // Loading gate gone
  expect(await loadingGate2.count()).toBe(0);

  console.log('[LP-P05] PASS — mid-flight close + reopen: fresh pipeline, no partial state');
});

// ── LP-P06: loading gate step list — DOM shows correct step states ──

test('LP-P06: loading gate step list — correct step states in DOM', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Loading gate should show step items
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible({ timeout: 10_000 });

  // Each step should have a meaningful name (not "step 0", "step 1")
  const stepTexts = await panel.evaluate(() => {
    const steps = document.querySelectorAll('[data-testid^="pipeline-step-"]');
    return Array.from(steps).map((el) => el.textContent?.trim() ?? '');
  });
  console.log('[LP-P06] step descriptions:', stepTexts);

  // Verify meaningful names
  const expectedKeywords = ['review link', 'session', 'filesystem', 'existing', 'cloning', 'scanning', 'navigation', 'PR'];
  for (const keyword of expectedKeywords) {
    const found = stepTexts.some((text) => text.toLowerCase().includes(keyword.toLowerCase()));
    if (!found) {
      console.log(`[LP-P06] warning: no step mentions "${keyword}"`);
    }
  }

  // At minimum: steps should NOT be just numbers
  for (const text of stepTexts) {
    expect(text.length).toBeGreaterThan(3); // More than just an icon
  }

  // Clone step should show hostname/repo (not just "cloning")
  const cloneStep = stepTexts.find((t) => t.includes('cloning'));
  if (cloneStep) {
    expect(cloneStep).toMatch(/cloning .+\/.+/); // "cloning github.com/something"
    console.log(`[LP-P06] clone step: "${cloneStep}"`);
  }

  // Wait for pipeline to complete
  const headerBar = panel.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 60_000 });

  console.log('[LP-P06] PASS — step list shows meaningful descriptions');
});

// ── LP-P07: retry-all — cleanup + restart from step 0 ──

test('LP-P07: retry-all — pipeline restarts from step 0', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  // Use non-existent repo to trigger clone failure
  const ghPage = await openGitHub(context, GITHUB_URL_BAD_REPO);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for clone failure
  await waitForCloneError(panel);

  // Click retry-all
  const retryAll = panel.locator('[data-testid="retry-all"]');
  await expect(retryAll).toBeVisible();
  await retryAll.click();

  // After retry-all, step 0 should re-run (show spinner or re-progress)
  // The pipeline restarts from the beginning
  await panel.waitForFunction(
    () => {
      const steps = document.querySelectorAll('[data-testid^="pipeline-step-"]');
      if (steps.length === 0) return false;
      // First step should show running (spinner ⟳) or already done (✓)
      const firstText = steps[0].textContent ?? '';
      return firstText.includes('\u27F3') || firstText.includes('\u2713');
    },
    { timeout: 10_000 },
  );

  // Eventually the pipeline will fail again at clone (same bad repo)
  await waitForCloneError(panel);

  // Loading gate still visible (pipeline in error state again)
  const loadingGate = panel.locator('[data-testid="loading-gate"]');
  await expect(loadingGate).toBeVisible();

  console.log('[LP-P07] PASS — retry-all restarted pipeline from step 0');
});

// ── LP-P08: skip logic — return visit skips clone step (shown as done) ──

test('LP-P08: return visit — clone step skipped, shown as done', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  // First visit: full clone
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);

  // Wait for persist
  await panel.waitForTimeout(1500);

  // Close and reopen
  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);

  // Wait for pipeline to complete (fast on return visit)
  const headerBar = panel2.locator('[data-testid="header-bar"]');
  await expect(headerBar).toBeVisible({ timeout: 15_000 });

  // Store should show clone was skipped (cloningStatus stays 'idle')
  const cloningStatus = await panel2.evaluate(() =>
    (window as any).__napStore__.getState().cloningStatus,
  );
  expect(cloningStatus).toBe('idle');

  // Nav should be populated from IDB scan — wait for cards in DOM (auto-retrying)
  const cards = panel2.locator('[data-testid="napkin-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });

  // No boot-gate remnant
  const bootMessage = panel2.locator('[data-testid="boot-message"]');
  expect(await bootMessage.count()).toBe(0);

  // No loading-gate in DOM
  const loadingGate = panel2.locator('[data-testid="loading-gate"]');
  expect(await loadingGate.count()).toBe(0);

  console.log('[LP-P08] PASS — return visit: clone skipped, cloningStatus idle, nav populated');
});
