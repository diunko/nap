/**
 * Spike B: Does content script inject on real github.com?
 *
 * Checks document.body.dataset.napLoaded and the trigger button.
 */
import { test, expect } from './fixtures';

test('content script injects on github.com', async ({ context }) => {
  const page = context.pages()[0] || (await context.newPage());

  await page.goto('https://github.com/nicedoc/microlink', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  // Wait for content script
  await page.waitForTimeout(2000);

  // Check napLoaded marker
  const napLoaded = await page.evaluate(() => document.body.dataset.napLoaded);
  expect(napLoaded).toBe('true');

  // Check trigger button exists
  const btn = page.locator('#nap-open-panel');
  await expect(btn).toBeAttached();
});
