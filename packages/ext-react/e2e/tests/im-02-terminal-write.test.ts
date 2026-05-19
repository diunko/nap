/**
 * IM-02: Push data flow — terminal write → editor sees
 *
 * Proves adapter emitter → model → store → ContentPane re-render.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  getEditorContent, switchToTerminal, typeInTerminal, waitForPanelReady,
} from './fixtures';

test('IM-02: terminal write → editor sees', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // Clone fixture repo
  await cloneFixtureRepo(panel);

  // Focus napkin card and open a file
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Get the active file path (READING store for test construction, not driving)
  const filePath = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );
  expect(filePath).toBeTruthy();

  // Verify editor loaded content
  const initialContent = await getEditorContent(panel);
  expect(initialContent.length).toBeGreaterThan(0);

  // Switch to terminal and echo into the file
  await switchToTerminal(panel);
  await typeInTerminal(panel, `echo "// terminal-note-im02" >> ${filePath}`);

  // Wait for: echo completes → adapter emits → model debounce (200ms) → reloadFile
  // Then ContentPane handles the nap-external-change event
  await panel.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const ed = m.editor.getEditors()[0];
      if (!ed || !ed.getModel()) return false;
      return ed.getModel().getValue().includes('// terminal-note-im02');
    },
    { timeout: 10_000 },
  );

  const finalContent = await getEditorContent(panel);
  expect(finalContent).toContain('// terminal-note-im02');

  console.log('[IM-02] terminal write → editor sees — pipeline works');
});
