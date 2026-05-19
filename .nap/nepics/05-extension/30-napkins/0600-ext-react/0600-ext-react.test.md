# ext-react — test architecture

## The lesson from the old extension

The old extension had 51 tests. The product was broken. Why?

* tests bypassed the data flow with `window.__openFile`, `window.__refreshNavTree`, `window.__lfs`
  * they proved functions work in isolation — not that the pipeline is wired correctly
  * the god file (side-panel.ts) had no model layer — state scattered across globals
  * a passing test meant "this function returns the right thing" not "this user action produces the right result"
* the new extension has a model layer, a store, and React components — same as the app
  * test the pipeline, not the endpoints
  * verify through user actions + log traces, not function calls
  * `window.__` hooks for VERIFICATION only (reading store state), never for DRIVING actions

## What we're testing

The push data flow is the architecture:

```
adapter emitter / onCommandComplete
         |
    debounce 200ms
         |
    model re-reads from LFS
         |
    store update
         |
    React re-renders
```

If this chain works, everything works. If it breaks, everything breaks. Every test either verifies this chain directly or verifies a component that feeds into it.

## Fixture

All tests use the same fixture repos: `diunko/nap-test-nap` (cloned into IDB) and `diunko/nap-test-main` (code repo, never cloned — referenced via GitHub URLs).

The .nap fixture has `nepics/01-v1/` with the space-pizza delivery pipeline:
* 2 napkins: `0100-delivery-pipeline` (doing, 3 agents, 5 chapters), `0200-crust-validation` (backlog)
* 3 agents: 001-test-arch-routing (orange, done), 002-fs-eng-routing (green, done), 003-test-eng-routing (gray, run)
* 5 chapters in mini-book/ with file:line links to the main code repo

Run `fixtures/sync.sh` to update.

For vitest: use inline data or mock functions — no real LFS, no browser.

For Playwright: use the same `openSidePanel` fixture pattern from the existing extension (PW_CHROMIUM_ATTACH_TO_OTHER=1, persistent context, trigger button). Port `fixtures.ts` into ext-react.

---

## Part 1: Debugging scenarios for the fs-eng

These are NOT permanent tests. They're development-time verification — the fs-eng runs a Playwright scenario, reads the console log trace, confirms the pipeline is wired correctly before moving to the next phase. Each scenario is a single Playwright test file the fs-eng can run in isolation.

### Phase 2: store + basic rendering

**DS-P2-01: panel renders with stubs**

* do: open side panel on github.com
* expect in DOM: layout visible — editor area, nav area, header bar, tab bar
* expect in console:
  ```
  [store] initialized
  [render] mounted — layout: [ContentPane | ResizeHandle | Sidebar]
  ```
* where it breaks: React fails to mount (CSP violation, missing polyfill, Vite config wrong)

**DS-P2-02: store actions work from console**

* do: open panel, call `store.getState().openDoc('test.md')` from Playwright evaluate
* expect in console:
  ```
  [store] openDoc test.md → upsertTab → activeFilePath=test.md
  ```
* verify: `store.getState().leftTabs.length === 1`, `store.getState().leftTabs[0].ephemeral === true`
* where it breaks: Zustand not wired, store actions silently fail

### Phase 3: wire surfaces

**DS-P3-01: clone → nav auto-populates (THE pipeline test)**

* do: type `git clone https://github.com/diunko/nap-test-nap` in terminal, wait for "done."
* expect in console (this exact sequence):
  ```
  [terminal] commandComplete git clone ...
  [model] repo-changed → refreshNav
  [store] refreshNav → navSections updated (2 napkins)
  [sidebar] render — 0100-delivery-pipeline (doing), 0200-crust-validation (backlog)
  ```
* verify: nav tree DOM has card text "delivery-pipeline", agent dots visible
* where it breaks:
  * onCommandComplete not wired to store.refreshNav
  * parseNavTree fails on LFS directory structure
  * store update doesn't trigger React re-render
  * model layer not subscribed to shell events

**DS-P3-02: file click → editor loads**

* do: after clone, focus 0100 card, click 01-order-routing.md in nav
* expect in console:
  ```
  [sidebar] fileClick 01-order-routing.md
  [store] openDoc → upsertTab → activeFilePath=.../01-order-routing.md
  [contentpane] loadFile → readFile from LFS
  [adapter] readFile .../01-order-routing.md (N bytes)
  [monaco] setModel napkin-markdown
  [contentpane] refreshRoleDecorations (K decorations)
  ```
