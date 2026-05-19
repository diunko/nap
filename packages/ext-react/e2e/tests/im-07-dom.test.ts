/**
 * IM-07-DOM: Reopen lifecycle — full DOM verification
 *
 * After close/reopen, every surface must be visually functional:
 * - Terminal: prompt visible, dark bg, commands execute with visible output
 * - Nav: napkin cards rendered, agent dots visible, status text correct
 * - Editor: click file → Monaco renders content with non-zero dimensions
 * - Tabs: restored tab visible with correct label
 * - Surface switching: both directions work, content preserved
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  switchToTerminal, typeInTerminal, waitForPanelReady,
} from './fixtures';

test('IM-07-DOM: reopen lifecycle — all surfaces render', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // ══════════════════════════════════════
  // First lifecycle: clone, set up state
  // ══════════════════════════════════════

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Wait for persist
  await panel.waitForTimeout(1500);

  // ══════════════════════════════════════
  // Close and reopen
  // ══════════════════════════════════════

  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel2);

  // Wait for nav to populate
  await panel2.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 15_000 },
  );

  // ══════════════════════════════════════
  // Terminal: prompt visible, usable
  // ══════════════════════════════════════

  const terminalSurface = panel2.locator('#terminal-surface');
  const editorSurface = panel2.locator('#editor-surface');
  const wterm = panel2.locator('.wterm');

  // After reopen, activeSurface may be 'editor' (persisted from previous session).
  // Switch to terminal to verify it works.
  await switchToTerminal(panel2);

  await expect(terminalSurface).toHaveCSS('visibility', 'visible');
  // Dark background
  const termBg = await terminalSurface.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(termBg).toContain('30, 30, 30');

  // wterm container must have real dimensions (not zero-height black box)
  const wtermBox = await wterm.boundingBox();
  expect(wtermBox).toBeTruthy();
  expect(wtermBox!.width).toBeGreaterThan(50);
  expect(wtermBox!.height).toBeGreaterThan(50);

  // Prompt must be visible on screen — not just in the DOM tree.
  // toContainText checks DOM text. toBeVisible checks the element is in viewport
  // and not hidden. Together with the bounding box check above, this covers:
  // dimensions > 0, element visible, text present.
  await expect(wterm).toBeVisible();
  await expect(wterm).toContainText('$', { timeout: 10_000 });

  // Extra: verify the prompt is within the rendered area by checking that
  // wterm's scrollTop is 0 (prompt at the top, not scrolled out of view)
  const wtermScrolled = await wterm.evaluate(el => el.scrollTop);
  expect(wtermScrolled).toBe(0);

  // Terminal must be usable — type a command, see output
  await typeInTerminal(panel2, 'ls /home/user');
  await expect(wterm).toContainText('nap-test-nap', { timeout: 5_000 });

  console.log(`[IM-07-DOM] terminal: ${wtermBox!.width}x${wtermBox!.height}px, prompt visible, command executed ✓`);

  // ══════════════════════════════════════
  // Nav: cards, agents, status
  // ══════════════════════════════════════

  const cards = panel2.locator('[data-testid="napkin-card"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(1);

  const deliveryCard = cards.filter({ hasText: 'delivery-pipeline' }).first();
  await expect(deliveryCard).toContainText('doing');

  // Focus card to see agents
  await deliveryCard.click();
  await panel2.waitForTimeout(300);

  // Agent dots visible
  const agentDots = panel2.locator('[data-testid="agent-dot"]');
  expect(await agentDots.count()).toBeGreaterThanOrEqual(3);

  // File entries visible
  const fileEntries = panel2.locator('[data-testid="file-entry"]');
  expect(await fileEntries.count()).toBeGreaterThan(0);

  console.log('[IM-07-DOM] nav: cards, agents, files all rendered ✓');

  // ══════════════════════════════════════
  // Editor: click file → content renders
  // ══════════════════════════════════════

  await clickFileInNav(panel2, '0100-delivery-pipeline.nap.md');

  await expect(editorSurface).toHaveCSS('visibility', 'visible');

  // Monaco must have real dimensions
  const monacoBox = await panel2.locator('.monaco-editor').boundingBox();
  expect(monacoBox).toBeTruthy();
  expect(monacoBox!.width).toBeGreaterThan(50);
  expect(monacoBox!.height).toBeGreaterThan(50);

  // Content must be rendered in DOM
  const viewLines = panel2.locator('.monaco-editor .view-lines');
  await expect(viewLines).toContainText('delivery pipeline', { timeout: 5_000 });

  // Tab must be visible
  const fileTab = panel2.locator('[data-testid^="tab-tab"]').first();
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toContainText('.nap.md');

  console.log('[IM-07-DOM] editor: Monaco renders content with real dimensions ✓');

  // ══════════════════════════════════════
  // Surface switching: editor → terminal → editor
  // ══════════════════════════════════════

  await switchToTerminal(panel2);
  await expect(terminalSurface).toHaveCSS('visibility', 'visible');
  await expect(editorSurface).toHaveCSS('visibility', 'hidden');

  // Back to editor
  await fileTab.click();
  await panel2.waitForTimeout(300);
  await expect(editorSurface).toHaveCSS('visibility', 'visible');

  // Editor content still there
  await expect(viewLines).toContainText('delivery pipeline', { timeout: 3_000 });

  console.log('[IM-07-DOM] surface switching works after reopen ✓');
  console.log('[IM-07-DOM] full reopen lifecycle — all surfaces verified via DOM');
});
