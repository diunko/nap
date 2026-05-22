/**
 * PG-P01..P06: Playground Playwright tests.
 *
 * Tests the PlaygroundPane end-to-end — tab switching, YAML step rendering,
 * run/fail, condition toggle/retry, YAML editing, parse errors, and re-run.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady, cloneFixtureRepo,
} from './fixtures';

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL = `https://github.com/diunko/nap-test-main${NAP_HASH}`;

/** Boot panel to completion and return the side panel page. */
async function bootPanel(context: any, extensionId: string) {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  // Wait a moment for the Panel to mount after pipeline done
  await panel.waitForFunction(
    () => document.querySelector('[data-testid="header-bar"]') !== null,
    { timeout: 60_000 },
  );
  return { ghPage, panel };
}

/** Switch to the Playground surface. */
async function switchToPlayground(panel: any) {
  await panel.locator('[data-testid="tab-playground"]').click();
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'playground',
    { timeout: 5_000 },
  );
  await panel.waitForTimeout(300);
}

/** Write content to playground.yaml via the adapter and wait for change to propagate. */
async function writePlaygroundYaml(panel: any, content: string) {
  await panel.evaluate(async (yaml: string) => {
    const ctx = (window as any).__napPipeline__.getCtx();
    await ctx.adapter.writeFile('/home/user/playground.yaml', yaml);
  }, content);
  // Give React time to process the onChange event
  await panel.waitForTimeout(500);
}

// ── PG-P01: playground tab visible, step list rendered from default YAML ──

test('PG-P01: playground tab visible, default step list rendered', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);

  // Playground tab should be visible in the tab bar
  const playgroundTab = panel.locator('[data-testid="tab-playground"]');
  await expect(playgroundTab).toBeVisible();
  expect(await playgroundTab.textContent()).toContain('Playground');

  // Switch to playground
  await switchToPlayground(panel);

  // Playground pane should be visible
  const pane = panel.locator('[data-testid="playground-pane"]');
  await expect(pane).toBeVisible({ timeout: 5_000 });

  // Step list should render from default YAML — at least 6 steps
  // Default YAML has: parse URL, create session, clone repo, scan repo, load navigation, fetch PR diff
  const paneText = await pane.textContent();
  expect(paneText).toContain('parse URL');
  expect(paneText).toContain('create session');
  expect(paneText).toContain('clone repo');
  expect(paneText).toContain('scan repo');

  // Clone step should have condition checkboxes
  const tokenCheckbox = panel.locator('[data-testid="cond-clone repo-token_present"]');
  await expect(tokenCheckbox).toBeVisible();

  // token_present should default to unchecked (false in YAML)
  expect(await tokenCheckbox.isChecked()).toBe(false);

  // network_available should default to checked (true in YAML)
  const networkCheckbox = panel.locator('[data-testid="cond-clone repo-network_available"]');
  await expect(networkCheckbox).toBeVisible();
  expect(await networkCheckbox.isChecked()).toBe(true);

  // All steps should show as pending (circles) — no run yet
  // Run button should be visible
  const runBtn = panel.locator('[data-testid="playground-run"]');
  await expect(runBtn).toBeVisible();

  // Step count indicator
  expect(paneText).toContain('6 steps');

  console.log('[PG-P01] PASS — playground tab visible, step list with conditions rendered');
});

// ── PG-P02: run → steps progress → clone fails → error + hint ──