* verify: Monaco editor visible, content contains "Order", tab bar shows ephemeral tab
* where it breaks:
  * Sidebar click handler not calling store.openDoc
  * ContentPane useEffect not watching activeFilePath
  * LFS readFile fails (wrong path, encoding)
  * Monaco model creation fails (napkin-markdown not registered)

**DS-P3-03: editor auto-save + echo suppression**

* do: type `//DU: fragile` in editor
* expect in console:
  ```
  [contentpane] contentChanged → pinActiveEphemeral
  [store] pinActiveEphemeral → tab pinned
  [contentpane] autoSave debounce 1000ms
  [adapter] writeFile .../01-order-routing.md
  [adapter] emit { type: write, path: ... } (SUPPRESSED — own write)
  ```
* verify: tab is no longer italic. `cat` in terminal shows the edit. No cursor jump in editor.
* where it breaks:
  * echo suppression flag not set before writeFile
  * model layer re-reads own write → cursor jumps to top
  * pinActiveEphemeral not called on content change

**DS-P3-04: terminal write → editor refreshes**

* do: file open in editor. Switch to terminal. `echo "// injected" >> <filepath>`. Switch back.
* expect in console:
  ```
  [adapter] appendFile ...
  [adapter] emit { type: write, path: ... }
  [model] debounce 200ms → reloadFile
  [contentpane] externalChange → model.setValue (preserve cursor)
  ```
* verify: editor content includes "// injected"
* where it breaks:
  * adapter doesn't emit on appendFile (bash echo goes through adapter.appendFile)
  * model not subscribed to adapter change events
  * debounce timer lost between surface switches

### Phase 4: chrome plumbing

**DS-P4-01: Cmd+click file:line → GitHub tab navigates**

* do: set main-repo config via settings UI. Open chapter with file:line link. Cmd+click the link.
* expect in console:
  ```
  [links] detectLinks → found [order-router.ts:54]
  [links] routeLink → openCode
  [chrome] tabs.update → https://github.com/diunko/nap-test-main/.../order-router.ts#L54
  ```
* verify: GitHub tab URL contains `order-router.ts#L54`
* where it breaks:
  * detectLinks regex fails on napkin-markdown link format
  * routeLink misclassifies .ts as openDoc instead of openCode
  * chrome.tabs.update called with wrong tabId
  * main-repo config not persisted/loaded

**DS-P4-02: zoom persists**

* do: Ctrl+Shift+= twice, close panel, reopen
* expect in console:
  ```
  [chrome] zoom 1.0 → 1.1 → storage.sync.set
  [chrome] zoom 1.1 → 1.2 → storage.sync.set
  ... (after reopen) ...
  [chrome] zoom restore 1.2 from storage.sync
  ```
* verify: `document.documentElement.style.zoom === '1.2'`
* where it breaks: chrome.storage.sync not available in test context, zoom clamp wrong

---

## Part 2: Integration tests (the backbone)

### Small tests (vitest) — no browser, no LFS

These run in milliseconds. They verify the pure logic that the pipeline depends on.

#### IS-01: Store — tab lifecycle (port from app's tabs-store.test.ts)

