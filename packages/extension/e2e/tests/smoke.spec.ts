/**
 * Smoke test — step by step, tight timeouts.
 */
import { test, expect } from './fixtures';

test.setTimeout(10_000);

test('smoke: find extension ID', async ({ context }) => {
  let sw = context.serviceWorkers();
  console.log(`[smoke] SWs at start: ${sw.length}`);
  if (sw.length === 0) {
    const p = Promise.race([
      context.waitForEvent('serviceworker'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('no SW in 3s')), 3000)),
    ]);
    sw = [await p as any];
  }
  for (const w of sw) console.log(`[smoke] SW: ${w.url()}`);
  const ext = sw.find(w => w.url().includes('chrome-extension://'));
  expect(ext).toBeTruthy();
  console.log('[smoke] PASS: extension SW found');
});
