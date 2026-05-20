/**
 * IM-01: Push data flow — auto-clone → nav auto-populates
 *
 * The single most important test. Proves the entire pipeline works:
 * boot gate → session → model.init → registerShell → auto-clone →
 * onCommandComplete → findNepicRoot → refreshNav → store → React.
 */
import { test, expect, openGitHub, openSidePanel } from './fixtures';

test('IM-01: auto-clone → nav auto-populates', async ({ context, extensionId }) => {
  // 1. Navigate to github.com with nap hash and open side panel
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // 2. Wait for store to initialize
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );

  // 3. Verify initial state: editor surface active (idle pane), config applied
  const initialState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      activeSurface: s.activeSurface,
      mainRepoConfig: s.mainRepoConfig,
    };
  });
  expect(initialState.activeSurface).toBe('editor');
  expect(initialState.mainRepoConfig).not.toBeNull();

  // 4. Wait for auto-clone to complete and nav to populate
  // Auto-clone fires when config + init + shell are all ready.
  await panel.waitForFunction(
    () => {
      const s = (window as any).__napStore__.getState();
      return s.navSections.length > 0;
    },
    { timeout: 45_000 },
  );

  // 5. Verify nav tree
  const navState = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return {
      sectionCount: s.navSections.length,
      sectionNames: s.navSections.map((n: any) => n.name),
      cloningStatus: s.cloningStatus,
    };
  });

  expect(navState.sectionCount).toBeGreaterThan(0);
  expect(navState.cloningStatus).toBe('done');

  // 6. Verify DOM — napkin cards should be visible
  const napkinCards = panel.locator('[data-testid="napkin-card"]');
  const cardCount = await napkinCards.count();
  expect(cardCount).toBeGreaterThan(0);

  // 7. No manual refresh was needed — pure push from auto-clone
  console.log('[IM-01] nav auto-populated after auto-clone — pipeline works');
});
