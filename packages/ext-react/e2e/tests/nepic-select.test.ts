/**
 * Nepic selection — when the URL points to a specific nepic (e.g. 03-features/0330-state-persistence),
 * the model must select that nepic, not the first one it finds (01-v1).
 *
 * Repros: panel opened with napkin=03-features/0330-state-persistence shows empty sidebar
 * because findNepicRoot returned /nepics/01-v1 which doesn't have that napkin.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady,
} from './fixtures';

/** URL targeting the 03-features nepic */
const FEATURES_URL = 'https://github.com/diunko/nap-test-main#nap-repo=github/diunko/nap-test-nap&napkin=03-features/0330-state-persistence';

/** URL targeting the 01-v1 nepic (existing default) */
const V1_URL = 'https://github.com/diunko/nap-test-main#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';

test('nepic-select: URL with 03-features nepic shows correct napkin', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context, FEATURES_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // Wait for clone + nav
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 45_000 },
  );

  // The focused card should be 0330-state-persistence, not anything from 01-v1
  const slug = await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug);
  expect(slug).toBe('0330-state-persistence');

  // DOM: the napkin card should be visible with "state-persistence" text
  const napCard = panel.locator('[data-testid="napkin-card"]');
  await expect(napCard).toContainText('state-persistence', { timeout: 5_000 });

  // Should NOT see 01-v1 napkins (delivery-pipeline, crust-validation)
  const allText = await panel.locator('[data-testid="sidebar"]').textContent();
  expect(allText).not.toContain('delivery-pipeline');
  expect(allText).not.toContain('crust-validation');

  console.log('[nepic-select] PASS — 03-features nepic selected, 0330-state-persistence focused');
});

test('nepic-select: URL with 01-v1 nepic still works (no regression)', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context, V1_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 45_000 },
  );

  const slug = await panel.evaluate(() => (window as any).__napStore__.getState().focusedCardSlug);
  expect(slug).toBe('0100-delivery-pipeline');

  const napCard = panel.locator('[data-testid="napkin-card"]');
  await expect(napCard).toContainText('delivery-pipeline', { timeout: 5_000 });

  // Should NOT see 03-features napkins
  const allText = await panel.locator('[data-testid="sidebar"]').textContent();
  expect(allText).not.toContain('state-persistence');

  console.log('[nepic-select] PASS — 01-v1 nepic selected, 0100-delivery-pipeline focused');
});
