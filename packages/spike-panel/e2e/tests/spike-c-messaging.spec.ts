/**
 * Spike C: Side panel → content script → tab navigation
 *
 * Tests both messaging paths from a REAL side panel:
 * 1. chrome.tabs.sendMessage → content script listens → window.location.href
 * 2. chrome.tabs.update (direct, no content script needed)
 */
import { test, expect, openSidePanel } from './fixtures';

const TARGET_REPO = 'https://github.com/nicedoc/microlink';
const TARGET_NAV = 'https://github.com/nicedoc/microlink/blob/master/README.md';

test('__navigateDirectly (chrome.tabs.update) from real panel', async ({
  context,
  extensionId,
}) => {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TARGET_REPO, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.locator('#nap-open-panel').waitFor({ timeout: 5000 });

  const panelPage = await openSidePanel(context, page, extensionId);

  // From the real side panel, call __navigateDirectly
  await panelPage.evaluate(async (url) => {
    await (window as any).__navigateDirectly(url);
  }, TARGET_NAV);

  // Wait for the github tab to navigate
  await page.waitForURL(/README/, { timeout: 10000 });

  expect(page.url()).toContain('README.md');
  console.log('[spike-c] __navigateDirectly WORKS — tab navigated to', page.url());
});

test('__navigate (sendMessage → content script) from real panel', async ({
  context,
  extensionId,
}) => {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TARGET_REPO, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for content script to inject (sets napLoaded + adds trigger button)
  await page.locator('#nap-open-panel').waitFor({ timeout: 5000 });
  const napLoaded = await page.evaluate(() => document.body.dataset.napLoaded);
  expect(napLoaded).toBe('true');
  const panelPage = await openSidePanel(context, page, extensionId);

  // From the real side panel, call __navigate (sendMessage path)
  await panelPage.evaluate(async (url) => {
    await (window as any).__navigate(url);
  }, TARGET_NAV);

  // Wait for the github tab to navigate
  await page.waitForURL(/README/, { timeout: 10000 });

  expect(page.url()).toContain('README.md');
  console.log('[spike-c] __navigate (sendMessage) WORKS — tab navigated to', page.url());
});
