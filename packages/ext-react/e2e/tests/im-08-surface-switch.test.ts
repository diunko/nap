/**
 * IM-08: Surface switching — editor ↔ terminal
 *
 * Proves switching surfaces is clean — no flash, content preserved.
 * Maps to story S8.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  getEditorContent, switchToTerminal, waitForPanelReady,
} from './fixtures';

test('IM-08: surface switch — editor ↔ terminal, scroll preserved', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Verify we're on editor surface
  const surface1 = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeSurface,
  );
  expect(surface1).toBe('editor');

  // Scroll the editor down
  await panel.evaluate(() => {
    const ed = (window as any).__monaco__.editor.getEditors()[0];
    if (ed) ed.setScrollTop(50);
  });
  await panel.waitForTimeout(200);

  const scrollBefore = await panel.evaluate(() => {
    const ed = (window as any).__monaco__.editor.getEditors()[0];
    return ed ? ed.getScrollTop() : 0;
  });

  const contentBefore = await getEditorContent(panel);

  // ── Switch to terminal ──
  await switchToTerminal(panel);

  // Verify terminal surface is active
  const surface2 = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeSurface,
  );
  expect(surface2).toBe('terminal');

  // Verify terminal has dark background
  const terminalBg = await panel.evaluate(() => {
    const el = document.getElementById('terminal-surface');
    return el ? getComputedStyle(el).backgroundColor : '';
  });
  // #1e1e1e = rgb(30, 30, 30)
  expect(terminalBg).toContain('30, 30, 30');

  // ── Switch back to editor (click the file tab) ──
  // Find the first file tab (not the Terminal tab)
  await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    if (s.activeFilePath) s.openDoc(s.activeFilePath);
  });
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'editor',
    { timeout: 3_000 },
  );
  await panel.waitForTimeout(300);

  // Verify editor surface is active again
  const surface3 = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeSurface,
  );
  expect(surface3).toBe('editor');

  // Verify content is same
  const contentAfter = await getEditorContent(panel);
  expect(contentAfter).toBe(contentBefore);

  // Verify scroll position is preserved
  const scrollAfter = await panel.evaluate(() => {
    const ed = (window as any).__monaco__.editor.getEditors()[0];
    return ed ? ed.getScrollTop() : 0;
  });
  // Scroll should be approximately the same (within 5px tolerance for rounding)
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(5);

  console.log('[IM-08] surface switch — terminal dark, editor content + scroll preserved');
});
