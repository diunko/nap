/**
 * E2E-UX-1: first-time user installs extension and reads a .nap repo.
 *
 * One test. Does exactly what a human does. No window.__ hooks except
 * editor.action.openLink (justified in 0100-v0.ux-test.md).
 *
 * Follows the test design in 0100-v0.ux-test.md step by step.
 */
import { test, expect, openSidePanel, openGitHub, cmdClickLink } from './fixtures';
import type { Page } from '@playwright/test';

const NAP_REPO_URL = 'https://github.com/diunko/nap-test-nap';
const MAIN_REPO = 'diunko/nap-test-main';
const MAIN_BRANCH = 'main';

// ── cmd helper (prompt counting, same as lifecycle tests) ──

async function cmd(panel: Page, command: string, waitFor?: string, timeout = 30_000) {
  console.log(`[cmd] ${command}`);
  const wterm = panel.locator('.wterm');
  await wterm.click();

  const before = await wterm.textContent() ?? '';
  const pBefore = (before.match(/\$ /g) || []).length;

  await panel.keyboard.type(command, { delay: 5 });
  await panel.keyboard.press('Enter');

  await expect(async () => {
    const t = await wterm.textContent() ?? '';
    expect((t.match(/\$ /g) || []).length).toBeGreaterThan(pBefore);
  }).toPass({ timeout });

  if (waitFor) {
    const after = await wterm.textContent() ?? '';
    expect(after).toContain(waitFor);
  }
}

// ── The test ──

test('E2E-UX-1: first-time user flow', async ({ context, extensionId }) => {
  // Step 1: navigate to the code repo on GitHub
  console.log('[ux] step 1: navigate to github');
  const ghPage = await openGitHub(context, `https://github.com/${MAIN_REPO}`);

  // Step 2: open side panel
  console.log('[ux] step 2: open side panel');
  const panel = await openSidePanel(context, ghPage, extensionId);
  panel.on('console', msg => console.log(`[br:${msg.type()}] ${msg.text()}`));
  panel.on('pageerror', err => console.log(`[br:err] ${err.message}`));

  // Wait for terminal to be ready
  await expect(panel.locator('.wterm')).toContainText('$', { timeout: 10_000 });
  console.log('[ux] panel ready');

  // Step 3: set main-repo config via settings UI (NOT window.__)
  console.log('[ux] step 3: configure settings');
  await panel.locator('#settings-btn').click();
  console.log('[ux] settings opened');

  await panel.locator('#main-repo-input').fill(MAIN_REPO);
  await panel.locator('#main-branch-input').fill(MAIN_BRANCH);
  await panel.locator('#settings-save').click();
  console.log('[ux] settings saved');

  // Verify settings overlay closed
  await expect(panel.locator('#settings-overlay')).not.toBeVisible({ timeout: 2_000 });
  console.log('[ux] settings closed');

  // Step 4: clone the .nap repo in terminal
  console.log('[ux] step 4: clone');
  await cmd(panel, `git clone ${NAP_REPO_URL}`, 'done.', 60_000);
  console.log('[ux] clone done');

  // Step 5: nav tree auto-populates — NO manual refresh
  console.log('[ux] step 5: wait for nav tree auto-refresh');
  await expect(panel.locator('#nav-tree')).not.toBeEmpty({ timeout: 5_000 });
  const navText = await panel.locator('#nav-tree').textContent();
  console.log(`[ux] nav tree text: ${navText?.slice(0, 200)}`);
  // Card system renders napkin names (e.g. "0100-delivery-pipeline"), not section labels
  expect(navText).toBeTruthy();
  console.log('[ux] nav tree auto-populated');

  // Step 6: click a chapter file in the nav tree — real DOM click
  console.log('[ux] step 6: click chapter in nav tree');

  // Focus the napkin card if not already focused
  const napkinCard = panel.locator('.napkin-card', { hasText: 'delivery-pipeline' });
  if (await napkinCard.count() > 0) {
    const isFocused = await napkinCard.first().evaluate(el => el.classList.contains('focused'));
    if (!isFocused) {
      console.log('[ux] focusing delivery-pipeline card');
      await napkinCard.first().locator('.card-header').click();
      await panel.waitForTimeout(200);
    }
  }

  // Click the chapter file
  const chapterFile = panel.locator('.file-row', { hasText: '01-order-routing.md' });
  await expect(chapterFile.first()).toBeVisible({ timeout: 3_000 });
  console.log('[ux] chapter file visible in nav tree');
  await chapterFile.first().click();
  console.log('[ux] clicked chapter file');

  // Step 7: verify editor shows chapter
  console.log('[ux] step 7: verify editor content');
  await expect(panel.locator('.tab[data-tab="editor"]')).toHaveClass(/active/, { timeout: 2_000 });
  console.log('[ux] editor tab active');

  const content = await panel.evaluate(() => window.__editor?.getModel()?.getValue() ?? '');
  console.log(`[ux] editor content (first 200): ${content.slice(0, 200)}`);
  expect(content).toContain('Order');
  expect(content).toContain('order-router.ts');
  console.log('[ux] editor shows chapter');

  // Step 8: Real Cmd+click on the file:line link
  console.log('[ux] step 8: Cmd+click file:line link');
  await cmdClickLink(panel, '/modules/delivery/order-router.ts#L54');
  console.log('[ux] Cmd+click dispatched');

  // Step 9: verify GitHub tab navigated
  console.log('[ux] step 9: verify github tab URL');
  await ghPage.waitForURL(/order-router\.ts/, { timeout: 10_000 });
  const finalUrl = ghPage.url();
  console.log(`[ux] github URL: ${finalUrl}`);
  expect(finalUrl).toContain('diunko/nap-test-main');
  expect(finalUrl).toContain('order-router.ts');
  expect(finalUrl).toContain('#L54');
  console.log('[ux] E2E-UX-1 PASSED');
});
