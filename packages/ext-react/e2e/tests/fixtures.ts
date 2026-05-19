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
 * Finds the link via Monaco API, scrolls it into view, and Ctrl+clicks it.
 */
export async function cmdClickLink(panel: Page, href: string): Promise<void> {
  console.log(`[cmdClickLink] looking for link: ${href}`);

  // Find the link position and scroll it into view
  const linkInfo = await panel.evaluate((targetHref) => {
    const m = (window as any).__monaco__;
    if (!m) return null;
    const ed = m.editor.getEditors()[0];
    if (!ed) return null;
    const model = ed.getModel();
    if (!model) return null;

    const lines = model.getValue().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const re = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = re.exec(lines[i])) !== null) {
        if (match[2] === targetHref) {
          const lineNumber = i + 1;
          const col = match.index + 1 + Math.floor(match[1].length / 2) + 1; // middle of link text
          // Scroll the line into view
          ed.revealLineInCenter(lineNumber);
          // Set cursor there to ensure it's focused
          ed.setPosition({ lineNumber, column: col });
          return { lineNumber, column: col };
        }
      }
    }
    return null;
  }, href);

  if (!linkInfo) throw new Error(`Link not found in editor: ${href}`);
  console.log(`[cmdClickLink] found at line ${linkInfo.lineNumber}, col ${linkInfo.column}`);

  await panel.waitForTimeout(200); // Let Monaco scroll settle

  // Get screen coordinates from Monaco after scrolling
  const coords = await panel.evaluate((pos) => {
    const m = (window as any).__monaco__;
    const ed = m.editor.getEditors()[0];
    if (!ed) return null;
    const vp = ed.getScrolledVisiblePosition(pos);
    if (!vp) return null;
    // Get the editor's DOM element bounding rect
    const domNode = ed.getDomNode();
    if (!domNode) return null;
    const rect = domNode.getBoundingClientRect();
    return {
      x: rect.left + vp.left,
      y: rect.top + vp.top + vp.height / 2,
    };
  }, linkInfo);

  if (!coords) throw new Error(`Could not get screen coordinates for link`);
  // Use Playwright's locator.click with modifiers for correct ctrlKey propagation.
  // Use the view-lines container for precise positioning within Monaco content.
  const viewLines = panel.locator('.monaco-editor .view-lines');
  const vlBox = await viewLines.boundingBox();
  if (!vlBox) throw new Error('Monaco view-lines not visible');

  // Translate screen coords to be relative to view-lines container
  const relX = coords.x - vlBox.x;
  const relY = coords.y - vlBox.y;
  console.log(`[cmdClickLink] clicking at (${relX}, ${relY}) relative to view-lines`);

  await viewLines.click({
    position: { x: relX, y: relY },
    modifiers: ['Control'],
  });
}

// ── Shared helpers for IM-02 through IM-08 ──

/** Clone the fixture repo and wait for nav to populate. */
export async function cloneFixtureRepo(panel: Page): Promise<void> {
  await panel.waitForSelector('.wterm', { timeout: 10_000 });
  await panel.waitForTimeout(2000);
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(500);
  await panel.keyboard.type('git clone https://github.com/diunko/nap-test-nap', { delay: 30 });
  await panel.keyboard.press('Enter');
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().navSections.length > 0,
    { timeout: 45_000 },
  );
}

/** Focus a napkin card by clicking its header in the sidebar. */
export async function focusNapkinCard(panel: Page, textMatch: string): Promise<void> {
  const card = panel.locator('[data-testid="napkin-card"]').filter({ hasText: textMatch }).first();
  await card.click();
  await panel.waitForTimeout(300);
}

/** Click a .md file entry in the sidebar. */
export async function clickFileInNav(panel: Page, filename: string): Promise<void> {
  const entry = panel.locator('[data-testid="file-entry"]').filter({ hasText: filename }).first();
  await entry.click();
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'editor',
    { timeout: 5_000 },
  );
  await panel.waitForTimeout(500);
}

/** Read the Monaco editor content via window.__monaco__. */
export async function getEditorContent(panel: Page): Promise<string> {
  return panel.evaluate(() => {
    const m = (window as any).__monaco__;
    if (!m) return '';
    const editors = m.editor.getEditors();
    const ed = editors[0];
    if (!ed) return '';
    const model = ed.getModel();
    return model ? model.getValue() : '';
  });
}

/** Switch to the terminal surface by clicking the Terminal tab. */
export async function switchToTerminal(panel: Page): Promise<void> {
  await panel.locator('[data-testid="tab-terminal"]').click();
  await panel.waitForFunction(
    () => (window as any).__napStore__.getState().activeSurface === 'terminal',
    { timeout: 3_000 },
  );
  await panel.waitForTimeout(300);
}

/** Type a command in the terminal and press Enter. */
export async function typeInTerminal(panel: Page, command: string): Promise<void> {
  await panel.locator('.wterm').click();
  await panel.waitForTimeout(200);
  await panel.keyboard.type(command, { delay: 20 });
  await panel.keyboard.press('Enter');
}

/** Wait for the store init + terminal ready. Common preamble for all tests. */
export async function waitForPanelReady(panel: Page): Promise<void> {
  await panel.waitForFunction(
    () => (window as any).__napStore__?.getState() != null,
    { timeout: 10_000 },
  );
}

export const expect = test.expect;
