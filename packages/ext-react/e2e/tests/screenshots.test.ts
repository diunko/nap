/**
 * Store listing screenshot capture.
 *
 * Prerequisites:
 *   npm run build:dev   (dev build exposes __napStore__ for test helpers)
 *
 * Run:
 *   npm run screenshots
 *   — or —
 *   npm run build:dev && npx playwright test screenshots
 *
 * Output: packages/ext-react/screenshots/
 */
import { test, openGitHub, openSidePanel, cloneFixtureRepo, clickFileInNav, switchToTerminal, typeInTerminal } from './fixtures';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = resolve(__dirname, '..', '..', 'screenshots');

const PR_URL = 'https://github.com/diunko/nap-test-main/pull/1#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';

test('screenshot: side panel with chapter open', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context, PR_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for clone and nav to populate
  await cloneFixtureRepo(panel);

  // Open a chapter file
  await clickFileInNav(panel, '0100-delivery-pipeline.nap.md');

  // Let Monaco render fully
  await panel.waitForTimeout(2000);

  // Screenshot: side panel with nav tree + editor
  await panel.screenshot({
    path: resolve(screenshotsDir, '01-side-panel-chapter.png'),
    fullPage: false,
  });
  console.log('[screenshot] saved 01-side-panel-chapter.png');
});

test('screenshot: terminal view', async ({ context, extensionId }) => {
  test.setTimeout(90_000);

  const ghPage = await openGitHub(context, PR_URL);
  const panel = await openSidePanel(context, ghPage, extensionId);

  // Wait for clone
  await cloneFixtureRepo(panel);

  // Switch to terminal
  await switchToTerminal(panel);

  // Run a command so the terminal has some content
  await typeInTerminal(panel, 'ls');
  await panel.waitForTimeout(2000);

  // Screenshot: terminal with dark theme
  await panel.screenshot({
    path: resolve(screenshotsDir, '02-terminal.png'),
    fullPage: false,
  });
  console.log('[screenshot] saved 02-terminal.png');
});
