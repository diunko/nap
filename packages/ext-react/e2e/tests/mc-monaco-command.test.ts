/**
 * MC-M01..M02: Monaco command Playwright tests.
 *
 * Tests the `monaco` shell command — opens files in the editor from terminal,
 * creates permanent tabs, handles missing files with error output.
 */
import {
  test, expect, openGitHub, openSidePanel,
  waitForPanelReady, cloneFixtureRepo, switchToTerminal,
  typeInTerminal, getEditorContent,
} from './fixtures';

const NAP_HASH = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
const GITHUB_URL = `https://github.com/diunko/nap-test-main${NAP_HASH}`;

/** Boot panel and clone repo. Returns the side panel page. */
async function bootAndClone(context: any, extensionId: string) {
  const ghPage = await openGitHub(context);
  const panel = await openSidePanel(context, ghPage, extensionId);
  await waitForPanelReady(panel);
  await cloneFixtureRepo(panel);
  await panel.waitForFunction(
    () => document.querySelector('[data-testid="header-bar"]') !== null,
    { timeout: 60_000 },
  );
  return { ghPage, panel };
}

// ── MC-M01: `monaco` opens file from terminal ──

test('MC-M01: monaco opens file — editor tab appears, permanent, correct content', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootAndClone(context, extensionId);

  // Switch to terminal
  await switchToTerminal(panel);

  // Count tabs before running the command
  const tabsBefore = await panel.evaluate(
    () => (window as any).__napStore__.getState().tabs.length,
  );

  // Type `monaco playground.yaml` — playground.yaml exists in /home/user (seeded by init-fs)
  await typeInTerminal(panel, 'monaco playground.yaml');

  // Wait for surface to switch to editor
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'editor',
    { timeout: 10_000 },
  );

  // Verify a new tab was created
  const tabsAfter = await panel.evaluate(
    () => (window as any).__napStore__.getState().tabs.length,
  );
  expect(tabsAfter).toBe(tabsBefore + 1);

  // Verify the active tab points to playground.yaml
  const activeTab = await panel.evaluate(() => {
    const s = (window as any).__napStore__.getState();
    return s.tabs.find((t: any) => t.id === s.activeTabId);
  });
  expect(activeTab.path).toContain('playground.yaml');

  // Tab should be permanent (not ephemeral — pinActiveEphemeral was called)
  expect(activeTab.ephemeral).toBe(false);

  // Verify the tab label shows in the tab bar
  const tabBar = panel.locator('[data-testid="tab-bar"]').first();
  await expect(tabBar).toContainText('playground.yaml');

  // Verify editor content has the YAML steps (from DEFAULT_PLAYGROUND_YAML)
  const content = await getEditorContent(panel);
  expect(content).toContain('steps:');
  expect(content).toContain('parse URL');

  console.log('[MC-M01] PASS — monaco opened file, tab is permanent, content visible');
});

// ── MC-M02: `monaco nonexistent` shows error in terminal ──

test('MC-M02: monaco nonexistent — error in terminal, no tab opened', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const { panel } = await bootAndClone(context, extensionId);

  // Switch to terminal
  await switchToTerminal(panel);

  // Record tab count before
  const tabsBefore = await panel.evaluate(
    () => (window as any).__napStore__.getState().tabs.length,
  );

  // Type `monaco doesnt-exist.txt`
  await typeInTerminal(panel, 'monaco doesnt-exist.txt');

  // Wait for the command to execute — terminal should show error text
  await panel.waitForFunction(
    () => {
      const wterm = document.querySelector('.wterm');
      return wterm?.textContent?.includes('no such file') ?? false;
    },
    { timeout: 10_000 },
  );

  // Verify terminal shows the error
  const wtermText = await panel.locator('.wterm').textContent();
  expect(wtermText).toContain('no such file');
  expect(wtermText).toContain('doesnt-exist.txt');

  // Verify no new tab was opened
  const tabsAfter = await panel.evaluate(
    () => (window as any).__napStore__.getState().tabs.length,
  );
  expect(tabsAfter).toBe(tabsBefore);

  // Surface should still be terminal (no switch to editor)
  const surface = await panel.evaluate(
    () => (window as any).__napStore__.getState().activeSurface,
  );
  expect(surface).toBe('terminal');

  console.log('[MC-M02] PASS — monaco error shown in terminal, no tab opened');
});
