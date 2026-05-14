# v3 async race conditions — test architecture

Evidence-first. Every test below reproduces a specific race. If the test passes, the race doesn't exist (or was fixed). If it fails, the race is real.

Organized by subsystem. Size = small unless noted.

---

## 1. ContentPane file load — no cancellation

The async IIFE in the file load effect (ContentPane.tsx:397-455) captures `activeFilePath` from effect deps, awaits `fileRead`, then sets the model on the editor. No stale guard after the await.

### T-RACE-01: Rapid tab switch — editor shows stale file

**Setup:** Mock `fileRead` to resolve with delays: file-A resolves after 200ms, file-B resolves after 50ms.
**Action:** `openDoc('/a.md')`, immediately `openDoc('/b.md')`.
**Assert:** After both resolve, editor model contains B's content, NOT A's. `activeFilePath` is `/b.md`.
**What breaks:** B resolves first (50ms), sets model. A resolves second (200ms), overwrites with stale content. User sees A's content in B's tab.
**Where:** ContentPane.tsx:398 (await with no stale guard), :430-432 (model set unconditionally).
**Size:** Medium — needs real ContentPane + Monaco.

### T-RACE-02: Tab switch during file load — fileWatch set to wrong file

**Setup:** Same delayed fileRead mock.
**Action:** `openDoc('/a.md')`, immediately `openDoc('/b.md')`.
**Assert:** `fileWatch` was last called with `/b.md`, not `/a.md`.
**What breaks:** A's IIFE completes after B's, calls `fileWatch('/a.md')` (ContentPane.tsx:436), overwriting B's watcher.
**Where:** ContentPane.tsx:436.
**Size:** Medium.

---

## 2. TerminalPane CodeEditor — same race

Identical pattern in TerminalPane.tsx:109-158. The code editor for the right pane has the same async IIFE with no stale check.

### T-RACE-03: Rapid code file switch — right pane shows stale file

**Setup:** Mock `fileRead` with staggered delays.
**Action:** `openCode({ path: '/a.ts' })`, immediately `openCode({ path: '/b.ts' })`.
**Assert:** Right pane editor model contains B's content.
**Where:** TerminalPane.tsx:124 (await), :131-132 (model set).
**Size:** Medium.

---

## 3. loadFromFilesystem reentrancy

`loadFromFilesystem` (model.ts:247-393) assigns `napkins` at line 296 and `architects` at line 347. Between those lines are ~50 lines of awaits (reading agent dirs, parsing markers). A second concurrent call overwrites one array while the first is still building the other.

### T-RACE-04: Concurrent loadFromFilesystem — napkins from call A, architects from call B

**Setup:** Create a fixture with 2 napkins and 2 architects. Create the model.
**Action:** Call `loadFromFilesystem(dir)` twice concurrently (no await between them). Inject a delay in the filesystem mock (50ms per readdir call) so the calls interleave.
**Assert:** After both resolve, `model.getNapkins()` and `model.getArchitects()` are from the SAME snapshot — not a mix.
**What breaks:** napkins from the first call, architects from the second (or vice versa). The model is internally inconsistent.
**Where:** model.ts:296 and :347 — two separate assignments with awaits between them.
**Size:** Small — can use MemoryFileSystem with injected delays.

### T-RACE-05: Watcher reload during nepic switch

**Setup:** Create fixture. Load model. Start watching.
**Action:** Trigger `switchNepic(newSlug)` (which calls `loadFromFilesystem`) AND simultaneously trigger a watcher event (which debounces then calls `loadFromFilesystem`). Set debounce to 0ms for the test.
**Assert:** Model state is consistent (not a mix of old and new nepic).
**Where:** model.ts:407 (`await loadFromFilesystem(nepicDir)`) racing with :1022 (`await loadFromFilesystem(newDir)`).
**Size:** Small.

---

## 4. hasPendingWrite — single boolean, 14 writers

A single boolean flag guards against watcher-triggered reloads after writes. 14 call sites set it `true`. 2 sites set it `false`. If two writes happen before the debounce fires, the first watcher event clears the flag, and the second write's event triggers a full reload.

