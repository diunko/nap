# ext-react — state isolation test architecture

## The lesson from the first round

The ext-react rewrite gave us React + Zustand + a model layer. The push data flow works. But everything is hardcoded to a single global context:

* `LightningFS('nap-ext')` — one filesystem
* `chrome.storage.sync` key `'napState'` — one UI state blob
* `useNapStore` — one store, module-level singleton

This means:
* open PR 42, clone repo, read chapters, add comments
* navigate to PR 87 — same panel, same state, same filesystem
* your PR 42 tabs, focused card, and terminal history are still showing
* the cloned repo is PR 42's repo, not PR 87's

The extension side panel persists across Chrome tabs. It doesn't reload when you navigate. Two PRs open in two Chrome windows share the same IndexedDB.

## What "done" means

Input a key, get an isolated state. Change the key, get a different filesystem and different UI state. No cross-contamination.

```
Session("pr-42")                 Session("pr-87")
  LFS: nap-fs-pr-42               LFS: nap-fs-pr-87
  UI:  nap-ui-pr-42               UI:  nap-ui-pr-87
  completely independent           completely independent
```

## What we're testing

The session boundary is the architecture:

```
state key (from URL hash or default)
    |
    ├── LightningFS(`nap-fs-${key}`)  — isolated filesystem
    ├── Zustand store (persist → IDB `nap-ui-${key}`)  — isolated UI state
    └── Model (adapter from this LFS, store from this session)
```

If a test changes state in session A and session B sees it, the isolation is broken and everything downstream is broken.

---

## Part 1: Small tests (vitest) — no browser, no panel

These verify the session factory and the persistence layer in isolation. Fast, deterministic.

### SS-01: Store factory — different keys produce independent stores

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-01a | createStore('pr-42'), openDoc('a.md') | pr-42 has 1 tab, activeFilePath='a.md' | — |
| SS-01b | createStore('pr-87'), read state | pr-87 has 0 tabs, activeFilePath=null | Store is a singleton, second create returns same instance |
| SS-01c | read pr-42 state again | Still has 1 tab, activeFilePath='a.md' | Second create wiped first |

Verification: direct store state assertions.
Where it breaks: store is still a module-level singleton (`export const useNapStore = create(...)`) instead of a factory.

### SS-02: Store factory — actions in one don't affect the other

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-02a | pr-42: openDoc('a.md'), expandCard('0100') | pr-42 state set | — |
| SS-02b | pr-87: openDoc('x.md'), expandCard('0200') | pr-87 state set, independent | Shared state |
| SS-02c | read pr-42 | activeFilePath='a.md', focusedCardSlug='0100' | Overwritten by pr-87 |
| SS-02d | read pr-87 | activeFilePath='x.md', focusedCardSlug='0200' | Overwritten by pr-42 |

Verification: state assertions on each store independently.

### SS-03: Persistence — save and restore per key

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-03a | createStore('pr-42'), set state, wait for persist | State written to IDB under 'nap-ui-pr-42' | Persist middleware not wired |
| SS-03b | destroy store, createStore('pr-42') again | State hydrated: tabs, activeFilePath, focusedCardSlug match | Hydration reads wrong key |
| SS-03c | createStore('pr-87') | Empty — not pr-42's state | Single key, no isolation |

Verification: state assertions after hydration.
Test size: small. Mock IDB or use a real in-memory IDB (e.g., fake-indexeddb).

### SS-04: LFS isolation — different keys, different filesystems

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-04a | LFS('nap-fs-pr-42'), write file '/a.md' | File exists | — |
| SS-04b | LFS('nap-fs-pr-87'), readdir('/') | Empty — no '/a.md' | Same DB name, shared filesystem |
| SS-04c | LFS('nap-fs-pr-42'), readFile('/a.md') | Content matches what was written | — |

Verification: LFS read/write assertions.
Test size: small. LightningFS with different store names.

### SS-05: Session factory — creates tied LFS + store

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-05a | createSession('pr-42') | Returns { key, lfs, adapter, store } | — |
| SS-05b | session.lfs store name contains 'pr-42' | LFS uses 'nap-fs-pr-42' | Hardcoded name |
| SS-05c | session.store persists to 'nap-ui-pr-42' | Persist key matches | Hardcoded key |
| SS-05d | createSession('pr-87'), verify independent | Different lfs, different store | Shared instances |

Verification: inspect session properties and state independence.

### SS-06: Wipe per key — cleanup is scoped

