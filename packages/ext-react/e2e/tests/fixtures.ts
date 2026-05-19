/**
 * Playwright fixtures for Chrome extension testing.
 * Ported from packages/extension/e2e/tests/fixtures.ts.
 *
 * Uses PW_CHROMIUM_ATTACH_TO_OTHER=1 to get real side panel Page handles.
 */
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Chrome reports side panels as target type "other".
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

  // Pipe console logs for debugging
  panelPage.on('console', (msg) => {
    console.log(`[panel] ${msg.text()}`);
  });

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
 * Cmd+click a markdown link in the editor.
 */
export async function cmdClickLink(panel: Page, href: string): Promise<void> {
  console.log(`[cmdClickLink] looking for link: ${href}`);

  const coords = await panel.evaluate((targetHref) => {
    const store = (window as any).__napStore__;
    const m = (window as any).__monaco__;
    if (!m) return null;
    const editors = m.editor.getEditors();
    const ed = editors[0];
    if (!ed) return null;

    const model = ed.getModel();
    if (!model) return null;
    const lines = model.getValue().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const re = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = re.exec(lines[i])) !== null) {
        if (match[2] === targetHref) {
          const col = lines[i].indexOf(match[1]) + Math.floor(match[1].length / 2) + 1;
          const pos = ed.getScrolledVisiblePosition({ lineNumber: i + 1, column: col });
          return pos;
        }
      }
    }
    return null;
  }, href);

  if (!coords) throw new Error(`Link not found in editor: ${href}`);

  const box = await panel.locator('.monaco-editor').boundingBox();
  if (!box) throw new Error('Monaco editor not visible');

  const x = box.x + coords.left + 5;
  const y = box.y + coords.top + coords.height / 2;

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