### T-RACE-06: Two rapid writes — second triggers unwanted reload

**Setup:** Create fixture. Load model. Wire up watcher with minimal debounce.
**Action:** Call `setAgentExitedById(agentA)` then `setAgentDone(agentB)` without waiting for the debounce between them.
**Assert:** No `loadFromFilesystem` is triggered. Both in-memory flags survive.
**What breaks:** First watcher event clears `hasPendingWrite` (model.ts:404). Second watcher event sees `hasPendingWrite === false`, triggers reload, reads stale disk (if the second write hasn't flushed yet).
**Where:** model.ts:403-405 (flag check and clear), 14 set-true sites.
**Size:** Small — can mock filesystem + watcher timing.

---

## 5. ContentWatcher.watch() — async stop-start leak

`watch(filePath)` calls `await this.stop()` then `this.subscription = await watcher.subscribe(...)` (content-watcher.ts:36-52). Two rapid calls can leak the first subscription.

### T-RACE-07: Rapid watch(A) then watch(B) — subscription A leaks

**Setup:** Create ContentWatcher with a mock onChange.
**Action:** Call `watch('/a.md')` and `watch('/b.md')` without awaiting the first.
**Assert:** Only ONE active subscription exists (for `/b.md`). Writing to `/a.md` does NOT trigger onChange.
**What breaks:** Both subscriptions run. A's subscription is stored on `this.subscription`, then overwritten by B's. A's subscription is never unsubscribed.
**Where:** content-watcher.ts:36 (`await this.stop()`) and :52 (`this.subscription = ...`).
**Size:** Medium — needs real @parcel/watcher or a mock that simulates async subscribe.

---

## 6. setAgentDone — memory before disk

`setAgentDone` (model.ts:546-560) sets `agent.done = true` and calls `notify()` BEFORE the disk write. A watcher-triggered reload between notify and disk write reads stale disk state.

Compare with `setAgentExitedById` (model.ts:510-531) which writes disk FIRST — the correct order.

### T-RACE-08: setAgentDone + immediate watcher reload — done flag lost

**Setup:** Create fixture with one started agent. Load model with minimal watcher debounce.
**Action:** Call `setAgentDone(agentId)`. Before the disk write completes, trigger `loadFromFilesystem` (simulating a watcher reload).
**Assert:** After reload, `agent.done === true`.
**What breaks:** Reload reads disk (no `done: true` yet), overwrites in-memory `done: true` with `done: false/undefined`.
**Where:** model.ts:551-552 (memory+notify) vs :559-560 (disk write).
**Size:** Small — mock filesystem with write delay.

---

## 7. socket-handler doesn't await setAgentDone

Line 86 of socket-handler.ts calls `model.setAgentDone(sessionId)` without `await`. The response is sent immediately. If the agent's pty exits right after `done`, the exit handler may read stale disk state.

### T-RACE-09: nap3 done + immediate agent exit — done flag lost

**Setup:** Create fixture with running agent. Wire socket handler + model.
**Action:** Send `{ type: 'done' }` through the socket handler. Immediately call `model.setAgentExitedById(agentId)`.
**Assert:** After both complete, `agent.done === true` AND `agent.exited === true`.
**What breaks:** `setAgentExitedById` reads the marker file before `setAgentDone` has written `done: true`. The marker is written without `done`. Then `setAgentDone`'s write runs and sets `done: true` but `setAgentExitedById` already read/wrote the marker without it. Depending on write order, `done` may survive or be lost.
**Where:** socket-handler.ts:86 (no await), model.ts:522-525 (reads marker), model.ts:559-560 (writes done).
**Size:** Small.

---

## 8. loadPersistedUiState — watchers before store

Ghost tab watchers are started (store.ts:562) inside the tab restoration loop, but `useNapStore.setState(updates)` happens at line 609 — much later. If a ghost file appears during the loop, `promoteGhostTab` finds no matching tab.

### T-RACE-10: Ghost file appears during tab restore — promotion silently fails

**Setup:** Mock `loadUiState` to return 3 tabs (middle one ghost). Mock `fileRead` for the ghost to return null, then resolve.
**Action:** Call `loadPersistedUiState()`. After `watchGhost` is called but before `setState`, simulate a `ghost-appeared` event for the ghost path.
**Assert:** After `loadPersistedUiState` completes, the middle tab is NOT ghost (was promoted).
**What breaks:** `promoteGhostTab` runs at the moment of the event, finds no tab with that path in the store (tabs aren't setState'd yet), does nothing. Tab stays ghost even though file exists.
**Where:** store.ts:562 (watchGhost) vs :609 (setState).
**Size:** Small.

---

## 9. applySnapshot during loadPersistedUiState

Snapshots arrive from main via IPC at any time. `loadPersistedUiState` has multiple `await` points. A snapshot between them can overwrite partially-applied state.

### T-RACE-11: Snapshot arrives mid-restore — persisted tabs lost

**Setup:** Mock `loadUiState` to return saved tabs and focusedCardSlug. Mock `fileRead` with 100ms delay.
**Action:** Start `loadPersistedUiState()`. While `fileRead` is pending (between await points), call `applySnapshot` with a new nepic.
**Assert:** After restore completes, persisted tabs exist in the store.
**What breaks:** `applySnapshot` sets `leftTabs: []` (nepic switch clears tabs). `loadPersistedUiState` then calls `setState` with its tabs, but if applySnapshot ran after the final setState... actually the ordering depends on the microtask queue. The real issue: `loadPersistedUiState` reads `useNapStore.getState().napkins` (line 526) to validate focusedCardSlug. If snapshot hasn't arrived yet, napkins is empty, slug doesn't match, card state lost.
**Where:** store.ts:526 (reads current napkins) — timing-dependent on whether snapshot has arrived.
**Size:** Small.

---

## 10. spawnSuccessor — in-place mutation during async

`spawnSuccessor` (model.ts:592-636) mutates `agent.id` at line 609, then does async disk operations through line 632. Between mutation and disk write, `findAgentById(oldId)` fails and `findAgentById(newId)` returns the agent with stale disk state.

### T-RACE-12: Concurrent status query during spawnSuccessor — stale id

**Setup:** Create fixture with an archived agent. Load model.
**Action:** Start `spawnSuccessor(oldId)`. After `agent.id = newId` (line 609) but before disk write completes, call `model.getStatus({ agent: oldId })`.
**Assert:** Status query either returns the agent (by old or new id) or explicitly reports "spawning successor". Should NOT return "not found".
**What breaks:** `findAgentById(oldId)` can't find the agent (id already changed to newId). Query returns nothing. CLI shows "agent not found" for an agent that exists.
**Where:** model.ts:609 (id mutation) vs :632 (disk write completion).
**Size:** Small.

---

## 11. saveUiState — read-merge-write race

`saveUiState` (model.ts:656-665) reads the file, merges, writes. Two concurrent calls lose the first call's changes.

### T-RACE-13: Concurrent saveUiState — first call's fields lost

**Setup:** Write `{ theme: "dark" }` to ui-state.json. 
**Action:** Call `saveUiState({ focusedCardSlug: "A" })` and `saveUiState({ debugPanelCollapsed: true })` concurrently (no await between).
**Assert:** After both complete, file contains ALL THREE fields: theme, focusedCardSlug, debugPanelCollapsed.
**What breaks:** Both calls read `{ theme: "dark" }`, merge independently, write independently. Second write has `{ theme: "dark", debugPanelCollapsed: true }` — missing `focusedCardSlug`.
**Where:** model.ts:661 (read), :663 (merge), :664 (write).
**Size:** Small.

---

## 12. Echo suppression — timing mismatch

Two independent suppression layers: main process `pendingContentWrites` (300ms, main.ts:236) and renderer `suppressExternalRef` (500ms after a 1000ms save debounce, ContentPane.tsx:215). Neither is synchronized with actual filesystem event delivery.

### T-RACE-14: Slow watcher echo arrives after suppression window

**Setup:** Boot app. Open file. Edit content (triggers 1000ms save debounce).
**Action:** Save fires. Watcher echo arrives at 400ms after write (outside main's 300ms window but inside renderer's 500ms window).
**Assert:** No content reload/flicker occurs.
**What breaks:** Main's `pendingContentWrites` cleared at 300ms. Watcher event at 400ms passes the main-side check, content is sent to renderer. Renderer's `suppressExternalRef` catches it (500ms window). But if renderer save debounce was different timing, the 500ms window might also have expired.
**Where:** main.ts:236 (300ms clear) vs ContentPane.tsx:215 (500ms clear).
**Size:** Medium — needs real file write + watcher timing.

---

## 13. nepic switch/create — no concurrency guard

`nepic:switch` (main.ts:348) and `nepic:create` (main.ts:358) both call async model operations with no lock. Double-clicking can start two concurrent switches.

### T-RACE-15: Double nepic switch — watchers stopped permanently

**Setup:** Create fixture with 2 nepics. Boot app.
**Action:** Call `nepic:switch('nepic-A')` and `nepic:switch('nepic-B')` concurrently.
**Assert:** After both resolve, file watcher is active for the final nepic. Model state is consistent.
**What breaks:** Switch-A calls `stopWatching()`, `loadFromFilesystem(A)`, `startWatching(A)`. Switch-B calls `stopWatching()` (kills A's watchers), `loadFromFilesystem(B)`, `startWatching(B)`. But if B's `stopWatching()` runs between A's `startWatching()` and A's completion, A's watchers are killed and B's watchers are the only ones running — which is correct. But if A's `startWatching()` runs AFTER B's `startWatching()`, A's watchers overwrite B's, and the app watches the wrong nepic.
**Where:** model.ts switchNepicFn:1018-1026 — `stopWatching` + `loadFromFilesystem` + `startWatching` is not atomic.
**Size:** Small — can test model directly.

---

## 14. GhostWatcher — concurrent watch for same dir

`watch(filePath)` (ghost-watcher.ts:23-61) checks `dirWatches.get(dirPath)` at line 26, then awaits `watcher.subscribe(dirPath)` at line 33. Two concurrent calls for different files in the same directory both pass the existence check and create duplicate subscriptions.

### T-RACE-16: Two ghost files in same dir — duplicate subscription

**Setup:** Create GhostWatcher.
**Action:** Call `watch('/dir/a.md')` and `watch('/dir/b.md')` concurrently (without awaiting the first).
**Assert:** Only one @parcel/watcher subscription exists for `/dir/`. Both ghost files are tracked.
**What breaks:** Both calls see `!this.dirWatches.get('/dir/')`, both create subscriptions. Second `set()` overwrites first. First subscription leaks.
**Where:** ghost-watcher.ts:26-28 (existence check) and :60 (set after await).
**Size:** Small — can mock watcher.subscribe.

---

## Test fixtures

### FX-RACE-A: Delayed file reads

Mock `window.electronAPI.fileRead` that resolves different files at different delays:
```
fileRead('/a.md') → resolves in 200ms with "content A"
fileRead('/b.md') → resolves in 50ms with "content B"
```
Used by: T-RACE-01, 02, 03.

### FX-RACE-B: Model with watcher at minimal debounce

Create model with `DEBOUNCE_MS = 0` (or 10ms). Allows testing watcher-triggered reloads that interleave with direct model mutations.
Used by: T-RACE-04, 05, 06, 08.

### FX-RACE-C: Two-nepic fixture

Two nepic directories with distinct napkins and architects. For nepic switch race tests.
Used by: T-RACE-05, 15.

---

## Priority order

1. T-RACE-01 (ContentPane stale file) — critical, most user-facing
2. T-RACE-06 (hasPendingWrite) — critical, causes phantom running agents
3. T-RACE-04 (loadFromFilesystem reentrancy) — critical, model corruption
4. T-RACE-08 (setAgentDone memory-before-disk) — medium, lost done flags
5. T-RACE-09 (socket-handler no await) — medium, compounds with 08
6. T-RACE-13 (saveUiState lost update) — medium, session state loss
7. T-RACE-10 (ghost promotion during restore) — medium, ghost tabs stuck
8. T-RACE-07 (ContentWatcher leak) — medium, resource leak
9. T-RACE-11 (snapshot during restore) — medium, startup race
10. Rest
