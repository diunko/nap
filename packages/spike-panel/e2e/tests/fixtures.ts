/**
 * Playwright fixtures for spike-panel Chrome extension testing.
 *
 * Key discovery: PW_CHROMIUM_ATTACH_TO_OTHER=1 makes Playwright treat
 * CDP "other" targets (including side panels) as Page objects.
 * See: https://github.com/microsoft/playwright/issues/26693
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
 * Flow: click #nap-open-panel → content script sends message → background calls
 * chrome.sidePanel.open({ tabId }) → Chrome opens real side panel → Playwright
 * sees it as a new page (thanks to PW_CHROMIUM_ATTACH_TO_OTHER=1).
 */
export async function openSidePanel(
  context: BrowserContext,
  githubPage: Page,
  extensionId: string,
): Promise<Page> {
  const panelPromise = context.waitForEvent('page', {
    predicate: (p) => p.url().includes(extensionId) && p.url().includes('side-panel.html'),
    timeout: 10000,
  });

  await githubPage.locator('#nap-open-panel').click({ force: true });

  const panelPage = await panelPromise;
  await panelPage.waitForLoadState();
  return panelPage;
}

export const expect = test.expect;
