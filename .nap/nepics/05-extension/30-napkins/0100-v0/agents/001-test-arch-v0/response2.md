# 001-test-arch-v0 — response2

## What changed

Updated `0110-v0.tests.md` — removed all "ifs", made the test plan concrete based on spike results.

## Spike results incorporated

**All four spikes answered.** Three are YES, one is manual-only:

1. **Playwright + side panel: YES** — `PW_CHROMIUM_ATTACH_TO_OTHER=1` + trigger button + `context.waitForEvent('page')`. Real side panel, real `chrome.tabs.query` semantics.
2. **Content script on github.com: YES** — injects, no CSP blocks, no captcha with `--disable-blink-features=AutomationControlled`.
3. **Monaco CSP: YES** — `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';` (no blob:).
4. **Panel lifecycle: manual only** — can't observe real side panel frame destruction/recreation through Playwright.

## What the updated plan looks like

**6 lifecycle tests, all medium, all automatable** (except L5 which has a known risk):

- **L1** — first session: clone .nap, read chapter, Cmd+click file:line → GitHub tab navigates to main-repo. The two-repo bridge end-to-end.
- **L2** — review cycle: edit in Monaco → auto-save → git status/add/commit/log from terminal. Editor ↔ LFS ↔ git.
- **L3** — navigation loop: .md → editor, file:line → GitHub, .md → editor, repeat. Routing switch doesn't corrupt state.
- **L4** — tab reuse: all code links reuse the GitHub tab via `chrome.tabs.update`. No tab explosion.
- **L5** — panel survives browsing: main tab navigates multiple times, panel state preserved. **Risk:** if Chrome destroys panel DOM on tab nav, this fails and we need rebuild-from-IDB.
- **L6** — return visit: close and reopen panel, IDB still has cloned repo, nav tree repopulates without re-clone.

## Resolved questions

| Question | Answer |
|---|---|
| Q1: main-repo config | `chrome.storage.sync` via popup. Tests pre-set via `page.evaluate`. |
| Q2: content script testing | Fully automatable against real github.com. |
| Q3: double-click tab | Dropped from v0. Single-click-reuses only. |
| Q4: nav tree refresh | Explicit `window.__refreshNavTree()`. |
| Q5: fixture repos | Public, TE creates, deterministic content. |

## Still open

**Panel lifecycle (spike 4)** — manual test needed. If Chrome destroys side panel DOM on tab navigation, L5 fails and the architecture needs a rebuild-from-IDB path. This makes L6 (IDB persistence) critical. Worth doing the 30min manual test before the fs-eng starts building state management.

## Test infrastructure for TE

The fixture pattern from `packages/spike-panel/e2e/tests/fixtures.ts` is the foundation. TE needs to:
1. Port `PW_CHROMIUM_ATTACH_TO_OTHER=1` and the `openSidePanel()` helper to `packages/extension/e2e/tests/fixtures.ts`
2. Add `cmd()` helper (from bash-poc) adapted for panelPage
3. Add `editorContent()`, `lfsRead()`, `waitForAutoSave()` helpers
4. Create the two fixture repos on GitHub before implementing L1-L6
