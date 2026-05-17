# response2 — fs-eng-v0

## What was done

Ported spike-panel fixture pattern into `packages/extension/` and added lifecycle tests.

### 1. Real side panel fixture

Updated three source files:

- **`background.ts`** — added `open_side_panel` message handler that calls `chrome.sidePanel.open({ tabId })`. User gesture flows through content script click → message → sidePanel.open().
- **`content.ts`** — added content script loaded marker (`document.body.dataset.napLoaded`), navigation message listener, and near-invisible trigger button (`#nap-open-panel`) for Playwright.
- **`fixtures.ts`** — added `PW_CHROMIUM_ATTACH_TO_OTHER=1`, `--disable-blink-features=AutomationControlled`, `openSidePanel()` helper (click trigger → waitForEvent page), `openGitHub()` helper.

### 2. Deleted old test file

Removed `side-panel.spec.ts` — the `chrome-extension://` URL hack is superseded by real panel tests.

### 3. Rewrote happy-path-debug.spec.ts

All 9 tests now use the real side panel fixture:
- test-0: real side panel opens
- test-1: Monaco boots in real panel
- test-2: terminal prompt
- test-3: terminal echo
- test-4: LFS → Monaco
- test-5: auto-save
- test-6: editor → terminal bidirectional
- test-7: theme CSS vars
- test-8: chrome.tabs.query from panel returns github tab (NEW — proves production semantics)

All 9 pass in 20s.

### 4. Created fixture repos

- **[diunko/nap-test-main](https://github.com/diunko/nap-test-main)** — code repo with `modules/server/copy_document.ts` (marker at line 51), `modules/core/id_universe.ts` (marker at line 12)
- **[diunko/nap-test-nap](https://github.com/diunko/nap-test-nap)** — .nap repo with `20-architects/`, `30-napkins/0100-feature/` (status "doing"), `30-napkins/0200-other/` (status "backlog"), chapters `01-copy-pipeline.md` and `02-id-universe.md` with file:line links pointing at nap-test-main

### 5. Added lifecycle tests

4 tests in `e2e/tests/lifecycle.spec.ts`, all passing (18.3s):

- **L1** — clone nap-test-nap → nav tree shows architects + napkins with status → open `01-copy-pipeline.md` → editor shows chapter with `copy_document.ts:51` link
- **L2** — clone → open chapter → add `//DU: this looks fragile` → auto-save → terminal `git status` shows modified → `git add .` → `git commit` → `git log` confirms
- **L3** — clone → open chapter 01 → navigate to chapter 02 → verify `id_universe.ts:12` link → navigate back to chapter 01 → no state corruption
- **L6** — clone → verify repo in LFS → close panel → reopen panel → IDB persists → nav tree repopulates without re-clone

## Test totals

- **29 vitest small tests** — nav tree, link routing, theme (0.2s)
- **9 happy-path e2e tests** — real side panel (20s)
- **4 lifecycle e2e tests** — full two-repo bridge (18.3s)

## What's not covered yet

- **L1 file:line click → github tab navigation** — the test verifies the chapter loads with the link text, but doesn't test Cmd+click dispatching to the github tab. This needs the link provider + `chrome.tabs.update` integration, which depends on the main-repo config being accessible in the panel (currently only via chrome.storage.sync popup).
- **L4 (tab reuse)** — single vs double click policy not tested.
- **L5 (panel survives browsing)** — untested, may need manual verification.
- **Main-repo config in tests** — lifecycle tests use `openFile()` directly to open chapters, not Cmd+click. The link routing is tested at the unit level (vitest) but not end-to-end with real panel + real github tab navigation.
