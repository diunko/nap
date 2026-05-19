/**
 * IM-02-DOM: Push data flow — both directions, DOM-verified
 *
 * Direction 1: terminal write → editor renders the change
 * Direction 2: editor type → auto-save → filesystem has the edit
 *
 * Every assertion is against the real DOM or real terminal output,
 * not the Monaco model or the Zustand store. This test would have caught
 * the editor.layout() bug — Monaco had the data but painted nothing.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, switchToTerminal,
  typeInTerminal, waitForPanelReady,
} from './fixtures';

test('IM-02-DOM: terminal write → editor sees (DOM assertions)', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);

  // ── Nav rendered in DOM ──
  const cardCount = await panel.locator('[data-testid="napkin-card"]').count();
  expect(cardCount).toBeGreaterThanOrEqual(1);

  // ── Focus card — body expands, files visible ──
  await focusNapkinCard(panel, 'delivery-pipeline');
  const fileEntries = panel.locator('[data-testid="file-entry"]');
  expect(await fileEntries.count()).toBeGreaterThan(0);

  // ── Click file — verify editor surface is visible and has rendered lines ──
  const napMdEntry = fileEntries.filter({ hasText: '0100-delivery-pipeline.nap.md' }).first();
  await napMdEntry.click();
  await panel.waitForTimeout(500);

  // Editor surface must be visible (not hidden)
  const editorSurface = panel.locator('#editor-surface');
  await expect(editorSurface).toHaveCSS('visibility', 'visible');

  // Monaco container must have non-zero dimensions
  const monacoBox = await panel.locator('.monaco-editor').boundingBox();
  expect(monacoBox).toBeTruthy();
  expect(monacoBox!.width).toBeGreaterThan(50);
  expect(monacoBox!.height).toBeGreaterThan(50);

  // View-lines must exist and have non-zero height (Monaco actually painted)
  const viewLines = panel.locator('.monaco-editor .view-lines');
  const vlBox = await viewLines.boundingBox();
  expect(vlBox).toBeTruthy();
  expect(vlBox!.height).toBeGreaterThan(0);

  // Actual rendered text must be visible in DOM — not just in the model.
  // Use Playwright's built-in text assertion which handles Monaco's token spans.
  await expect(viewLines).toContainText('warp gates', { timeout: 3_000 });

  // Tab must be visible with the right label
  const fileTab = panel.locator('[data-testid^="tab-tab"]').first();
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toContainText('0100-delivery-pipeline.nap.md');
  // Ephemeral tab renders italic
  await expect(fileTab).toHaveCSS('font-style', 'italic');

  // Get file path for the terminal echo command (reading store for construction)
  const filePath = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeFilePath,
  );

  // ── Switch to terminal — verify dark surface is visible ──
  await switchToTerminal(panel);

  const terminalSurface = panel.locator('#terminal-surface');
  await expect(terminalSurface).toHaveCSS('visibility', 'visible');
  // Editor surface should be hidden now
  await expect(editorSurface).toHaveCSS('visibility', 'hidden');

  // Terminal background is dark
  const termBg = await terminalSurface.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(termBg).toContain('30, 30, 30'); // #1e1e1e

  // ── Echo into the file ──
  await typeInTerminal(panel, `echo "// dom-test-im02" >> ${filePath}`);

  // Wait for model to pick up the change (debounce 200ms + readFile)
  await panel.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const ed = m.editor.getEditors()[0];
      return ed?.getModel()?.getValue()?.includes('// dom-test-im02') ?? false;
    },
    { timeout: 10_000 },
  );

  // ── Switch back to editor — this is when a human would look ──
  await fileTab.click();
  await panel.waitForTimeout(300);
  await expect(editorSurface).toHaveCSS('visibility', 'visible');

  // ── THE key DOM assertion: the injected text is visible in rendered view-lines ──
  // Monaco re-renders when the surface becomes visible. The text must appear
  // in the actual DOM, not just in the model.
  await expect(viewLines).toContainText('dom-test-im02', { timeout: 5_000 });

  // Monaco dimensions still valid after surface switch
  const monacoBoxAfter = await panel.locator('.monaco-editor').boundingBox();
  expect(monacoBoxAfter!.width).toBeGreaterThan(50);
  expect(monacoBoxAfter!.height).toBeGreaterThan(50);

  console.log('[IM-02-DOM] direction 1 pass — terminal write → editor renders');

  // ════════════════════════════════════════════════════════════════
  // Direction 2: editor type → auto-save → filesystem has the edit
  // ════════════════════════════════════════════════════════════════

  // ── Type in the editor (real keyboard input) ──
  await panel.locator('.monaco-editor').click();
  await panel.waitForTimeout(200);
  await panel.keyboard.type('//DU: dom-round-trip');

  // Tab must pin — italic → normal (DOM assertion)
  await expect(fileTab).toHaveCSS('font-style', 'normal', { timeout: 3_000 });

  // The typed text must be visible in the rendered DOM
  await expect(viewLines).toContainText('dom-round-trip', { timeout: 3_000 });

  // Wait for auto-save to flush (1s debounce + write)
  await panel.waitForTimeout(2000);

  // ── Switch to terminal and cat the file ──
  await switchToTerminal(panel);
  await expect(terminalSurface).toHaveCSS('visibility', 'visible');

  await typeInTerminal(panel, `cat ${filePath}`);
  // Wait for the cat output to appear in the terminal DOM
  await panel.waitForTimeout(1000);

  // The terminal (wterm) renders text content — verify the edit is on disk
  const wtermText = await panel.locator('.wterm').textContent();
  expect(wtermText).toContain('dom-round-trip');

  console.log('[IM-02-DOM] direction 2 pass — editor type → filesystem has the edit');

  // ════════════════════════════════════════════════════════════════
  // Direction 3: metadata write → sidebar re-renders
  // Change the napkin status from "doing" to "shipped" via terminal,
  // verify the sidebar card shows the new status.
  // ════════════════════════════════════════════════════════════════

  // The card currently shows "doing" in the sidebar
  const card = panel.locator('[data-testid="napkin-card"]').filter({ hasText: 'delivery-pipeline' }).first();
  await expect(card).toContainText('doing');

  // Overwrite .napkin.nap.json with a new status
  const napkinJsonPath = '/home/user/nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/.napkin.nap.json';
  await typeInTerminal(panel, `echo '{"status":"shipped"}' > ${napkinJsonPath}`);

  // The write triggers: adapter emit → model debounce → refreshNav →
  // parseNavTree reads the new JSON → store updates → sidebar re-renders.
  // Wait for the sidebar to show "shipped" instead of "doing".
  await expect(card).toContainText('shipped', { timeout: 5_000 });

  console.log('[IM-02-DOM] direction 3 pass — napkin metadata → sidebar shows "shipped"');

  // ════════════════════════════════════════════════════════════════
  // Direction 4: agent metadata write → agent status updates in DOM
  // Change an agent's started field from false to true,
  // verify the sidebar shows "run" instead of "done".
  // ════════════════════════════════════════════════════════════════

  // Expand the card to see agent rows (Cmd+E toggles focused → extended)
  await panel.keyboard.press('Meta+e');
  await panel.waitForTimeout(300);

  // Find the test-eng agent row — fixture has started=true, exited=false → "run"
  const agentRow = panel.locator('[data-testid="browser-agent"]').filter({ hasText: 'test-eng-routing' }).first();
  await expect(agentRow).toContainText('run', { timeout: 3_000 });

  // Overwrite .agent.nap.json to set exited=true → status should become "exited"
  const agentJsonPath = '/home/user/nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/agents/003-test-eng-routing/.agent.nap.json';
  await typeInTerminal(panel, `echo '{"role":"test-eng","name":"003-test-eng-routing","started":true,"exited":true}' > ${agentJsonPath}`);

  // Wait for the sidebar to show "exited" instead of "run"
  await expect(agentRow).toContainText('exited', { timeout: 5_000 });

  console.log('[IM-02-DOM] direction 4 pass — agent metadata → sidebar shows "exited"');
  console.log('[IM-02-DOM] all four directions verified via DOM');
});
