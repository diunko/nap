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

/**
 * Cmd+click a markdown link in the editor by dispatching a real mousedown
 * with metaKey on the link's pixel position. Uses editor.onMouseDown path.
 *
 * @param panel  The side panel Page
 * @param href   The href to find (e.g. '/modules/server/copy_document.ts#L51')
 */
export async function cmdClickLink(panel: Page, href: string): Promise<void> {
  console.log(`[cmdClickLink] looking for link: ${href}`);

  const coords = await panel.evaluate((targetHref) => {
    const ed = window.__editor;
    const model = ed.getModel()!;
    const lines = model.getValue().split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Check markdown links [text](href)
      const re = /\[([^\]]+)\]\(([^)]+)\)/g;
      let m;
      while ((m = re.exec(lines[i])) !== null) {
        if (m[2] === targetHref) {
          // Click in the middle of the link text
          const col = lines[i].indexOf(m[1]) + Math.floor(m[1].length / 2) + 1;
          const pos = ed.getScrolledVisiblePosition({ lineNumber: i + 1, column: col });
          console.log(`[cmdClickLink] found at line ${i + 1} col ${col} pos=${JSON.stringify(pos)}`);
          return pos;
        }
      }
    }
    console.log(`[cmdClickLink] link not found: ${targetHref}`);
    return null;
  }, href);

  if (!coords) throw new Error(`Link not found in editor: ${href}`);

  const box = await panel.locator('.monaco-editor').boundingBox();
  if (!box) throw new Error('Monaco editor not visible');

  const x = box.x + coords.left + 5;
  const y = box.y + coords.top + coords.height / 2;
  console.log(`[cmdClickLink] dispatching mousedown at (${x}, ${y})`);

  await panel.evaluate(({ cx, cy }) => {
    const el = document.elementFromPoint(cx, cy);
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mousedown', {
      clientX: cx, clientY: cy,
      metaKey: true, ctrlKey: false,
      button: 0, bubbles: true, cancelable: true,
    }));
    el.dispatchEvent(new MouseEvent('mouseup', {
      clientX: cx, clientY: cy,
      metaKey: true, ctrlKey: false,
      button: 0, bubbles: true, cancelable: true,
    }));
  }, { cx: x, cy: y });
}

export const expect = test.expect;
