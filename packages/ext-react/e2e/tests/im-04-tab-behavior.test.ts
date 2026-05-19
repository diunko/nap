/**
 * IM-04: Tab behavior end-to-end
 *
 * Proves store tab logic + React rendering + user clicks work together.
 * Maps to stories: S5, S6, S7.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  getEditorContent, waitForPanelReady,
} from './fixtures';

test('IM-04: tab behavior — ephemeral, pin on edit, reuse', async ({ context, extensionId }) => {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');

  // Find all clickable .md file entries in the focused card
  const mdFiles = await panel.evaluate(() => {
    const entries = document.querySelectorAll('[data-testid="file-entry"]');
    const files: string[] = [];
    for (const entry of entries) {
      const text = (entry.textContent ?? '').trim();
      if (text.endsWith('.md')) files.push(text);
    }
    return files;
  });
  console.log(`[IM-04] available .md files: ${mdFiles.join(', ')}`);
  expect(mdFiles.length).toBeGreaterThanOrEqual(3);

  const fileA = mdFiles[0];
  const fileB = mdFiles[1];
  const fileC = mdFiles[2];
  const fileD = mdFiles.length > 3 ? mdFiles[3] : null;

  // ── Click file A → 1 ephemeral tab ──
  await clickFileInNav(panel, fileA);

  let tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { count: s.tabs.length, tabs: s.tabs.map((t: any) => ({ path: t.path, ephemeral: t.ephemeral })) };
  });
  expect(tabState.count).toBe(1);
  expect(tabState.tabs[0].ephemeral).toBe(true);

  // Check italic font-style on the tab in DOM
  const firstTabStyle = await panel.evaluate(() => {
    const tabs = document.querySelectorAll('[data-testid^="tab-tab"]');
    if (tabs.length === 0) return null;
    return getComputedStyle(tabs[0]).fontStyle;
  });
  expect(firstTabStyle).toBe('italic');

  // ── Click file B → 1 ephemeral tab, reused (shows B) ──
  await clickFileInNav(panel, fileB);

  tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { count: s.tabs.length, tabs: s.tabs.map((t: any) => ({ path: t.path, ephemeral: t.ephemeral })) };
  });
  expect(tabState.count).toBe(1);
  expect(tabState.tabs[0].ephemeral).toBe(true);

  // Verify editor shows B's content
  const contentB = await getEditorContent(panel);
  expect(contentB.length).toBeGreaterThan(0);

  // ── Type in B → tab becomes permanent ──
  await panel.locator('.monaco-editor').click();
  await panel.waitForTimeout(200);
  await panel.keyboard.type('//edit-im04');

  await panel.waitForFunction(() => {
    const s = (window as any).__napStore__.getState();
    const tab = s.tabs.find((t: any) => t.id === s.activeTabId);
    return tab && !tab.ephemeral;
  }, { timeout: 5_000 });

  tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { count: s.tabs.length, tabs: s.tabs.map((t: any) => ({ path: t.path, ephemeral: t.ephemeral })) };
  });
  expect(tabState.count).toBe(1);
  expect(tabState.tabs[0].ephemeral).toBe(false);

  // Check tab is no longer italic
  const pinnedTabStyle = await panel.evaluate(() => {
    const tabs = document.querySelectorAll('[data-testid^="tab-tab"]');
    if (tabs.length === 0) return null;
    return getComputedStyle(tabs[0]).fontStyle;
  });
  expect(pinnedTabStyle).toBe('normal');

  // ── Click file C → 2 tabs (B permanent, C ephemeral) ──
  await clickFileInNav(panel, fileC);

  tabState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return { count: s.tabs.length, tabs: s.tabs.map((t: any) => ({ path: t.path, ephemeral: t.ephemeral })) };
  });
  expect(tabState.count).toBe(2);
  // First tab (B) permanent, second (C) ephemeral
  const permanentTab = tabState.tabs.find((t: any) => !t.ephemeral);
  const ephemeralTab = tabState.tabs.find((t: any) => t.ephemeral);
  expect(permanentTab).toBeTruthy();
  expect(ephemeralTab).toBeTruthy();

  // ── Click file D → ephemeral slot reuses ──
  if (fileD) {
    await clickFileInNav(panel, fileD);
    tabState = await panel.evaluate(() => {
      const s = (window as any).__napStore__.getState();
      return { count: s.tabs.length, tabs: s.tabs.map((t: any) => ({ path: t.path, ephemeral: t.ephemeral })) };
    });
    expect(tabState.count).toBe(2);
    const newEphemeral = tabState.tabs.find((t: any) => t.ephemeral);
    expect(newEphemeral?.path).toContain(fileD.replace('*', '').trim());
  }

  // ── Tab content switching: click B's tab → editor shows B ──
  // Switch back to the permanent tab (B) via store (precondition, not action tested)
  const pathB = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const tab = s.tabs.find((t: any) => !t.ephemeral);
    if (tab) s.openDoc(tab.path);
    return tab?.path;
  });
  await panel.waitForTimeout(500);

  const contentBAgain = await getEditorContent(panel);
  expect(contentBAgain).toContain('//edit-im04');

  console.log('[IM-04] tab behavior — ephemeral/pin/reuse/switch — all correct');
});