| Test | Flow | Expected | Likely break |
|---|---|---|---|
| SS-06a | populate 'pr-42' and 'pr-87' (store + LFS) | Both have data | — |
| SS-06b | wipe('pr-42') | pr-42 store empty, pr-42 LFS empty | — |
| SS-06c | read 'pr-87' | Untouched — still has data | Wipe deleted everything |

Verification: state + filesystem assertions after wipe.

---

## Part 2: Medium tests (Playwright) — real panel, real Chrome

These verify the session system works in the actual extension context.

### SM-01: Key switch at runtime — panel resets

* flow: open panel with key 'default' → clone repo, open file, focus card → switch key to 'pr-99' → verify clean → switch back to 'default' → verify restored
* subsystems: session factory, store hydration, model init, LFS isolation, sidebar, editor
* expected:
  * after switch to 'pr-99': nav empty, no tabs, no file open, terminal shows fresh prompt
  * after switch back to 'default': nav repopulates from IDB, tabs restored, editor loads file
* verification:
  * model level: store state assertions (navSections, tabs, activeFilePath)
  * DOM level: napkin cards visible/absent, editor content present/absent, terminal prompt
* where it breaks:
  * store singleton not replaced on key switch
  * LFS instance not recreated
  * model still subscribed to old adapter events
  * React components still reading from old store
* test size: medium
* maps to stories: S15 (return visit, extended to multi-context)

### SM-02: Persistence across key switch

* flow: session 'pr-42' → set up state → close panel → reopen with key 'pr-42' → verify restored → reopen with key 'pr-87' → verify empty
* subsystems: Zustand persist middleware, IDB adapter, session factory
* expected:
  * reopen 'pr-42': state matches what was saved
  * reopen 'pr-87': fresh state, no bleed
* verification:
  * store state assertions
  * DOM: nav, tabs, editor content
* where it breaks:
  * persist writes to wrong key
  * hydration reads from wrong key
  * IDB key not parameterized
* test size: medium

### SM-03: Two windows — simultaneous independent sessions

* flow: window 1 with key 'pr-42' → clone, open file. Window 2 with key 'pr-87' → verify empty. Modify state in window 1 → verify window 2 unaffected.
* subsystems: session factory, IDB isolation, Chrome per-window side panels
* expected:
  * window 2 has no repo, no tabs (different LFS database)
  * changes in window 1 don't appear in window 2
* verification:
  * store and DOM assertions in each window
* where it breaks:
  * shared IDB database name
  * shared store singleton
* test size: medium (requires two Playwright browser contexts)
* note: may not be feasible in Playwright if Chrome only allows one side panel. The vitest SS-01/SS-02 cover the same isolation guarantee at the data level.

---

## Part 3: Design constraints for the fs-eng

This test architecture implies the following code structure requirements:

1. **The store MUST be a factory, not a singleton.** `createNapStore(key)` returns an independent store instance. The persist middleware uses `key` for its IDB record name. Components access the store via React context, not by importing a global.

2. **LFS MUST be parameterized by key.** `new LightningFS('nap-fs-' + key)` — different key, different IDB database. The adapter wraps this LFS instance.

3. **The session factory ties them together.** `createSession(key)` returns `{ key, lfs, adapter, store, model }`. One function, one key, everything derived from it. No way to accidentally mix keys.

4. **The model MUST be created per session.** It subscribes to the session's adapter, dispatches to the session's store. When the session changes, the old model is destroyed and a new one created.

5. **Components MUST use a context provider for the session.** Not `import { useNapStore } from './store'`. Instead: `const { store } = useSession()`. This allows runtime session switching — new key → new context → all components re-render with new state.

6. **Zustand persist middleware with IndexedDB adapter.** Replaces the manual chrome.storage.sync code. The `name` parameter is the state key. `partialize` controls which fields persist. `onRehydrateStorage` triggers model.init() after hydration.

7. **`getStateKey()` returns the current key.** Synchronous. Reads from URL hash (napkin 0400) or returns 'default'. Called once per session creation.

---

## What NOT to test

* IndexedDB internals — the browser guarantees the API
* Zustand persist middleware internals — the library is tested
* LightningFS isolation — it uses different IDB database names, that's a browser guarantee
* The URL hash parsing — that's napkin 0400

What we DO test: that our code passes the right key to the right place, and that the result is isolated state.

---

## Test execution order

1. **SS-01 through SS-06** — vitest, no browser. Define the session factory API.
2. **SM-01** — Playwright. Key switch at runtime. The critical integration test.
3. **SM-02** — Playwright. Persistence across key switch.
4. **SM-03** — Playwright or vitest fallback. Two simultaneous sessions.
