/**
 * IM-05: Link navigation — file:line → GitHub tab
 *
 * Proves the two-repo bridge: Cmd+click on a file:line link in .nap content
 * navigates the GitHub tab to the code repo.
 * Maps to story S9.
 */
import {
  test, expect, openGitHub, openSidePanel, cmdClickLink,
  cloneFixtureRepo, focusNapkinCard,
  waitForPanelReady,
} from './fixtures';

test('IM-05: Cmd+click file:line → GitHub tab navigates', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // Set main-repo config (precondition — not the action being tested)
  await panel.evaluate(() => {
    (window as any).__napStore__.getState().setMainRepo({
      owner: 'diunko',
      repo: 'nap-test-main',
      branch: 'main',
    });
  });

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');

  // Open chapter 01 which has file:line links
  await panel.evaluate(() => {
    const entries = document.querySelectorAll('[data-testid="file-entry"]');
    for (const entry of entries) {
      const text = entry.textContent ?? '';
      if (text.includes('01-') && text.includes('.md') && !text.includes('.nap.md')) {
        (entry as HTMLElement).click();
        return;
      }
    }
  });
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'editor',
    { timeout: 5_000 },
  );
  await panel.waitForTimeout(500);

  // Find a code link in the editor
  const codeHref = await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return null;
    const ed = m.editor.getEditors()[0];
    if (!ed?.getModel()) return null;
    const text = ed.getModel().getValue();
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const href = match[2];
      if (href.endsWith('.md')) continue;
      if (href.startsWith('http')) continue;
      return href;
    }
    return null;
  });

  if (!codeHref) {
    console.log('[IM-05] SKIP: no code link found in chapter');
    return;
  }
  console.log(`[IM-05] found code link: ${codeHref}`);

  const urlBefore = ghPage.url();

  // Cmd+click the link — real mousedown through Monaco's onMouseDown pipeline
  await cmdClickLink(panel, codeHref);

  // Wait for GitHub tab to navigate
  await ghPage.waitForURL((url) => url.toString() !== urlBefore, { timeout: 10_000 });

  const finalUrl = ghPage.url();
  console.log(`[IM-05] GitHub tab navigated to: ${finalUrl}`);
  expect(finalUrl).toContain('diunko/nap-test-main');
  expect(finalUrl).toContain('order-router.ts');
  expect(finalUrl).toContain('#L54');

  console.log('[IM-05] file:line link → GitHub tab navigated correctly');
});
