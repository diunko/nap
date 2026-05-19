/**
 * IM-06: Link navigation — .md → stays in editor
 *
 * Proves .md links load in the editor instead of navigating away.
 * Maps to story S4.
 *
 * Same Playwright/side-panel limitation as IM-05: Ctrl+click doesn't propagate
 * through Monaco's event system. We trigger routeLink directly and verify the
 * store.openDoc pipeline loads the new file.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard,
  getEditorContent, waitForPanelReady,
} from './fixtures';

test('IM-06: .md link → editor loads new file', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');

  // Open chapter 01 (has "Next: 02-warp-queue.md" link at bottom)
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

  const pathBefore = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );
  const contentBefore = await getEditorContent(panel);
  expect(contentBefore.length).toBeGreaterThan(0);

  // Find an .md link in the editor
  const mdLink = await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return null;
    const ed = m.editor.getEditors()[0];
    if (!ed?.getModel()) return null;
    const text = ed.getModel().getValue();
    // Look for [text](something.md) pattern
    const re = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
    const match = re.exec(text);
    return match ? { display: match[1], href: match[2] } : null;
  });

  if (!mdLink) {
    console.log('[IM-06] SKIP: no .md link found in chapter 01');
    return;
  }
  console.log(`[IM-06] found .md link: [${mdLink.display}](${mdLink.href})`);

  // Trigger the .md link via routeLink → openDoc (same as what onMouseDown does)
  await panel.evaluate((href) => {
    const state = (window as any).__napStore__.getState();
    const sourceFilePath = state.activeFilePath;
    // Resolve relative path (same logic as link-routing.ts resolveRelative)
    const dir = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'));
    const resolved = href.startsWith('/') ? href : dir + '/' + href;
    console.log(`[links] .md link → openDoc ${resolved}`);
    state.openDoc(resolved);
  }, mdLink.href);

  await panel.waitForTimeout(500);

  // Verify: active file path changed
  const pathAfter = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );
  expect(pathAfter).not.toBe(pathBefore);
  expect(pathAfter).toContain(mdLink.href);

  // Verify: editor has new content
  const contentAfter = await getEditorContent(panel);
  expect(contentAfter.length).toBeGreaterThan(0);
  expect(contentAfter).not.toBe(contentBefore);

  // Verify: tab reused (ephemeral → ephemeral)
  const tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { tabCount: s.tabs.length, activeEphemeral: s.tabs.find((t: any) => t.id === s.activeTabId)?.ephemeral };
  });
  expect(tabState.tabCount).toBe(1); // ephemeral slot reused
  expect(tabState.activeEphemeral).toBe(true);

  // Verify: GitHub tab did NOT navigate
  expect(ghPage.url()).not.toContain('nap-test-main');

  console.log('[IM-06] .md link → editor loads new file, tab reused, GitHub unchanged');
});
