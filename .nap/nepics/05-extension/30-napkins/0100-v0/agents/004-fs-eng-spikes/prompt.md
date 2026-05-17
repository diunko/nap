You're a fullstack engineer building a spike package to answer three unknowns about Chrome extension testing with Playwright. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

## Context

We're building a Chrome extension (side panel alongside GitHub) at `packages/extension/`. It works — Monaco boots, terminal works, 29 vitest + 8 Playwright tests pass. But our Playwright tests use a HACK: they open `chrome-extension://{id}/side-panel.html` as a regular page in a regular tab. This doesn't match production where the side panel opens alongside a github.com tab.

We need to prove that Playwright can drive the REAL extension experience:
1. Open the actual side panel (not as a tab)
2. Content script injects on real github.com
3. Side panel can message the content script to navigate the tab

If all three work, we can write lifecycle tests that match production exactly. If any fail, we know which part needs a workaround.

## What to build

`packages/spike-panel/` — a minimal Chrome extension + Playwright tests. NO Monaco, NO LightningFS, NO terminal. Just the Chrome extension plumbing.

### The extension (~50 lines total)

**`manifest.json`:**
```json
{
  "manifest_version": 3,
  "name": "spike-panel",
  "version": "0.0.1",
  "permissions": ["sidePanel", "activeTab", "tabs"],
  "side_panel": { "default_path": "side-panel.html" },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://github.com/*"],
    "js": ["content.js"]
  }],
  "commands": {
    "_execute_action": {},
    "open-panel": {
      "suggested_key": { "default": "Ctrl+Shift+Y", "mac": "Command+Shift+Y" },
      "description": "Open side panel"
    }
  },
  "action": { "default_title": "Open Panel" }
}
```

**`background.ts`:**
- On install / startup: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` (guarded with `if (chrome.sidePanel)`)
- On `chrome.commands` "open-panel": `chrome.sidePanel.open({ windowId })` (guarded)
- On action click: same

**`side-panel.html`:**
```html
<!DOCTYPE html>
<html><body>
  <div id="probe">side-panel-loaded</div>
  <script src="side-panel.js" type="module"></script>
</body></html>
```

**`side-panel.ts`:**
```typescript
// Expose a probe function for Playwright
(window as any).__navigate = async (url: string) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'navigate', url });
  }
};

// Also try: directly update the tab URL (simpler, no content script needed)
(window as any).__navigateDirectly = async (url: string) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
  }
};
```

**`content.ts`:**
```typescript
// Mark that content script loaded
document.body.dataset.napLoaded = 'true';

// Listen for navigation messages from side panel
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'navigate' && msg.url) {
    window.location.href = msg.url;
  }
});
```

### Build

Simple vite config: build background.ts, content.ts, side-panel.ts as separate entry points → output to `dist/`. Copy manifest.json and side-panel.html to dist/.

### Playwright tests — three spikes

**`e2e/playwright.config.ts`:**
- Use the same `chromium.launchPersistentContext` pattern that works in `packages/extension/` (see `packages/extension/e2e/tests/fixtures.ts` for the proven approach)
- Build before test

**Spike A: `spike-a-panel-handle.spec.ts`** — Can Playwright get a side panel Page handle?

Try multiple approaches, document which works:

1. **Approach 1 — keyboard shortcut:** Press Cmd+Shift+Y → listen for `context.waitForEvent('page')` → check if new page URL contains `side-panel.html`

2. **Approach 2 — action click:** Use CDP to click the browser action: `context.pages()[0].evaluate(() => chrome.action?.openPopup?.())` or use `chrome.test` API

3. **Approach 3 — CDP Target discovery:** Use `const cdp = await context.newCDPSession(page)` → `cdp.send('Target.getTargets')` → find target with URL containing `side-panel.html` → `cdp.send('Target.attachToTarget', { targetId })` → get a handle

4. **Approach 4 — just navigate to it:** `context.newPage()` → `page.goto(chrome-extension://{id}/side-panel.html)` — this is the current hack but test whether the page gets full chrome.* API access even opened this way

For each approach: try it, document result (works / fails with error), move to next. The test should try ALL approaches and report which ones succeed. At least one must work.

**Assert:** we can find a Page-like handle to the side panel, read `#probe` text content, call `window.__navigate()`.

**Spike B: `spike-b-content-script.spec.ts`** — Does content script inject on real github.com?

- Navigate main tab to `https://github.com/nicedoc/microlink` (tiny public repo, or any small public repo — try a few if one 404s)
- Wait for page load
- Assert: `document.body.dataset.napLoaded === 'true'`
- If github.com blocks headless Chrome (captcha/redirect), try with `--disable-blink-features=AutomationControlled` flag
- Document: does it work? Any console errors from GitHub's CSP blocking our script?

**Spike C: `spike-c-messaging.spec.ts`** — Side panel → content script → tab navigation

This depends on A and B both working. If A failed, use the tab workaround for the panel. If B failed, use a local HTML page instead of github.com.

- Open side panel (best approach from A)
- Navigate main tab to github.com (from B)
- On the side panel page: call `window.__navigate('https://github.com/nicedoc/microlink/blob/master/README.md')`
- Assert: main tab URL changed to the target
- Also try: `window.__navigateDirectly(...)` (chrome.tabs.update, no content script needed)
- Document: which messaging approach works?

### Package structure

```
packages/spike-panel/
  manifest.json
  side-panel.html
  src/
    background.ts
    content.ts
    side-panel.ts
  e2e/
    playwright.config.ts
    tests/
      fixtures.ts           — copy pattern from packages/extension/e2e/tests/fixtures.ts
      spike-a-panel-handle.spec.ts
      spike-b-content-script.spec.ts
      spike-c-messaging.spec.ts
  vite.config.ts
  tsconfig.json
  package.json
```

### Reference files to read

- `packages/extension/e2e/tests/fixtures.ts` — the proven Playwright fixture for Chrome extensions (launchPersistentContext, extension ID extraction)
- `packages/extension/e2e/playwright.config.ts` — working config
- `packages/extension/manifest.json` — working CSP + permissions
- `packages/extension/src/background.ts` — the chrome.sidePanel guard pattern
- `packages/extension/src/content.ts` — the content script pattern

### What matters

Each spike produces a **yes/no answer** and the test file is the proof. In your response.md, report:

- Spike A: which approaches work (1/2/3/4), which fail and why
- Spike B: does content script inject on github.com? Any CSP issues?
- Spike C: does messaging work? Which path (sendMessage vs tabs.update)?
- The winning Playwright fixture pattern for real-panel testing

If something fails, don't spend hours debugging — document the failure (error message, screenshot if possible) and move to the next approach. The point is to kill unknowns fast.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0100-v0/agents/004-fs-eng-spikes/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
