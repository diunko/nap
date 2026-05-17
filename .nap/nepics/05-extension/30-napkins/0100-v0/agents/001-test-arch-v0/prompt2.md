## Update: all 4 spikes answered

Read the spike results: `.nap/nepics/05-extension/30-napkins/0100-v0/agents/004-fs-eng-spikes/response.md`

### What we now know

**Spike 1 (Playwright + side panel): YES.** `PW_CHROMIUM_ATTACH_TO_OTHER=1` env var makes Playwright see side panels. Panel opens via content script trigger button → `chrome.sidePanel.open()` → `context.waitForEvent('page')` catches it. Full DOM access. `chrome.tabs.query` from panel returns the github tab (matches production).

**Spike 2 (content script on github.com): YES.** Injects fine. No CSP blocks. No captcha with `--disable-blink-features=AutomationControlled`.

**Spike 3 (Monaco CSP): YES.** Answered earlier by fs-eng. Working CSP: `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';` (no blob:).

**Spike 4 (panel lifecycle): Still manual only.** Not testable — side panel lifecycle behavior (destroy/recreate on tab nav) depends on real Chrome side panel frame, not testable via `waitForEvent('page')`.

### What this means for your test plan

Every "if" in `0110-v0.tests.md` is now resolved except spike 4. The lifecycle tests L1-L6 are fully automatable against real GitHub with real side panel.

### What you should do now

1. Read the spike results and the proven fixture pattern in `packages/spike-panel/e2e/tests/fixtures.ts`
2. Update `0110-v0.tests.md` — remove the "ifs", make the test plan concrete based on what we now know works
3. Add test infrastructure notes: the `PW_CHROMIUM_ATTACH_TO_OTHER=1` requirement, the trigger button pattern, how to get the panel Page handle
4. Address your own open questions: Q1 (main-repo config) — solved via popup settings in chrome.storage.sync. Q3 (double-click) — dropped, single-click-reuses for v0. Q4 (nav tree refresh) — explicit `window.__refreshNavTree()`.

Write your updated plan to `response2.md` in your agent directory, then run `nap3 done`.
