# panel boot — test architecture

## What changed from 0650

Three categories:

### DELETE — tests for things that no longer exist

- **WW-M01** (content script → panel message flow): delete entirely. Panel reads tab URL directly via `chrome.tabs.query` — no config messaging from content script.
- Content script `get-nap-config` request/response in WW-P01: delete. Panel doesn't request config from content script.
- SPA navigation hash change detection in WW-P04: delete. No SPA observer in content script. Each panel window = one session.

### CHANGE — tests that simplify

- **WW-M02** (auto-clone): model receives config at construction — no `applyConfig` timing dance. Three-way race (init/config/shell) becomes two-way (init/shell). Config always present.
- **WW-P01** (hash → session): panel reads tab URL itself. No content script dependency. Test becomes a gate-state test.
- **WW-P04** (session switch between PRs): no longer tests SPA navigation detection. Two windows = two sessions. Browser IS the session manager.
- Content script test fixtures: `content.ts` shrinks to ~20 lines. Fixtures that mock hash parsing, config messaging, SPA observer — all simplified.
- **Store default**: `activeSurface` defaults to `'editor'` (was `'terminal'`). Affects any test that asserts initial surface state.

### STAY — tests that survive unchanged

- **WW-S01..S03** (url-config.test.ts): pure hash parsing, state-key, clone URL. Called from panel now instead of content script — same functions, same tests.
- **WW-S04..S07** (pr-diff.test.ts): hunk parsing, SHA256 anchors, routing decisions, persistence. Untouched.
- **WW-M03** (fetch latest): same git commands, same shell mock. No change.
- **WW-M04** (GitHub API fetch → diff range map): same fetch mock. No change.
- **WW-P05, WW-P06** (diff-aware link routing): same Playwright flow. No change.
- **WW-P07** (fetch latest): same button click, same terminal output. No change.

---

## Test strategy overview

Four new components. Boot-gate is the structural change — everything flows through it. Refresh-pr and idle-pane are leaf additions. Content-script-trim is deletion (fewer tests, not more).

```
chrome.tabs.query → tab URL
    |
boot-gate (loading → decision)
    |
    ├─ github + hash    → SESSION → model(config) → auto-clone or IDB resume
    ├─ github + no hash → MESSAGE ("ask author for review link")
    └─ not github       → MESSAGE ("open on a GitHub page")
```

Test from the inside out: boot-gate decision logic first (small), then model-with-config (medium mock), then full gate flow (Playwright DOM).

---

## Small tests (vitest) — pure logic, no browser

### PB-S01: boot-gate decision logic