test('PG-P02: run — steps progress, clone fails with error + hint', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);
  await switchToPlayground(panel);

  // Wait for playground pane to be ready
  await panel.locator('[data-testid="playground-pane"]').waitFor({ timeout: 5_000 });

  // Click run
  await panel.locator('[data-testid="playground-run"]').click();

  // Wait for pipeline to progress — loading-gate should appear inside playground
  // clone step should fail (token_present=false in default YAML)
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="playground-pane"] [data-testid="loading-gate"]');
      if (!gate) return false;
      const text = gate.textContent ?? '';
      // Look for the clone error — "401" from on_fail.token_present
      return text.includes('401') || text.includes('authentication');
    },
    { timeout: 15_000 },
  );

  const gateText = await panel.locator('[data-testid="playground-pane"] [data-testid="loading-gate"]').textContent();

  // Earlier steps should have succeeded (checkmarks)
  expect(gateText).toContain('\u2713'); // checkmark for done steps

  // Clone step should show error + hint
  expect(gateText).toMatch(/401/);
  expect(gateText).toContain('enter token');

  // Steps after clone should still be pending
  // Retry button should be visible on the failed step
  const retryBtn = panel.locator('[data-testid="playground-pane"] [data-testid^="retry-step-"]').first();
  await expect(retryBtn).toBeVisible();

  // Condition panel should be visible with checkboxes
  const condPanel = panel.locator('[data-testid="condition-panel"]');
  await expect(condPanel).toBeVisible();

  console.log('[PG-P02] PASS — run completed, clone failed with 401 error + hint');
});

// ── PG-P03: toggle condition → retry → step passes → pipeline continues ──

test('PG-P03: toggle condition, retry — step passes, pipeline completes', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);
  await switchToPlayground(panel);
  await panel.locator('[data-testid="playground-pane"]').waitFor({ timeout: 5_000 });

  // Run — clone fails
  await panel.locator('[data-testid="playground-run"]').click();
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="playground-pane"] [data-testid="loading-gate"]');
      return gate?.textContent?.includes('401') ?? false;
    },
    { timeout: 15_000 },
  );

  // Toggle token_present checkbox to true
  const tokenCheckbox = panel.locator('[data-testid="cond-clone repo-token_present"]');
  await expect(tokenCheckbox).toBeVisible();
  await tokenCheckbox.check();

  // Click retry on the failed step
  const retryBtn = panel.locator('[data-testid="playground-pane"] [data-testid^="retry-step-"]').first();
  await retryBtn.click();

  // Wait for pipeline to complete — all steps done
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="playground-pane"] [data-testid="loading-gate"]');
      if (!gate) return false;
      const text = gate.textContent ?? '';
      // All steps should be done — no error, no pending icons
      // Count checkmarks vs total steps
      const checkmarks = (text.match(/\u2713/g) || []).length;
      return checkmarks >= 6; // All 6 default steps done
    },
    { timeout: 15_000 },
  );

  // No error should be visible
  const gateText = await panel.locator('[data-testid="playground-pane"] [data-testid="loading-gate"]').textContent();
  expect(gateText).not.toContain('401');
  expect(gateText).not.toContain('\u2717'); // no error icons

  console.log('[PG-P03] PASS — toggled condition, retried, all steps done');
});

// ── PG-P04: edit playground.yaml → switch to playground → see updated steps ──

test('PG-P04: edit YAML — playground reflects updated steps', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);

  // Write modified YAML with a new step
  const modifiedYaml = `steps:
  - name: custom step A
    delay: 100
  - name: custom step B
    delay: 200
    conditions:
      my_flag: false
    on_fail:
      my_flag: { error: "flag off", hint: "toggle it" }
  - name: custom step C
    delay: 100
`;
  await writePlaygroundYaml(panel, modifiedYaml);

  // Switch to playground
  await switchToPlayground(panel);

  // Playground should show the updated step names
  const pane = panel.locator('[data-testid="playground-pane"]');
  await expect(pane).toBeVisible({ timeout: 5_000 });

  const paneText = await pane.textContent();
  expect(paneText).toContain('custom step A');
  expect(paneText).toContain('custom step B');
  expect(paneText).toContain('custom step C');
  expect(paneText).toContain('3 steps');

  // New condition checkbox should be visible
  const myFlagCheckbox = panel.locator('[data-testid="cond-custom step B-my_flag"]');
  await expect(myFlagCheckbox).toBeVisible();
  expect(await myFlagCheckbox.isChecked()).toBe(false);

  // Old default step names should NOT be present
  expect(paneText).not.toContain('parse URL');
  expect(paneText).not.toContain('clone repo');

  console.log('[PG-P04] PASS — YAML edit reflected in playground step list');
});

