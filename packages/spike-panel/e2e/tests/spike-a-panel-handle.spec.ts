/**
 * Spike A: Can Playwright get a REAL side panel Page handle?
 *
 * Uses PW_CHROMIUM_ATTACH_TO_OTHER=1 + click-triggered sidePanel.open().
 */
import { test, expect, openSidePanel } from './fixtures';

test('real side panel opens and returns a Page handle', async ({
  context,
  extensionId,
}) => {
  // Navigate to github.com so the content script injects
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://github.com/nicedoc/microlink', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  // Wait for content script to inject the trigger button
  await page.locator('#nap-open-panel').waitFor({ timeout: 5000 });

  // Open the real side panel via the click → message → sidePanel.open() chain
  const panelPage = await openSidePanel(context, page, extensionId);

  // Verify we have a real Page handle
  expect(panelPage.url()).toContain('side-panel.html');
  expect(panelPage.url()).toContain(extensionId);

  // Read the probe element
  const probe = await panelPage.locator('#probe').textContent();
  expect(probe).toBe('side-panel-loaded');

  // Verify chrome.* APIs are available
  const hasTabsApi = await panelPage.evaluate(() => typeof chrome?.tabs?.query === 'function');
  expect(hasTabsApi).toBe(true);

  const hasRuntimeApi = await panelPage.evaluate(() => typeof chrome?.runtime?.sendMessage === 'function');
  expect(hasRuntimeApi).toBe(true);

  // The critical test: from the real side panel, does chrome.tabs.query
  // return the github tab (not the panel itself)?
  const activeTab = await panelPage.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, url: tab.url } : null;
  });

  console.log('[spike-a] active tab from side panel:', activeTab);
  expect(activeTab).not.toBeNull();
  expect(activeTab!.url).toContain('github.com');
});
