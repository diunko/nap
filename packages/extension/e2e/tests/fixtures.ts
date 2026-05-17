/**
 * Playwright fixtures for Chrome extension testing.
 *
 * Uses PW_CHROMIUM_ATTACH_TO_OTHER=1 to get real side panel Page handles.
 * See: https://github.com/microsoft/playwright/issues/26693
 *
 * Follows spike-panel pattern from packages/spike-panel/e2e/tests/fixtures.ts.
 */
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// This is the magic — Chrome reports side panels as target type "other".
// Playwright normally ignores these. This flag makes it treat them as pages.
process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pathToExtension = resolve(__dirname, '..', '..', 'dist');

console.log(`[fixtures] pathToExtension = ${pathToExtension}`);

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    console.log('[fixtures] launching persistent context...');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--disable-blink-features=AutomationControlled',
      ],
    });
    console.log('[fixtures] context launched');
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    console.log('[fixtures] getting extension ID from service worker...');
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      console.log('[fixtures] no sw yet, waiting for event...');
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const extensionId = serviceWorker.url().split('/')[2];
    console.log(`[fixtures] extensionId = ${extensionId}`);
    await use(extensionId);
  },
});

/**
 * Open the real side panel by clicking the trigger button injected by content.ts.
 * Returns the side panel Page handle.
 *
 * Flow: navigate to github.com → content script injects #nap-open-panel →
 * click it → content script sends message → background calls sidePanel.open() →
 * Chrome opens real side panel → Playwright sees it as a new page
 * (thanks to PW_CHROMIUM_ATTACH_TO_OTHER=1).
 */
export async function openSidePanel(
  context: BrowserContext,
  githubPage: Page,
  extensionId: string,
): Promise<Page> {
  console.log('[openSidePanel] waiting for trigger button...');
  await githubPage.locator('#nap-open-panel').waitFor({ timeout: 5_000 });
  console.log('[openSidePanel] trigger button found, clicking...');

  const panelPromise = context.waitForEvent('page', {
    predicate: (p) => p.url().includes(extensionId) && p.url().includes('side-panel.html'),
    timeout: 10_000,
  });

  await githubPage.locator('#nap-open-panel').click({ force: true });

  const panelPage = await panelPromise;
  await panelPage.waitForLoadState();
  console.log(`[openSidePanel] panel opened: ${panelPage.url()}`);
  return panelPage;
}

/**
 * Navigate to a github.com page and wait for content script to inject.
 */
export async function openGitHub(
  context: BrowserContext,
  url = 'https://github.com/nicedoc/microlink',
): Promise<Page> {
  const page = context.pages()[0] || await context.newPage();
  console.log(`[openGitHub] navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  console.log('[openGitHub] waiting for content script...');
  await page.waitForFunction(() => document.body?.dataset?.napLoaded === 'true', {}, { timeout: 5_000 });
  console.log('[openGitHub] content script loaded');
  return page;
}

export const expect = test.expect;