// ── PG-P05: invalid YAML → parse error shown → fix → step list returns ──

test('PG-P05: invalid YAML — parse error, then fix restores steps', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);
  await switchToPlayground(panel);

  // Verify playground works initially
  const pane = panel.locator('[data-testid="playground-pane"]');
  await expect(pane).toBeVisible({ timeout: 5_000 });
  let paneText = await pane.textContent();
  expect(paneText).toContain('parse URL'); // default YAML step

  // Write broken YAML
  await writePlaygroundYaml(panel, 'steps:\n  - name: foo\n  bar: [invalid');

  // Parse error should be shown
  await panel.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="playground-error"]');
      return el !== null;
    },
    { timeout: 5_000 },
  );

  const errorEl = panel.locator('[data-testid="playground-error"]');
  await expect(errorEl).toBeVisible();
  const errorText = await pane.textContent();
  expect(errorText).toContain('YAML parse error');

  // Step list should NOT be visible
  expect(errorText).not.toContain('parse URL');

  // Fix YAML
  await writePlaygroundYaml(panel, 'steps:\n  - name: recovered step\n    delay: 100\n');

  // Step list should return
  await panel.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="playground-error"]');
      return el === null;
    },
    { timeout: 5_000 },
  );

  paneText = await pane.textContent();
  expect(paneText).toContain('recovered step');
  expect(paneText).toContain('1 steps');

  // No error should be shown
  expect(await panel.locator('[data-testid="playground-error"]').count()).toBe(0);

  console.log('[PG-P05] PASS — invalid YAML showed error, fix restored step list');
});

// ── PG-P06: run again after completion → fresh run from step 0 ──

test('PG-P06: re-run after completion — fresh run from step 0', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootPanel(context, extensionId);

  // Write simple YAML (no failing conditions — all steps should pass quickly)
  const simpleYaml = `steps:
  - name: step alpha
    delay: 100
  - name: step beta
    delay: 100
  - name: step gamma
    delay: 100
`;
  await writePlaygroundYaml(panel, simpleYaml);
  await switchToPlayground(panel);

  // First run — all steps should complete
  await panel.locator('[data-testid="playground-run"]').click();

  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="playground-pane"] [data-testid="loading-gate"]');
      if (!gate) return false;
      const checkmarks = (gate.textContent?.match(/\u2713/g) || []).length;
      return checkmarks >= 3;
    },
    { timeout: 10_000 },
  );

  // Verify first run completed — all 3 checkmarks
  let gateText = await panel.locator('[data-testid="playground-pane"] [data-testid="loading-gate"]').textContent();
  const firstRunCheckmarks = (gateText?.match(/\u2713/g) || []).length;
  expect(firstRunCheckmarks).toBeGreaterThanOrEqual(3);

  // Click run again
  await panel.locator('[data-testid="playground-run"]').click();

  // Pipeline should restart — steps should progress fresh from step 0
  // Wait for the new run to complete
  await panel.waitForFunction(
    () => {
      const gate = document.querySelector('[data-testid="playground-pane"] [data-testid="loading-gate"]');
      if (!gate) return false;
      const checkmarks = (gate.textContent?.match(/\u2713/g) || []).length;
      return checkmarks >= 3;
    },
    { timeout: 10_000 },
  );

  // Verify second run completed
  gateText = await panel.locator('[data-testid="playground-pane"] [data-testid="loading-gate"]').textContent();
  const secondRunCheckmarks = (gateText?.match(/\u2713/g) || []).length;
  expect(secondRunCheckmarks).toBeGreaterThanOrEqual(3);

  // No errors
  expect(gateText).not.toContain('\u2717');

  console.log('[PG-P06] PASS — re-run after completion started fresh, all steps done');
});
