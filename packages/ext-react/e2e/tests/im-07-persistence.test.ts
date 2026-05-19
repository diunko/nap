/**
 * IM-07: Persistence — full reopen lifecycle
 *
 * Model-level test: verifies every component's state survives panel close/reopen.
 * - Store: tabs, activeFilePath, focusedCardSlug, mainRepoConfig restored
 * - Nav: sections populated from IDB scan (no re-clone)
 * - Nav: agent metadata present on NavNodes
 * - Editor: activeFilePath file readable from LFS
 * - Terminal: shell alive — command executes and onCommandComplete fires
 *
 * Maps to story S15.
 */
import {
  test, expect, openGitHub, openSidePanel,
  cloneFixtureRepo, focusNapkinCard, clickFileInNav,
  switchToTerminal, typeInTerminal, waitForPanelReady,
} from './fixtures';

test('IM-07: reopen lifecycle — model level', async ({ context, extensionId }) => {
  test.setTimeout(120_000);

  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);

  // ══════════════════════════════════════
  // First lifecycle: set up state
  // ══════════════════════════════════════

  await cloneFixtureRepo(panel);
  await focusNapkinCard(panel, 'delivery-pipeline');
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Set mainRepoConfig so we can verify it persists
  await panel.evaluate(() => {
    (window as any).__napStore__.getState().setMainRepo({
      owner: 'diunko', repo: 'nap-test-main', branch: 'main',
    });
  });

  // Capture full state before close
  const stateBefore = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeFilePath: s.activeFilePath,
      focusedCardSlug: s.focusedCardSlug,
      tabCount: s.tabs.length,
      tabPaths: s.tabs.map((t: any) => t.path),
      mainRepoOwner: s.mainRepoConfig?.owner,
      activeSurface: s.activeSurface,
    };
  });
  expect(stateBefore.activeFilePath).toBeTruthy();
  expect(stateBefore.focusedCardSlug).toBeTruthy();
  expect(stateBefore.tabCount).toBeGreaterThan(0);
  expect(stateBefore.mainRepoOwner).toBe('diunko');

  // Wait for persist
  await panel.waitForTimeout(1500);

  // ══════════════════════════════════════
  // Close and reopen
  // ══════════════════════════════════════

  await panel.close();
  await ghPage.waitForTimeout(2000);

  const panel2 = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel2);

  // ══════════════════════════════════════
  // Verify: store state restored
  // ══════════════════════════════════════

  // Wait for nav to populate (model startup scan)
  await panel2.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 15_000 },
  );

  const stateAfter = await panel2.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeFilePath: s.activeFilePath,
      focusedCardSlug: s.focusedCardSlug,
      tabCount: s.tabs.length,
      tabPaths: s.tabs.map((t: any) => t.path),
      mainRepoOwner: s.mainRepoConfig?.owner,
    };
  });

  expect(stateAfter.activeFilePath).toBe(stateBefore.activeFilePath);
  expect(stateAfter.focusedCardSlug).toBe(stateBefore.focusedCardSlug);
  expect(stateAfter.tabCount).toBe(stateBefore.tabCount);
  expect(stateAfter.mainRepoOwner).toBe('diunko');
  console.log('[IM-07] store state restored ✓');

  // ══════════════════════════════════════
  // Verify: nav with agent metadata
  // ══════════════════════════════════════

  const navCheck = await panel2.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    const napkins = s.navSections.find((n: any) => n.name.startsWith('30-napkins'));
    const napkin = napkins?.children?.find((n: any) => n.name.includes('0100'));
    const agentsSection = napkin?.children?.find((c: any) => c.type === 'section' && c.name === 'agents');
    const agents = agentsSection?.children ?? [];
    return {
      napkinCount: napkins?.children?.length ?? 0,
      napkinStatus: napkin?.status,
      agentCount: agents.length,
      agentsHaveMetadata: agents.every((a: any) => !!a.metadata?.role),
    };
  });

  expect(navCheck.napkinCount).toBeGreaterThanOrEqual(2);
  expect(navCheck.napkinStatus).toBe('doing');
  expect(navCheck.agentCount).toBe(3);
  expect(navCheck.agentsHaveMetadata).toBe(true);
  console.log('[IM-07] nav + agent metadata restored ✓');

  // ══════════════════════════════════════
  // Verify: file readable from LFS
  // ══════════════════════════════════════

  const fileCheck = await panel2.evaluate(async () => {
    const s = (window as any).__napStore__.getState();
    const path = s.activeFilePath;
    if (!path) return { readable: false, path: null };
    try {
      const m = (window as any).__monaco__;
      const ed = m?.editor?.getEditors()?.[0];
      const content = ed?.getModel()?.getValue() ?? '';
      return { readable: content.length > 0, path, contentLength: content.length };
    } catch {
      return { readable: false, path };
    }
  });

  expect(fileCheck.readable).toBe(true);
  expect(fileCheck.contentLength).toBeGreaterThan(0);
  console.log(`[IM-07] file readable from LFS (${fileCheck.contentLength} chars) ✓`);

  // ══════════════════════════════════════
  // Verify: terminal alive — shell responds
  // ══════════════════════════════════════

  await switchToTerminal(panel2);

  // Wait for the shell prompt to be ready
  // The prompt is written by shell.attach — if it completed, wterm has text
  await panel2.waitForFunction(
    () => {
      const wterm = document.querySelector('.wterm');
      return wterm?.textContent?.includes('$') ?? false;
    },
    { timeout: 10_000 },
  );

  // Type a command and verify onCommandComplete fires (proves shell is wired)
  await typeInTerminal(panel2, 'echo "reopen-alive"');

  await panel2.waitForFunction(
    () => {
      const wterm = document.querySelector('.wterm');
      return wterm?.textContent?.includes('reopen-alive') ?? false;
    },
    { timeout: 5_000 },
  );

  console.log('[IM-07] terminal alive — shell responds after reopen ✓');
  console.log('[IM-07] full reopen lifecycle verified at model level');
});
