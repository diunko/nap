/**
 * Extension side panel e2e tests — incremental debugging.
 * Start with the simplest possible test, add one at a time.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ── Setup: log everything ──

function setup(page: Page) {
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[br:${type}] ${text}`);
  });
  page.on('pageerror', err => console.log(`[br:pageerror] ${err.message}`));
  page.on('requestfailed', req => console.log(`[br:reqfail] ${req.url()} ${req.failure()?.errorText}`));
}

// ── Get extension ID from service worker ──

async function getExtensionId(context: BrowserContext): Promise<string> {
  console.log('[setup] looking for extension service worker...');
  let workers = context.serviceWorkers();
  console.log(`[setup] found ${workers.length} service workers at start`);

  if (workers.length === 0) {
    console.log('[setup] waiting for serviceworker event...');
    const sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    workers = [sw];
  }

  for (const w of workers) {
    const url = w.url();
    console.log(`[setup] worker URL: ${url}`);
    const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) {
      console.log(`[setup] extension ID: ${match[1]}`);
      return match[1];
    }
  }
  throw new Error('Could not find extension ID from service workers');
}

// ── Test 1: Can we even open the side panel page? ──

test('test-0: side-panel.html loads', async ({ page, context }) => {
  setup(page);

  const extId = await getExtensionId(context);
  const url = `chrome-extension://${extId}/side-panel.html`;
  console.log(`[test-0] navigating to ${url}`);

  await page.goto(url);
  console.log('[test-0] page loaded, checking title...');

  // Just check the page loaded at all
  const title = await page.title();
  console.log(`[test-0] page title: "${title}"`);

  // Check that the #app container exists
  const app = page.locator('#app');
  await expect(app).toBeVisible({ timeout: 5_000 });
  console.log('[test-0] #app is visible');

  // Check basic DOM structure
  const nav = page.locator('#nav');
  const main = page.locator('#main');
  await expect(nav).toBeVisible({ timeout: 3_000 });
  await expect(main).toBeVisible({ timeout: 3_000 });
  console.log('[test-0] PASSED: side-panel.html loads with #nav and #main');
});
