# 0700-clean-quit — Test Architecture

## Seam Map

```
renderer store                       main process
  activeTerminalId                     before-quit event
  activeNepicId                          ↓
  sidebarVisible                     saveUiState() ← synchronous better-sqlite3
       ↑                                ↓
   IPC: ui-state:initial             ui_state table (single row, upsert)
       ↑                                ↓
   on launch                         loadUiState() → IPC to renderer
                                         ↓
                                     validate active_terminal_id
                                       exists in sessions? → use it
                                       missing? → fall back to architect
```

Five seams:
1. **before-quit → saveUiState** — renderer state captured to SQLite before ptys die
2. **launch → loadUiState → IPC** — SQLite row sent to renderer before first render
3. **active_terminal_id validation** — stale terminal references fall back to architect
4. **first launch (no row)** — graceful defaults when ui_state table is empty
5. **save ordering** — save completes before closeSessionStore / closeDatabase

## Critical Design Observations

- **Save is synchronous.** `better-sqlite3` runs in the main thread. An upsert on a single-row table is sub-millisecond. No async coordination needed — call `saveUiState()` in `before-quit`, done.
- **Save must happen before ptys die.** The `before-quit` event fires before `window-all-closed`. State must be captured here — after `killAllPtys()` the active terminal ID is meaningless.
- **Restore must happen before first render.** The renderer needs `activeTerminalId`, `activeNepicId`, and `sidebarVisible` before it creates the initial terminal and renders the sidebar. This means IPC handle (sync) or invoke (async with await) before store hydration.
- **The ui_state table already exists** (created in 0200 schema). Single row with `id = 1` check constraint. Upsert with `INSERT OR REPLACE`.
- **Terminal ID validation is the tricky part.** Between quit and relaunch, sessions may have been cleaned up, or the referenced pty may have crashed. `loadUiState` must check if `active_terminal_id` still exists in the sessions table. If not, the renderer falls back to architect (first terminal).

---

## T-0700-01: saveUiState writes correct values to ui_state table

* **Flow**: call `saveUiState({ activeNepicId, activeTerminalId, sidebarVisible })` → read `ui_state` row directly from db → values match
* **Subsystems**: session-store (or new ui-state module), database
* **Expected**: single row in ui_state with id=1, matching all three fields. Second call overwrites (upsert, not duplicate).
* **Where it breaks**: INSERT without ON CONFLICT → fails on second save. Boolean/integer mismatch for sidebar_visible. Null activeTerminalId not handled.
* **Test size**: medium
* **Verification**: `app.evaluate` — call `saveUiState(...)` with known values. Query db directly: `SELECT * FROM ui_state WHERE id = 1`. Assert all three columns match. Call again with different values — assert row updated, not duplicated.

---

## T-0700-02: loadUiState reads from ui_state table

* **Flow**: insert row into ui_state via raw SQL → call `loadUiState()` → returned object has correct values
* **Subsystems**: session-store (or new ui-state module), database
* **Expected**: returned object has `activeNepicId`, `activeTerminalId`, `sidebarVisible` matching the inserted row. `sidebarVisible` returned as boolean, not integer.
* **Where it breaks**: column name mismatch (snake_case in SQL vs camelCase in JS). Integer 1/0 not converted to boolean. Query returns undefined when no row exists.
* **Test size**: medium
* **Verification**: `app.evaluate` — insert a ui_state row with known values via `db.prepare(...).run(...)`. Call `loadUiState()`. Assert returned object fields match. Assert types (boolean for sidebarVisible).

---

## T-0700-03: first launch with no ui_state row returns defaults

* **Flow**: fresh database (no ui_state row) → `loadUiState()` → returns null or default object
* **Subsystems**: loadUiState, database
* **Expected**: returns null (or `{ activeNepicId: null, activeTerminalId: null, sidebarVisible: true }`). No crash, no undefined access.
* **Where it breaks**: `db.prepare(...).get()` returns undefined, code accesses `.active_nepic_id` on undefined → crash
* **Test size**: medium
* **Verification**: `app.evaluate` — ensure ui_state table is empty (`DELETE FROM ui_state`). Call `loadUiState()`. Assert result is null or has safe defaults. Assert no error thrown.

---

## T-0700-04: before-quit saves renderer state to SQLite

