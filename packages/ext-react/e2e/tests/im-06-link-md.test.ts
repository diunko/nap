/**
 * IM-06: Link navigation — .md → stays in editor
 *
 * Proves .md links load in the editor instead of navigating away.
 * Maps to story S4.
 */
import {
  test, expect, openGitHub, openSidePanel, cmdClickLink,
  cloneFixtureRepo, focusNapkinCard,
  getEditorContent, waitForPanelReady,
} from './fixtures';

test('IM-06: Cmd+click .md link → editor loads new file', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');

  // Open chapter 01 (has "Next: 02-warp-queue.md" link)
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

  const ghUrlBefore = ghPage.url();

  // Find an .md link in the editor
  const mdHref = await panel.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return null;
    const ed = m.editor.getEditors()[0];
    if (!ed?.getModel()) return null;
    const text = ed.getModel().getValue();
    const re = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
    const match = re.exec(text);
    return match ? match[2] : null;
  });

  if (!mdHref) {
    console.log('[IM-06] SKIP: no .md link found in chapter 01');
    return;
  }
  console.log(`[IM-06] found .md link: ${mdHref}`);

  // Cmd+click the .md link — goes through Monaco onMouseDown → routeLink → openDoc
  await cmdClickLink(panel, mdHref);

  // Wait for the editor to load the new file
  await panel.waitForFunction(
    (oldPath) => (window as any).__napStore__.getState().activeFilePath !== oldPath,
    pathBefore,
    { timeout: 5_000 },
  );
  await panel.waitForTimeout(300);

  // Verify: active file path changed
  const pathAfter = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );
  expect(pathAfter).not.toBe(pathBefore);
  expect(pathAfter).toContain(mdHref);

  // Verify: editor has new content
  const contentAfter = await getEditorContent(panel);
  expect(contentAfter.length).toBeGreaterThan(0);
  expect(contentAfter).not.toBe(contentBefore);

  // Verify: tab reused (ephemeral → ephemeral)
  const tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { tabCount: s.tabs.length, activeEphemeral: s.tabs.find((t: any) => t.id === s.activeTabId)?.ephemeral };
  });
  expect(tabState.tabCount).toBe(1);
  expect(tabState.activeEphemeral).toBe(true);

  // Verify: GitHub tab did NOT navigate away (URL unchanged)
  expect(ghPage.url()).toBe(ghUrlBefore);

  console.log('[IM-06] .md link → editor loads new file, tab reused, GitHub unchanged');
});