* **flow:** tab URL string → boot state decision
* **subsystems:** `boot-gate.ts` or equivalent pure function
* **what to test:**
  - `https://github.com/owner/repo/pull/1#nap-repo=github/org/nap` → `{ state: 'session', config, key }`
  - `https://github.com/owner/repo/pull/1` (no hash) → `{ state: 'no-hash' }`
  - `https://github.com/owner/repo` (no hash) → `{ state: 'no-hash' }`
  - `https://www.google.com/` → `{ state: 'wrong-page' }`
  - `chrome://extensions/` → `{ state: 'wrong-page' }`
  - empty/undefined URL (tab query returned nothing) → `{ state: 'wrong-page' }`
  - `mainBranch` defaults to `'main'` — no `.head-ref` DOM read (panel can't access page DOM)
* **where it breaks:** hostname check. `github.com` vs `www.github.com` vs `github.mycompany.com`. Start strict (exact `github.com`), note in the test why.
* **test size:** small
* **verification:** direct assert on return value

### PB-S02: activeSurface default change

* **flow:** `createNapStore()` → initial state
* **subsystems:** `store.ts`
* **what to test:**
  - fresh store: `activeSurface` is `'editor'` (was `'terminal'` in 0650)
  - `openDoc` doesn't change what's already `'editor'`
* **where it breaks:** store defaults. If the default stays `'terminal'`, idle pane won't show on boot.
* **test size:** small
* **verification:** assert `store.getState().activeSurface === 'editor'`

Note: WW-S01..S07 stay unchanged. Not repeated here.

---

## Medium tests (vitest with mocks) — seams between subsystems

### PB-M01: model constructed with config (replaces WW-M02 timing dance)

* **flow:** `createModel({ adapter, store, config })` → model has config from the start → `init()` → auto-clone
* **subsystems:** model.ts (constructor path), store
* **what to test:**
  - model created with config + empty LFS → after init + registerShell → clone fires immediately
  - model created with config + existing repos (nepicRoot found during scan) → no clone
  - model created with config + navSections populated (IDB return visit) → no clone
  - model created with config → store has `mainRepoConfig` and `prNum` set at construction time (no deferred `applyConfig`)
  - shell registered before init → clone fires after init (two-way race, not three-way)
  - `checkAutoClone` no longer waits for config — it's always present
* **where it breaks:** the constructor must apply config to store immediately (before init). If config application is deferred, the boot-gate renders SESSION but store is empty — idle pane shows nothing.
* **test size:** medium
* **verification:** spy on shell exec, assert store state

### PB-M02: refresh PR logic

* **flow:** user clicks [refresh PR] → `chrome.tabs.query` → re-parse tab URL hash → update store → invalidate + re-fetch diff ranges
* **subsystems:** model.ts (new `refreshPr` method), store, pr-diff.ts
* **what to test:**
  - mock chrome.tabs.query → returns URL with same hash → no-op (store unchanged)
  - mock chrome.tabs.query → returns URL with new prNum → `store.setPrNum` updated, `prDiffRanges` set to null, re-fetch triggered
  - mock chrome.tabs.query → returns URL with no hash → no crash, store unchanged (graceful degradation — the gate already decided SESSION, user navigated away, panel stays faithful)
  - mock chrome.tabs.query fails (tab closed) → no crash
  - does NOT remount, switch session, or touch .nap filesystem
  - diff range re-fetch uses mock fetch → verify correct owner/repo/prNum
* **where it breaks:** the re-parse must update `mainRepoConfig` and `prNum` but NOT create a new session or destroy the model. This is an in-place update — the seam is between "update config" and "keep session".
* **test size:** medium
* **verification:** spy on store actions + fetch mock

### PB-M03: content script trim — navigate handler still works

* **flow:** panel sends `{ type: 'navigate', url }` → content script receives → `window.location.href = url`
* **subsystems:** content.ts (trimmed), link-routing.ts
* **what to test:**
  - content script responds to `navigate` message (the one remaining handler besides trigger button)
  - content script does NOT respond to `get-nap-config` (handler deleted)
  - content script does NOT parse hash or send `nap-config` messages
  - `napLoaded` marker still set on `document.body`
  - trigger button still injected
* **where it breaks:** over-trimming. If the navigate handler is accidentally deleted, link clicks from the editor fail silently — the panel falls back to `chrome.tabs.update(tabId, { url })` which works but bypasses SPA navigation.
* **test size:** medium (mock chrome.runtime.onMessage)
* **verification:** spy on message handlers, verify absence of deleted ones

---

## Playwright tests — real browser, real extension

### PB-P01: gate → SESSION (normal start, replaces WW-P01)

* **flow:** navigate to PR with nap hash → panel reads tab URL → gate decides SESSION → session created → auto-clone → nav populates
* **subsystems:** boot-gate, tab-url-reader, model, store, sidebar
* **what to test:**
  - navigate to `github.com/diunko/nap-test-main/pull/1#nap-repo=...`
  - open side panel
  - gate loading state visible briefly (or instant — either is fine)
  - session UI renders: header bar, sidebar, tab bar all visible
  - no message overlay
  - `__napStore__.getState().mainRepoConfig` set correctly
  - **works after extension reload** (critical: no content script dependency for config)
* **where it breaks:** `chrome.tabs.query` returns the tab URL but the hash might be stripped by GitHub (SPA navigation). The test must verify the hash survives page load.
* **test size:** medium (real Chrome, real GitHub)
* **verification:** DOM (header bar visible, no message overlay) + store state

### PB-P02: gate → MESSAGE (no hash)

* **flow:** navigate to `github.com/...` without hash → panel opens → gate shows "ask author for review link"
* **subsystems:** boot-gate
* **what to test:**
  - navigate to `https://github.com/diunko/nap-test-main` (no hash)
  - [navigate to](/modules/something.md)
  - open side panel
  - gate renders the "no hash" message
  - **DOM:** message text visible, contains "review link" or "ask the author"
  - **DOM:** no terminal surface, no sidebar, no editor surface
  - **DOM:** no header bar (or minimal — just the nap logo)
  - no session created (no `__napStore__` or store is in initial state)
* **where it breaks:** if the gate doesn't wait for `chrome.tabs.query` to resolve, it might flash SESSION then switch to MESSAGE. Verify no flash.
* **test size:** medium
* **verification:** DOM text content + absence of session UI

### PB-P03: gate → MESSAGE (not GitHub)

* **flow:** navigate to non-GitHub page → panel opens → gate shows "open on a GitHub page"
* **subsystems:** boot-gate
* **what to test:**
  - navigate to `https://example.com`
  - open side panel
  - gate renders the "wrong page" message
  - **DOM:** message text visible, contains "GitHub" or "open on"
  - **DOM:** no terminal, no sidebar, no editor
  - no session created
* **where it breaks:** same as PB-P02 — gate must wait for tab URL resolution.
* **test size:** medium
* **verification:** DOM text content

### PB-P04: auto-clone gate test (evolves from WW-P02)

* **flow:** first visit with hash → gate → SESSION → clone → nav populates → napkin focused
* **subsystems:** boot-gate, model, terminal, store, sidebar
* **what to test:**
  - navigate to PR with hash (clean IDB)
  - open panel → gate → SESSION → clone starts
  - wait for nav to populate (navSections > 0)
  - **DOM:** napkin card(s) visible in sidebar
  - **DOM:** focused card matches napkin from hash
  - no content script dependency — test should work even if content script hasn't loaded yet
* **where it breaks:** clone trigger. In 0650, clone was triggered by `applyConfig` → `checkAutoClone`. In 0651, model has config at construction — clone triggers from `init()` + `registerShell()`.
* **test size:** medium (network: git clone)
* **verification:** DOM (napkin cards) + store state

### PB-P05: return visit — IDB restore (evolves from WW-P04)

* **flow:** same URL, second panel open → IDB has repo → nav instant, no clone, diff ranges cached
* **subsystems:** boot-gate, model.scanExistingRepos, Zustand persist
* **what to test:**
  - first visit: clone + populate + wait for persist flush
  - close panel, reopen on same PR URL
  - nav populates fast (IDB scan, not clone) — timeout 10s not 45s
  - `cloningStatus` stays `'idle'`
  - **DOM:** napkin cards visible after reopen
  - diff ranges hydrated from IDB (if fetched on first visit)
* **where it breaks:** session key derivation. In 0651, the panel derives the key from `chrome.tabs.query` — if the URL changes between visits (GitHub SPA), the key differs → fresh session → unnecessary re-clone.
* **test size:** medium
* **verification:** DOM + timing (nav in <2s) + store state

### PB-P06: refresh PR

* **flow:** click [refresh PR] → re-read tab URL → update config → re-fetch diff ranges
* **subsystems:** model.refreshPr, store, pr-diff.ts
* **what to test:**
  - start from auto-clone state (nav populated, diff ranges fetched)
  - click [refresh PR] button
  - verify `prDiffRanges` goes null briefly (invalidated) then re-populated
  - **DOM:** button visible with testid
  - session is NOT recreated (same key before and after)
  - nav is NOT disrupted (napkin cards still visible)
  - no terminal output (refresh PR doesn't run git commands — it just re-reads URL + re-fetches API)
* **where it breaks:** if refresh PR accidentally remounts the panel or creates a new session. The seam: config update vs session creation.
* **test size:** medium
* **verification:** DOM (button click) + store state (prDiffRanges cycle: present → null → present)

### PB-P07: idle pane

* **flow:** panel boots, nav shows cards, no file selected → main area shows repo/branch status
* **subsystems:** idle-pane component, store (activeSurface default)
* **what to test:**
  - start from auto-clone state (nav populated)
  - no file selected (initial state)
  - **DOM:** editor surface visible (not terminal)
  - **DOM:** idle pane content visible — contains repo name or branch
  - **DOM:** terminal surface hidden (visibility: hidden or display: none)
  - click Terminal tab → terminal visible, editor hidden
  - click a file in sidebar → editor shows file, idle pane gone
  - the idle pane is NOT a loading indicator — it's the resting state
* **where it breaks:** `activeSurface` default. If store defaults to `'terminal'`, the user sees a blank terminal on boot. The idle pane only shows when `activeSurface === 'editor'` AND no file is open.
* **test size:** medium
* **verification:** DOM (visibility, text content, bounding box)

### PB-P08: content script fallback — link clicks after ext reload

* **flow:** extension reloads → content script gone → user clicks link in editor → fallback to `chrome.tabs.update(tabId, { url })`
* **subsystems:** ContentPane link handler, chrome.tabs API
* **what to test:**
  - auto-clone state
  - Cmd+click a code link in editor
  - GitHub tab navigates to the correct URL
  - this works whether or not the content script is present (the panel doesn't depend on it for navigation)
* **where it breaks:** the fallback path in ContentPane. If `chrome.tabs.sendMessage` fails (content script gone), the panel must catch the error and use `chrome.tabs.update` instead.
* **test size:** medium
* **verification:** GitHub tab URL after click

---

## Story-to-test mapping

| Story | Test(s) | Type |
|---|---|---|
| B1 (shared link — normal start) | PB-P01 (gate → SESSION), PB-P04 (auto-clone) | gate + clone |
| B2 (return visit) | PB-P05 (IDB restore) | persistence |
| B3 (no nap link / wrong page) | PB-P02 (no hash), PB-P03 (not github) | gate messages |
| B4 (refresh PR) | PB-M02 (model logic), PB-P06 (Playwright) | new feature |
| B5 (fetch latest) | WW-M03, WW-P07 — stay unchanged | existing |
| B6 (idle pane) | PB-S02 (default change), PB-P07 (DOM) | new feature |

---

## What to delete from existing tests

| File | Delete | Reason |
|---|---|---|
| `workflow-wiring.test.ts` | WW-M01 entirely | no content script config messaging |
| `workflow-wiring.test.ts` | WW-M02 `applyConfig` ordering tests | replaced by PB-M01 (config at construction) |
| `ww-workflow-wiring.test.ts` | WW-P01 content script dependency | replaced by PB-P01 (tab URL reader) |
| `ww-workflow-wiring.test.ts` | WW-P04 SPA navigation detection | replaced by PB-P05 (simpler, no SPA) |
| `content.ts` test fixtures | hash parsing mocks, `get-nap-config` mocks | deleted from content script |

Keep: WW-M02's core logic (clone triggers, no-double-fire, return-visit skip) — just refactor to use config-at-construction instead of `applyConfig`.

---

## Test execution order

1. **PB-S01, PB-S02** — boot-gate decision logic + store default change (instant, pure)
2. **PB-M01** — model with config at construction (vitest mock, fast)
3. **PB-M02** — refresh PR logic (vitest mock, fast)
4. **PB-M03** — content script trim verification (vitest mock, fast)
5. **PB-P01** — gate → SESSION (first Playwright test, proves tab-url-reader works)
6. **PB-P02, PB-P03** — gate → MESSAGE paths (quick Playwright, no clone needed)
7. **PB-P04** — auto-clone gate test (slow, clone involved — the gate test for this napkin)
8. **PB-P07** — idle pane (DOM check, from clone state)
9. **PB-P06** — refresh PR (needs clone + diff ranges)
10. **PB-P05** — return visit (needs first visit, then second)
11. **PB-P08** — content script fallback (needs clone + file open + link click)

---

## Key risks

### Risk 1: chrome.tabs.query returns stale URL
`chrome.tabs.query({ active: true, currentWindow: true })` returns the tab's URL at call time. If GitHub SPA-navigated away from the PR page between page load and panel open, the URL might not have the hash. **Mitigation:** PB-P01 verifies hash survives. PB-P05 verifies session key consistency across visits.

### Risk 2: activeSurface default breaks existing tests
Changing `activeSurface` from `'terminal'` to `'editor'` affects existing Playwright tests that assume terminal is visible on boot (IM-02-DOM, IM-07-DOM, IM-08). **Mitigation:** PB-S02 catches the default change. Existing tests need a surface-switch step added.

### Risk 3: refresh PR accidentally creates new session
If `refreshPr()` re-derives the state key and it differs from the current key (e.g., prNum changed), it could trigger a session switch instead of an in-place update. The spec says "does NOT switch session." **Mitigation:** PB-M02 asserts session key unchanged. PB-P06 asserts no remount.

### Risk 4: content script navigate fallback not exercised
In normal operation, the content script handles navigation. The fallback to `chrome.tabs.update` only fires when the content script is absent (extension reload). Most tests won't hit this path. **Mitigation:** PB-P08 explicitly tests the fallback. PB-P01 also works without content script (proves independence).

### Risk 5: idle pane flash on return visit
On return visit, Zustand hydrates `activeFilePath` from IDB. If a file was open, the idle pane shouldn't flash. If `activeSurface` was `'terminal'` in the persisted state (from 0650), the idle pane won't show — but the terminal will. **Mitigation:** migration: if persisted `activeSurface` is `'terminal'` and no file is open, override to `'editor'`. Test in PB-P05.