* **Flow**: app running → renderer has activeTerminalId, sidebarVisible=false, activeNepicId → trigger quit → after quit, read db file → ui_state row matches renderer state at quit time
* **Subsystems**: main.ts before-quit handler, IPC (main asks renderer for state), saveUiState
* **Expected**: ui_state row persists with the values the renderer had at quit time
* **Where it breaks**: before-quit handler not registered, or fires after closeDatabase (save fails silently), or renderer IPC reply doesn't arrive before quit proceeds
* **Test size**: medium
* **Verification**: `page.evaluate` — set store state: toggle sidebar off, switch to a known terminal. `app.evaluate` — trigger `app.quit()`. After quit, open the db file directly (new Database connection in test) and read ui_state. Assert `sidebar_visible = 0` and `active_terminal_id` matches.

---

## T-0700-05: restored UI state applies to renderer store on launch

* **Flow**: db has ui_state row with `sidebar_visible=0`, `active_terminal_id=<known-id>` → launch app → renderer store has `sidebarVisible=false`, correct active terminal
* **Subsystems**: main.ts startup, loadUiState, IPC to renderer, store hydration
* **Expected**: store reflects saved state immediately, before user interaction
* **Where it breaks**: store hydrated after first render (flash of default state), or IPC payload arrives but store ignores it, or terminal ID from db not yet in store.terminals when restore runs
* **Test size**: medium
* **Verification**: two-phase test. Phase 1: launch app, create a session, toggle sidebar off, quit. Phase 2: relaunch with same db. `page.evaluate` — assert `store.sidebarVisible === false`. Assert `store.activeTerminalId` matches saved ID (if session still exists).

---

## T-0700-06: stale active_terminal_id falls back to architect

* **Flow**: ui_state has `active_terminal_id = "dead-session-id"` → launch → that ID not in sessions table → renderer falls back to first terminal (architect)
* **Subsystems**: loadUiState validation, session lookup, renderer fallback logic
* **Expected**: app launches without error. Active terminal is the architect (first terminal created), not the stale ID.
* **Where it breaks**: renderer tries to activate a terminal that doesn't exist in store → null reference or blank panel. Or: validation happens in renderer but store.setActive is called before terminals array is populated.
* **Test size**: medium
* **Verification**: `app.evaluate` — insert ui_state row with `active_terminal_id = 'nonexistent-uuid'`. Launch app normally. `page.evaluate` — wait for first terminal to be created. Assert `store.activeTerminalId` is the first terminal's ID, not `'nonexistent-uuid'`.

---

## T-0700-07: sidebar_visible round-trips through quit/launch

* **Flow**: sidebar visible (default) → Cmd+B to hide → quit → relaunch → sidebar still hidden
* **Subsystems**: store.sidebarVisible, saveUiState, loadUiState, renderer hydration
* **Expected**: `sidebarVisible` persists as `false` across restart
* **Where it breaks**: sidebar_visible stored as integer 0 but loaded and compared with `=== false` (type mismatch), or save captures default `true` instead of toggled `false`
* **Test size**: medium
* **Verification**: `page.evaluate` — assert `sidebarVisible === true`. Toggle sidebar. Assert `sidebarVisible === false`. Quit. Relaunch. `page.evaluate` — assert `sidebarVisible === false` immediately after store hydration.

---

## T-0700-08: save does not block pty shutdown sequence

* **Flow**: before-quit fires → saveUiState runs (sync, <1ms) → killAllPtys runs → ptys exit → app quits
* **Subsystems**: before-quit handler, saveUiState timing, killAllPtys, pty exit callbacks
* **Expected**: total quit time with save is not measurably different from without. Ptys still killed. Exit callbacks still fire.
* **Where it breaks**: saveUiState accidentally async (returns Promise but not awaited — save never completes), or saveUiState throws (db already closed) and prevents pty cleanup
* **Test size**: medium
* **Verification**: `app.evaluate` — create 2 terminals. Record `Date.now()`. Quit app. Measure time from quit signal to app close. Assert < 3s (2s timeout + margin). Assert both pty exit events fired (check session statuses in db or via event count).

---

## T-0700-09: quit sequence ordering — save before close

* **Flow**: quit → saveUiState → stopNapkinWatcher → stopSocketServer → closeSessionStore → closeDatabase
* **Subsystems**: main.ts event handlers (before-quit, will-quit, window-all-closed)
* **Expected**: saveUiState completes while db is still open. closeDatabase runs last.
* **Where it breaks**: saveUiState placed in `will-quit` handler after `closeSessionStore()` (db reference nulled) → silent failure or crash. Or: event ordering different on macOS vs Linux.
* **Test size**: medium
* **Verification**: `app.evaluate` — monkey-patch `closeDatabase` to record call order. Quit app. Assert saveUiState was called before closeDatabase. Alternatively: after quit, open db file and verify ui_state row exists (proves save ran before close).

