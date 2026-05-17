# Spike Results: Chrome Extension Side Panel Testing with Playwright

All three unknowns answered. All four tests pass.

## Spike A: Can Playwright get a real side panel Page handle?

**YES.**

The key: `PW_CHROMIUM_ATTACH_TO_OTHER=1` — an undocumented Playwright env var. Chrome reports side panels as CDP target type `"other"`, which Playwright normally ignores. This flag makes it treat them as pages.

Opening the panel requires a real user gesture chain:
1. Content script injects a trigger button on github.com
2. Playwright clicks it
3. Content script sends `chrome.runtime.sendMessage({ type: 'open_side_panel' })`
4. Service worker calls `chrome.sidePanel.open({ tabId: sender.tab.id })`
5. Chrome opens the real side panel
6. Playwright sees it via `context.waitForEvent('page')`

Critical validation: from the real side panel, `chrome.tabs.query({ active: true, currentWindow: true })` returns the **github tab**, not the panel. This matches production semantics.

Approaches that failed:
- Keyboard shortcut — no "page" event emitted
- `sidePanel.open()` from service worker without user gesture — Chrome rejects it
- CDP `Target.getTargets` — side panel not discoverable without the env var

Reference: [microsoft/playwright#26693](https://github.com/microsoft/playwright/issues/26693)

## Spike B: Does content script inject on github.com?

**YES.** `document.body.dataset.napLoaded === 'true'` confirmed. No CSP issues. No captcha blocks with `--disable-blink-features=AutomationControlled`.

## Spike C: Does messaging work?

**YES — both paths.**

- `chrome.tabs.update(tabId, { url })` — works, navigates the github tab from the side panel
- `chrome.tabs.sendMessage(tabId, msg)` → content script `onMessage` → `window.location.href` — works, content script receives and acts on the message

## The Winning Fixture Pattern

```typescript
// In fixtures.ts — set BEFORE creating context
process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';

// In content.ts — inject a trigger button
const btn = document.createElement('button');
btn.id = 'nap-open-panel';
btn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});
document.body.appendChild(btn);

// In background.ts — listen and open
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'open_side_panel' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});

// In test — open panel via click
const panelPromise = context.waitForEvent('page', {
  predicate: (p) => p.url().includes(extensionId) && p.url().includes('side-panel.html'),
  timeout: 10000,
});
await githubPage.locator('#nap-open-panel').click({ force: true });
const panelPage = await panelPromise;
```

## What to port to packages/extension/

1. Add `process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1'` to `e2e/tests/fixtures.ts`
2. Add the trigger button to `src/content.ts`
3. Add the `open_side_panel` message handler to `src/background.ts`
4. Add `openSidePanel()` helper to fixtures
5. Rewrite medium tests to use real side panel instead of the tab hack

## Decisions

- Trigger button is near-invisible (1x1px, opacity 0.01) so it doesn't interfere with github.com UI
- Used `nicedoc/microlink` as the test repo — it 404s but content script still injects on github.com 404 pages
- Both messaging paths work; `chrome.tabs.update` is simpler (no content script dependency), `sendMessage` proves the full content-script-in-the-loop chain

## Package

Built at `packages/spike-panel/`. Run:
```bash
cd packages/spike-panel
npm install && npm run build && npx playwright test --config=e2e/playwright.config.ts
```
