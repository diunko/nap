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

/** Default URL with nap hash — boot gate requires hash for session. */
const DEFAULT_GITHUB_URL = 'https://github.com/diunko/nap-test-main#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';

/**
 * Navigate to a github.com page and wait for content script to inject.
 */
export async function openGitHub(
  context: BrowserContext,
  url = DEFAULT_GITHUB_URL,
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
 *
 * Finds the rendered span containing the link display text, measures its
 * bounding rect on screen, and dispatches a synthetic mousedown with
 * metaKey=true at the center of that span on Monaco's overflow-guard.
 */
export async function cmdClickLink(panel: Page, href: string): Promise<void> {
  console.log(`[cmdClickLink] looking for link: ${href}`);

  // Step 1: find the link, set cursor on it, scroll it into view
  await panel.evaluate((targetHref) => {
    const m = (window as any).__monaco__;
    if (!m) return;
    const ed = m.editor.getEditors()[0];
    if (!ed?.getModel()) return;
    const lines = ed.getModel().getValue().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const re = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = re.exec(lines[i])) !== null) {
        if (match[2] === targetHref) {
          const lineNumber = i + 1;
          // Place cursor in the middle of the display text
          const col = match.index + 1 + Math.floor(match[1].length / 2) + 1;
          ed.setPosition({ lineNumber, column: col });
          ed.revealLineInCenter(lineNumber);
          return;
        }
      }
    }
  }, href);
  await panel.waitForTimeout(300); // let Monaco re-render visible lines

  // Step 2: find the rendered span, measure it, dispatch mousedown
  const result = await panel.evaluate((targetHref) => {
    const m = (window as any).__monaco__;
    if (!m) return { error: 'no monaco' };
    const ed = m.editor.getEditors()[0];
    if (!ed?.getModel()) return { error: 'no editor/model' };

    // Find the display text for this href
    const text = ed.getModel().getValue();
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let linkDisplay: string | null = null;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match[2] === targetHref) { linkDisplay = match[1]; break; }
    }
    if (!linkDisplay) return { error: `href not found: ${targetHref}` };

    // Search LEAF spans only (no child spans) — these are individual tokens
    const spans = document.querySelectorAll('.monaco-editor .view-line span');
    for (const span of spans) {
      if (span.children.length > 0) continue; // skip parent spans
      const t = span.textContent ?? '';
      if (t.includes(linkDisplay!)) {
        const rect = span.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        // Dispatch on overflow-guard (where Monaco's mouse handler listens)
        const guard = document.querySelector('.monaco-editor .overflow-guard');
        if (!guard) return { error: 'no overflow-guard' };

        guard.dispatchEvent(new MouseEvent('mousedown', {
          clientX: cx, clientY: cy,
          metaKey: true, ctrlKey: false,
          button: 0, bubbles: true, cancelable: true,
        }));
        guard.dispatchEvent(new MouseEvent('mouseup', {
          clientX: cx, clientY: cy,
          metaKey: true, ctrlKey: false,
          button: 0, bubbles: true, cancelable: true,
        }));
        return { ok: true, cx: Math.round(cx), cy: Math.round(cy), spanText: t.substring(0, 40) };
      }
    }
    return { error: `span with "${linkDisplay}" not found in rendered DOM` };
  }, href);

  if ('error' in result) throw new Error(`cmdClickLink failed: ${result.error}`);
  console.log(`[cmdClickLink] clicked "${result.spanText}" at (${result.cx}, ${result.cy})`);
}

// ── Shared helpers for IM-02 through IM-08 ──

/**
 * Wait for repo clone and nav to populate.
 * With boot gate (0651), auto-clone fires when config + init + shell are ready.
 * Just wait for nav sections to appear.
 */
export async function cloneFixtureRepo(panel: Page): Promise<void> {
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