---

## T-0700-10: corrupted ui_state — invalid nepic ID

* **Flow**: ui_state has `active_nepic_id = 'deleted-nepic'` → launch → nepic not found → fall back to default nepic
* **Subsystems**: loadUiState, nepic validation, renderer store
* **Expected**: app launches normally. Falls back to first available nepic or default.
* **Where it breaks**: renderer tries to load a nepic that doesn't exist → empty sidebar, no napkins shown
* **Test size**: medium
* **Verification**: `app.evaluate` — insert ui_state with invalid `active_nepic_id`. Launch. `page.evaluate` — assert `store.activeNepicId` is the valid default, not the invalid one from db.

---

## T-0700-11: existing quit flow still works — ptys killed, socket cleaned, db closed

* **Flow**: run existing quit tests — all ptys killed, socket file removed, db connection closed, no hanging processes
* **Subsystems**: all quit-related handlers
* **Expected**: zero regressions. Adding saveUiState doesn't break the existing shutdown sequence.
* **Where it breaks**: new before-quit handler calls `event.preventDefault()` (turns quit into a negotiation), or throws an error that prevents remaining handlers from running
* **Test size**: medium
* **Verification**: launch app with 2 terminals. Quit. Assert: no pty processes remain (pendingExits === 0), socket file cleaned up, db file exists but connection closed. This is a regression guard, not a new behavior.

---

## Test Count Summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 0     | — |
| Medium | 11    | T-01 through T-11 |
| Big    | 0     | — |

No small tests: all seams involve SQLite or Electron lifecycle — native modules require medium (Playwright) tests.

## Priority Order

1. **T-01, T-02, T-03** — save/load foundation: if saveUiState and loadUiState don't work, nothing else matters
2. **T-04, T-05** — integration: before-quit actually saves, launch actually restores
3. **T-06** — stale terminal fallback: the most likely failure mode in real usage
4. **T-07** — sidebar round-trip: validates the full persist/restore cycle for a concrete field
5. **T-09** — ordering: save before close — the shutdown race that spec calls out
6. **T-08** — performance: save must not delay quit
7. **T-10** — corrupted state: defensive edge case
8. **T-11** — regression: existing quit flow unbroken

## Notes for Implementer

- **saveUiState and loadUiState belong in session-store.ts** (or a new `ui-state.ts`). They need the db reference. Spec says add to session-store — follow that.
- **Save goes in `before-quit`, not `will-quit`.** The `will-quit` handler in main.ts already calls `closeSessionStore()` and `closeDatabase()`. Save must happen before both. Use `app.on('before-quit', ...)` which fires before `window-all-closed` and `will-quit`.
- **Renderer state capture options**: (a) main process asks renderer via IPC for current state (async, could race), or (b) renderer pushes state to main on every change (overhead), or (c) main process tracks state independently via IPC events it already receives. Option (c) is simplest — main already handles `sidebar:toggle` IPC, can track `activeTerminalId` from `pty:create`/`pty:ready` events. But spec says "save to SQLite on quit" which implies reading current state at quit time. Option (a) with a synchronous IPC invoke is cleanest.
- **Test T-05 needs two app launches.** Playwright can't relaunch mid-test easily. Structure as: launch → set state → quit → cleanup → launch again with same tmpDir → verify. The db file in tmpDir persists across launches.
- **The ui_state CHECK constraint (id=1)** enforces single-row. Use `INSERT OR REPLACE INTO ui_state (id, ...) VALUES (1, ...)`.
- **sidebarVisible type conversion**: SQLite stores INTEGER (0/1). JS side must convert to boolean. Use `!!row.sidebar_visible` or explicit comparison.

## What NOT to test here

- SQLite schema creation (ui_state table) — tested in 0200
- Terminal mechanics (pty spawn, buffer, scroll) — tested in earlier napkins
- Filesystem service behavior on quit — tested in 0500
- Session status persistence (`setSessionStatus`, `setSessionDone`) — already works, tested in 0200/0300
- Crash recovery — explicitly out of scope (0900-reconciliation handles that)
- Architect resume (`claude --resume`) — that's 0800-architect-resume
