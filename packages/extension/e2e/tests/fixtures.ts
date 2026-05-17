/**
 * Playwright fixtures for Chrome extension testing.
 * Follows official Playwright docs: https://playwright.dev/docs/chrome-extensions
 */
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

export const expect = test.expect;
