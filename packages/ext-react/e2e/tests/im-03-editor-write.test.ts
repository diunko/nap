/**
 * IM-03: Push data flow — editor write → terminal sees
 *
 * Proves editor → auto-save → LFS → echo suppression works.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  getEditorContent, waitForPanelReady,
} from './fixtures';

test('IM-03: editor write → terminal sees (auto-save + echo suppression)', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);

  // Focus card and open a file
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Verify editor has content
  const initialContent = await getEditorContent(panel);
  expect(initialContent.length).toBeGreaterThan(0);

  // Type in the editor (real DOM input — drives pinActiveEphemeral + auto-save)
  await panel.locator('.monaco-editor').click();
  await panel.waitForTimeout(200);
  await panel.keyboard.type('//DU: fragile-im03');

  // Capture cursor position immediately after typing (before auto-save fires)
  const cursorAfterType = await panel.evaluate(() => {
    const ed = (window as any).__monaco__.editor.getEditors()[0];
    return ed?.getPosition();
  });
  expect(cursorAfterType).toBeTruthy();

  // Verify tab is pinned (ephemeral → permanent on edit)
  await panel.waitForFunction(() => {
    const s = (window as any).__napStore__.getState();
    const tab = s.tabs.find((t: any) => t.id === s.activeTabId);
    return tab && !tab.ephemeral;
  }, { timeout: 5_000 });

  // Wait for auto-save (1s debounce) + echo suppression window (500ms) + buffer
  await panel.waitForTimeout(2500);

  // Echo suppression check: cursor should NOT have jumped
  const cursorAfterSave = await panel.evaluate(() => {
    const ed = (window as any).__monaco__.editor.getEditors()[0];
    return ed?.getPosition();
  });
  expect(cursorAfterSave?.lineNumber).toBe(cursorAfterType.lineNumber);
  expect(cursorAfterSave?.column).toBe(cursorAfterType.column);

  // Verify content persists in LFS: close tab (Cmd+W) and reopen from nav
  await panel.keyboard.press('Meta+w');
  await panel.waitForTimeout(500);

  // Reopen the same file
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');
  const reopenedContent = await getEditorContent(panel);
  expect(reopenedContent).toContain('//DU: fragile-im03');

  console.log('[IM-03] editor write → auto-save → LFS. Echo suppressed. Tab pinned.');
});