The extension store is a subset of the app store. Same Tab interface, same upsertTab/removeTab pure functions, same actions. Port these tests 1:1, adjusting for:
* single pane (extension has tabs + activeSurface, no left/right split)
* no nepic memory (extension has single context)
* no ghost tabs (extension doesn't watch for file appearance)

| Test | Flow | Subsystems | Expected | Likely break |
|---|---|---|---|---|
| IS-01a | openDoc('a.md') | store.openDoc → upsertTab | tabs.length=1, ephemeral=true, activeFilePath='a.md' | upsertTab not creating tab |
| IS-01b | openDoc('a.md') then openDoc('b.md') | store.openDoc × 2 | tabs.length=1, path='b.md', same tab id reused | ephemeral slot not found |
| IS-01c | openDoc + pinTab | store.openDoc → pinTab | ephemeral=false | pinTab not flipping flag |
| IS-01d | pin A, openDoc B | upsertTab with no ephemeral | tabs.length=2, A permanent, B ephemeral | new tab not appended |
| IS-01e | pin A, pin B, close A | removeTab | tabs.length=1, active=B | neighbor selection wrong |
| IS-01f | openDoc, closeTab | removeTab | tabs.length=0, activeFilePath=null | activeFilePath not cleared |
| IS-01g | pinActiveEphemeral | openDoc → pinActiveEphemeral | ephemeral=false | active tab lookup wrong |

Verification: direct store state assertions (same as app tests).
Test size: small.

#### IS-02: Store — card focus

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| IS-02a | expandCard('0100') | focusedCardSlug='0100', cardViewMode='focused' | state not set |
| IS-02b | expandCard('0100') twice | focusedCardSlug=null, cardViewMode='collapsed' | toggle logic wrong |
| IS-02c | expandCard('0100') then expandCard('0200') | focusedCardSlug='0200' | previous card not unfocused |

Verification: store state assertions.
Test size: small.

#### IS-03: Store — activeSurface toggle

The extension adds `activeSurface: 'editor' | 'terminal'` (replaces the app's rightPaneMode). Verify surface switching updates the store correctly.

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| IS-03a | initial state | activeSurface='terminal' | wrong default |
| IS-03b | openDoc triggers surface switch | activeSurface='editor' | openDoc doesn't set activeSurface |

Verification: store state assertions.
Test size: small.

#### IS-04: Adapter emitter (extension-specific, no app equivalent)

The adapter emitter is the extension's replacement for fs.watch. Test the LightningFsAdapter's event emission. Mock LightningFS, verify events fire on write operations.

| Test | Flow | Subsystems | Expected | Likely break |
|---|---|---|---|---|
| IS-04a | adapter.writeFile('/a.md', 'content') | adapter → emitter | emit { type: 'write', path: '/a.md' } | emit not called after write |
| IS-04b | adapter.mkdir('/dir') | adapter → emitter | emit { type: 'mkdir', path: '/dir' } | mkdir path not tracked |
| IS-04c | adapter.rm('/a.md') | adapter → emitter | emit { type: 'rm', path: '/a.md' } | rm doesn't emit |
| IS-04d | adapter.appendFile('/a.md', 'more') | adapter → emitter | emit { type: 'write', path: '/a.md' } | appendFile not instrumented |
| IS-04e | 5 rapid writes in 50ms | adapter → emitter → subscriber | subscriber called once (after 200ms debounce) | debounce not applied |

Verification: spy on emitter callback, check call count and arguments.
Test size: small. Mock LightningFS with in-memory object.

NOTE: the current LightningFsAdapter (fs-adapter.ts) does NOT have an event emitter. The fs-eng must add one. The adapter tracks paths via `trackPath()`/`untrackPath()` — the emitter should fire at the same points. This is a design constraint from this test doc.

#### IS-05: Model — debounce + echo suppression

The model layer sits between the adapter emitter and the store. It debounces rapid events and suppresses echo (own writes). This is the critical wiring layer.

| Test | Flow | Subsystems | Expected | Likely break |
|---|---|---|---|---|
| IS-05a | emit write for activeFilePath | model → store | model calls store refreshNav or reloadFile | model not subscribed |
| IS-05b | 10 rapid write events | model debounce | single re-read after 200ms | debounce timer not reset on new event |
| IS-05c | emit write with echo flag set | model → (suppressed) | no re-read triggered | flag not checked |
| IS-05d | emit write for path NOT matching activeFilePath | model → check path | refreshNav called (not reloadFile) | path matching wrong |
| IS-05e | 'repo-changed' event | model → store.refreshNav | full nav refresh | repo-changed not handled |

Verification: spy on store actions (refreshNav, reloadFile). Use fake timers for debounce.
Test size: small.

#### IS-06: Pure logic (carry forward from existing extension vitest)

These already exist and pass. Copy them into ext-react, verify they still pass. No changes needed unless the module API changes.

| Module | Tests | What they verify |
|---|---|---|
| nav-tree.ts | numericPrefix, sortByPrefix, parseNavTree | directory convention parsing, numeric sort |
| link-routing.ts | parseLinkHref, buildGitHubUrl, routeLink | link classification, GitHub URL construction |
| content-link-provider.ts | detectLinks | three regex types, priority, overlap, bare paths |
| role-palette.ts | hashPrefix, roleDecoClass, generatePaletteCss | deterministic hash, known prefix colors |
| dot-style.ts | getDotStyle | role color + status shape mapping |
| theme.ts | shellToCssVars | CSS variable generation |

Test size: small.

#### IS-07: Store — persistence round-trip (extension-specific)

The extension persists to chrome.storage instead of electronAPI.saveUiState. Same pattern, different backend.

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| IS-07a | openDoc + expandCard → persist | chrome.storage.sync.set called with tabs, focusedCardSlug | persist not wired to store subscribe |
| IS-07b | restore from chrome.storage → store hydrated | tabs restored, focusedCardSlug restored, activeSurface correct | restore reads wrong keys |
| IS-07c | debounced persist (500ms) | 5 rapid state changes → 1 storage write | debounce timer not batching |

Verification: mock chrome.storage.sync, spy on set/get.
Test size: small.

---

### Medium tests (Playwright) — real panel, real LFS, real Chrome APIs

These are the backbone. They prove the pipeline works end-to-end. Each test is slow (git clone takes 10-30s) so there are few of them, and each one covers a lot.

#### IM-01: Push data flow — git clone → nav auto-populates

The single most important test. Proves the entire pipeline works: terminal → shell → onCommandComplete → model → store → React.

* flow: open panel → clone fixture repo → wait for nav tree
* subsystems: BashShell, isomorphic-git, onCommandComplete, model, store.refreshNav, parseNavTree, Sidebar
* expected:
  * nav tree shows "0100-delivery-pipeline" card with "doing" status
  * 3 agent dots visible (orange, green, gray)
  * "0200-crust-validation" visible as collapsed card
  * NO manual refresh (no __refreshNavTree call)
* verification:
  * DOM assertions: `.napkin-card` count, card text content, agent dot elements
  * Console trace: `[terminal] commandComplete` → `[model] repo-changed` → `[store] refreshNav` → `[sidebar] render`
* where it breaks:
  * onCommandComplete not detecting git clone
  * parseNavTree fails on LFS directory structure (async readDir returns wrong types)
  * Sidebar component not subscribed to navSections
* test size: medium
* maps to stories: S2, S14

#### IM-02: Push data flow — terminal write → editor sees

Proves adapter emitter → model → store → ContentPane re-render.

* flow: clone repo → open chapter in editor → switch to terminal → `echo "// terminal-note" >> <filepath>` → switch to editor
* subsystems: adapter.appendFile → emitter → model.debounce → store → ContentPane
* expected: editor content includes "// terminal-note"
* verification:
  * Read Monaco model value via `panel.evaluate(() => store.getState().activeFilePath)` then read editor content
  * Console trace: `[adapter] appendFile` → `[adapter] emit write` → `[model] debounce` → `[contentpane] externalChange`
* where it breaks:
  * adapter.appendFile not emitting change event
  * model debounce timer lost when switching surfaces
  * ContentPane not reloading on external change notification
* test size: medium
* maps to stories: S10

#### IM-03: Push data flow — editor write → terminal sees

Proves editor → auto-save → LFS → echo suppression works.

* flow: clone repo → open chapter → type `//DU: fragile` → wait for auto-save → switch to terminal → `cat <filepath>`
* subsystems: Monaco onChange → store.pinActiveEphemeral → debounced writeFile → adapter (echo suppressed)
* expected: `cat` output includes "//DU: fragile". Editor cursor did NOT jump.
* verification:
  * Terminal output assertion
  * Tab is no longer ephemeral (pinned on edit)
* where it breaks:
  * auto-save timer not firing
  * echo suppression flag not set → model re-reads own write → cursor jumps
* test size: medium
* maps to stories: S11

#### IM-04: Tab behavior end-to-end

Proves store tab logic + React rendering + user clicks work together.

* flow: clone → focus card → click file A → click file B → type in B → click file C
* subsystems: Sidebar click → store.openDoc → upsertTab → TabBar render → ContentPane load
* expected:
  * after A: 1 tab (ephemeral, italic)
  * after B: 1 tab (ephemeral, reused, shows B)
  * after typing in B: 1 tab (permanent, not italic)
  * after C: 2 tabs (B permanent, C ephemeral)
* verification:
  * DOM: tab count, tab labels, italic vs normal font-style
  * Store: tabs array length, ephemeral flags
* where it breaks:
  * TabBar not rendering ephemeral italic style
  * pinActiveEphemeral not called on Monaco content change
  * upsertTab not finding ephemeral slot
* test size: medium
* maps to stories: S5, S6, S7

#### IM-05: Link navigation — file:line → GitHub tab

Proves the two-repo bridge works: .nap content links navigate to the code repo on GitHub.

* flow: set main-repo config → open chapter → Cmd+click `[order-router.ts:54](/modules/delivery/order-router.ts#L54)`
* subsystems: detectLinks → routeLink → buildGitHubUrl → chrome.tabs.update → GitHub tab
* expected: GitHub tab URL contains `diunko/nap-test-main` + `order-router.ts` + `#L54`
* verification:
  * `ghPage.url()` assertion
  * No new pages created (reuses active tab)
* where it breaks:
  * detectLinks regex doesn't match napkin-markdown link format
  * routeLink returns openDoc instead of openCode for .ts files
  * chrome.tabs.update fails (wrong tab ID, permissions)
  * Cmd+click not intercepted by Monaco onMouseDown handler
* test size: medium
* maps to stories: S9

Port the `cmdClickLink` helper from existing fixtures.ts — it finds the link position via Monaco API and dispatches a real mousedown with metaKey. This is how the old extension tested it and it works.

#### IM-06: Link navigation — .md → stays in editor

Proves .md links load in the editor instead of navigating away.

* flow: open chapter 01 → Cmd+click "Next: 02-warp-queue.md" link
* subsystems: detectLinks → routeLink → store.openDoc → ContentPane loads new file
* expected: editor shows chapter 02 content, tab updates to "02-warp-queue.md" (ephemeral reuses)
* verification:
  * Monaco model value contains chapter 02 content
  * Tab label assertion
  * No GitHub tab navigation
* where it breaks:
  * routeLink misclassifies .md relative path
  * resolveRelative produces wrong absolute path
  * openDoc doesn't trigger ContentPane file reload
* test size: medium
* maps to stories: S4

#### IM-07: Persistence — chrome.storage round-trip

Proves state survives panel close/reopen.

* flow: clone → open chapter → focus card → close panel → reopen → verify state
* subsystems: store.subscribe → chrome.storage.sync.set → panel close → panel open → chrome.storage.sync.get → store hydrate
* expected:
  * nav tree repopulates (IDB has repo, no re-clone needed)
  * focused card restored
  * last open file available
* verification:
  * Nav tree DOM assertions after reopen
  * Store state assertions (focusedCardSlug, tabs)
* where it breaks:
  * beforeunload flush not firing
  * chrome.storage.sync keys wrong on restore
  * IDB cleared on panel close (shouldn't be)
* test size: medium
* maps to stories: S15

#### IM-08: Surface switching — editor ↔ terminal

Proves switching surfaces is clean — no flash of wrong theme, content preserved.

* flow: open chapter → scroll partway → switch to terminal → switch back
* subsystems: activeSurface toggle → CSS visibility → editor scroll preservation
* expected:
  * terminal: dark background (#1e1e1e), prompt visible
  * back to editor: same content, same scroll position
* verification:
  * CSS computed styles (terminal bg)
  * Monaco scrollTop before/after comparison
* where it breaks:
  * editor disposed on surface switch instead of hidden
  * scroll position lost on visibility toggle
  * terminal dark theme not applied
* test size: medium
* maps to stories: S8

---

## Part 3: Story coverage map

How each of the 15 stories is covered. "No separate test" means it's verified by another test — not that it's untested.

| Story | Coverage | Test ID | Notes |
|---|---|---|---|
| S1: first open | DS-P2-01 | debugging scenario | Layout verified by fs-eng during phase 2. Visual match to mock-e: manual check. |
| S2: clone + auto-populate | IM-01 | medium integration | THE critical test. Must pass before anything else matters. |
| S3: reading a chapter | IM-01 + IM-04 | medium integration | File click covered by IM-01 (nav) + IM-04 (tab). Tokenizer: IS-06 (carry-forward vitest). Role decorations: IM-03 (verify `//DU:` colored). |
| S4: navigate between chapters | IM-06 | medium integration | .md link → editor loads new file. |
| S5: ephemeral/permanent tabs | IS-01 + IM-04 | small + medium | Store logic: IS-01a-g. UI behavior: IM-04. |
| S6: close tabs | IS-01e,f + IM-04 | small + medium | removeTab + neighbor pick. |
| S7: tab content switching | IM-04 | medium integration | Click tab A → content A. Click tab B → content B. |
| S8: terminal round-trip | IM-08 | medium integration | Surface switch, dark theme, scroll preserved. |
| S9: file:line → GitHub | IM-05 | medium integration | The two-repo bridge. |
| S10: terminal → editor push | IM-02 | medium integration | Push data flow: adapter emitter → model → store → React. |
| S11: editor → terminal push | IM-03 | medium integration | Auto-save → LFS → echo suppression. |
| S12: card focus + nav scroll | IS-02 | small | Store logic only. Scroll-into-view: visual/manual. |
| S13: zoom | DS-P4-02 | debugging scenario | Simple enough for development-time check. Persistence: IS-07. |
| S14: nav full tree | IM-01 | medium integration | Part of clone → nav populates. Tree depth verified by DOM assertions. |
| S15: return visit | IM-07 | medium integration | Persistence round-trip. |

---

## What NOT to test

* visual layout matching mock-e — manual review against screenshot
* exact token colors — manual (tokenizer registration tested in IS-06, color values are theme config)
* CSS variable values — the theme module is a carry-forward, already tested
* resize handle pixel behavior — manual
* keyboard shortcuts beyond Cmd+click — manual (Shift-Enter tested implicitly through editing)
* chrome.storage.sync error handling — chrome guarantees the API, don't test the platform
* Monaco editor creation options — config is static, if it renders it's correct

---

## Test execution order

The fs-eng builds in phases. Tests should be runnable per phase:

1. **Phase 2** — run DS-P2-01, DS-P2-02 (panel renders, store works)
2. **Phase 2** — run IS-01 through IS-03 (store vitest, no browser needed)
3. **Phase 3** — run DS-P3-01 through DS-P3-04 (pipeline verification)
4. **Phase 3** — run IS-04, IS-05 (adapter emitter, model layer)
5. **Phase 3** — run IM-01 through IM-04, IM-06, IM-08 (Playwright integration)
6. **Phase 4** — run DS-P4-01, DS-P4-02 (chrome plumbing)
7. **Phase 4** — run IM-05, IM-07 (link navigation, persistence)
8. **Phase 4** — run IS-07 (persistence vitest)

The TE implements IM-01 through IM-08 after the fs-eng completes phase 3.
The fs-eng writes IS-01 through IS-05 during phase 2-3 (these shape the code).

---

## Design constraints for the fs-eng

This test architecture implies the following code structure requirements:

1. **The adapter MUST emit change events.** Add an EventEmitter (or simple callback array) to LightningFsAdapter. Every writeFile/mkdir/rm/appendFile emits `{ type, path }`. The model subscribes. IS-04 tests this.

2. **The model MUST be a separate layer.** Not inside the store, not inside a component. A function or closure that subscribes to adapter events, debounces, re-reads from LFS, and calls store actions. IS-05 tests this.

3. **Echo suppression MUST use a pending-writes flag.** Same pattern as app's `suppressExternalRef` in ContentPane.tsx. Set before auto-save write, clear after watcher echo delay. IS-05c tests this.

4. **Every state transition MUST log with a tagged prefix.** `[store]`, `[adapter]`, `[model]`, `[contentpane]`, `[sidebar]`, `[terminal]`, `[links]`, `[chrome]`. The debugging scenarios verify these traces. Leave logs on during development — they're the verification method.

5. **Store actions must be testable without a browser.** Same pattern as app: `useNapStore.getState().openDoc(path)` works in vitest. No DOM dependencies in store.ts.

6. **The Playwright fixture must pipe console.** `panel.on('console', msg => console.log(...))`. Every debugging scenario and integration test reads the trace.

7. **No `window.__` hooks for driving actions.** Use DOM clicks, keyboard input, and store.getState() for READING. The old extension's hooks masked real bugs. The exception: `store.getState().openDoc()` can be used to set up preconditions in Playwright tests (same as app's `window.__napStore__`), but the action being TESTED must go through the real UI path.
