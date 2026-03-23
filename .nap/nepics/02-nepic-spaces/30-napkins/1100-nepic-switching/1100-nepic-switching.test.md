## Test Architecture — 1100-nepic-switching

Click nepic icon in gutter to swap sidebar and terminal context. All other nepics' sessions keep running.

### What does NOT exist yet

The store's `setActiveNepic(id)` only sets `activeNepicId` in renderer state. No IPC to main. No side effects.

Missing pieces:
1. IPC handler for nepic switch in main.ts — receives nepicId, updates SQLite `is_active` (deactivate all, activate target), restarts napkin watcher on new nepic's `30-napkins/`, sends napkin statuses from SQLite, returns architect session info for the new nepic
2. Renderer-side `setActiveNepic` needs IPC call to main — currently a one-liner `set({ activeNepicId: id })`
3. Terminal switching logic — find the new nepic's architect (or last viewed agent) session, set it active. If no session exists, show empty terminal state.
4. Napkin data reload — sidebar must clear old napkins and show new nepic's napkins (from watcher full scan)
5. SQLite: no `setNepicActive(id)` function exists — `createNepicRow` deactivates all then inserts, but we need deactivate-all + activate-existing

### Seams

1. **Gutter click → store → IPC** — user clicks nepic icon, `setActiveNepic` triggers IPC to main
2. **SQLite is_active toggle** — old nepic deactivated, target nepic activated, exactly one active
3. **Napkin watcher switch** — stops old watcher, starts new on target nepic's `30-napkins/`
4. **Napkin data delivery** — renderer receives full scan of new nepic's napkins via `napkin:update` IPC
5. **Napkin statuses from SQLite** — statuses for new nepic's napkins sent via `napkin:status-changed`
6. **Terminal context switch** — activeTerminalId changes to new nepic's architect (or last agent)
7. **Previous sessions survive** — all ptys keep running, no kills
8. **ui_state persistence** — new activeNepicId saved so restart remembers which nepic was active
9. **Round-trip** — switch away, switch back, everything as left

---

### T-1100-01: SQLite is_active — target nepic becomes active

- **Flow**: pre-create two nepics in SQLite (A active, B inactive). Trigger switch to B.
- **Subsystems**: nepic switch handler, SQLite nepics table
- **Expected**: A has is_active=0. B has is_active=1. `SELECT COUNT(*) FROM nepics WHERE is_active=1` = 1.
- **Breaks when**: update only sets target active without deactivating others, or deactivation clears the target too (order bug).
- **Size**: medium
- **Verification**: `app.evaluate` → trigger switch IPC, then query nepics table. Assert exactly one row active and it's B.

### T-1100-02: napkin watcher restarts on new nepic dir

- **Flow**: create two nepics with distinct napkin dirs (each has a `30-napkins/` with different napkin slugs). Switch from A to B.
- **Subsystems**: nepic switch handler, napkin-watcher (stop + start)
- **Expected**: after switch, renderer receives `napkin:update` with B's napkins (not A's). A's napkin data no longer streams to renderer on file changes.
- **Breaks when**: watcher not restarted (keeps watching A), or `stopNapkinWatcher` not called before `startNapkinWatcher`, or nepic dir path computed incorrectly.
- **Size**: medium
- **Verification**: `app.evaluate` → switch to B. `page.waitForFunction` → store's napkins array contains B's slug(s). Then `app.evaluate` → write a file inside A's `30-napkins/` — assert renderer's napkin list does NOT update with A's content.

### T-1100-03: napkin statuses from SQLite sent for new nepic

- **Flow**: pre-insert napkin statuses in SQLite for nepic B (e.g., slug "0100-foo" with status "doing"). Switch to B.
- **Subsystems**: napkin-store, IPC `napkin:status-changed`
- **Expected**: renderer receives status-changed events for B's napkins. Store's napkins have correct statuses merged.
- **Breaks when**: statuses only sent on startup, not on switch. Or statuses sent for all nepics (wrong nepic_id filter).
- **Size**: medium
- **Verification**: `page.evaluate` → after switch, check `useTerminalStore.getState().napkins` for slug "0100-foo" with status "doing".

### T-1100-04: terminal switches to new nepic's architect

- **Flow**: create two nepics each with an architect session (pty alive). Switch from A to B.
- **Subsystems**: store terminal management, session-store `getArchitectForNepic`
- **Expected**: `activeTerminalId` changes to B's architect session id. B's xterm instance is the one displayed.
- **Breaks when**: no terminal switching logic — activeTerminalId stays on A's architect. Or architect lookup returns undefined (wrong nepicId query).
- **Size**: medium
- **Verification**: `page.evaluate` → `useTerminalStore.getState().activeTerminalId` equals B's architect session id. `getTerminal(bArchitectId)` returns non-null entry.

### T-1100-05: terminal handles nepic with no live architect

- **Flow**: create nepic B with no running architect session (session exited or never created). Switch from A to B.
- **Subsystems**: store terminal management, architect lookup
- **Expected**: switch succeeds without crash. `activeTerminalId` either stays null or shows an appropriate empty state. No attempt to display a non-existent terminal.
- **Breaks when**: code assumes every nepic has an architect, crashes on undefined. Or blindly sets activeTerminalId to undefined.
- **Size**: medium
- **Verification**: `page.evaluate` → switch to B. Assert no errors thrown. `activeTerminalId` is null or still valid. No uncaught exceptions in console.

### T-1100-06: previous nepic's ptys stay alive after switch

- **Flow**: create nepic A with architect pty running. Switch to B.
- **Subsystems**: pty lifecycle, nepic switch handler
- **Expected**: A's architect pty is still in the ptys map. Its session status is still 'running'. No kill signal sent.
- **Breaks when**: switch handler kills previous nepic's ptys, or deactivation logic cascades to session cleanup.
- **Size**: medium
- **Verification**: `app.evaluate` → `__napTest.getLivePtyIds()` includes A's architect session id. `getSession(aArchitectId).status === 'running'`.

### T-1100-07: gutter highlight moves to clicked nepic

- **Flow**: two nepics in gutter. Click nepic B's icon.
- **Subsystems**: renderer store `activeNepicId`, Gutter component
- **Expected**: store's `activeNepicId` = B's id. Gutter renders B's icon with the white indicator bar. A's icon no longer has the bar.
- **Breaks when**: activeNepicId not updated in store, or Gutter doesn't re-render from store state.
- **Size**: medium
- **Verification**: `page.evaluate` → `useTerminalStore.getState().activeNepicId === bId`. DOM: `querySelectorAll('[data-testid="nepic-icon"]')` — check the second icon has the active indicator (child div with white background).

### T-1100-08: ui_state persisted with new activeNepicId

- **Flow**: switch to nepic B. Verify ui_state table reflects the change.
- **Subsystems**: ui_state tracking, IPC `ui-state:update`
- **Expected**: `ui_state.active_nepic_id` = B's id. `active_terminal_id` = B's architect id (or whatever terminal was switched to).
- **Breaks when**: renderer doesn't send `ui-state:update` after nepic switch, or main doesn't save it (only saves on before-quit — this is fine if tracked state is updated).
- **Size**: medium
- **Verification**: `page.evaluate` → trigger nepic switch. Then `app.evaluate` → read `trackedUiState` or query `ui_state` table after triggering save. Assert `active_nepic_id` = B.

### T-1100-09: round-trip — switch away and back preserves state

- **Flow**: nepic A has napkins and an architect terminal with buffer content. Switch to B. Switch back to A.
- **Subsystems**: napkin watcher, store, terminal registry, pty lifecycle
- **Expected**: A's napkins re-appear in sidebar. A's architect terminal is active again. Xterm buffer content preserved (scrollback intact — DOM reparent, no dispose).
- **Breaks when**: napkins for A are lost (full scan returns stale data), terminal entry disposed on switch-away, or xterm instance garbage collected.
- **Size**: medium
- **Verification**: `page.evaluate` → after round-trip, store's napkins match A's original set. `activeTerminalId` = A's architect. Read buffer line from A's terminal — content matches pre-switch.

### T-1100-10: sidebar re-renders with new nepic's napkins

- **Flow**: nepic A has napkins [0100-alpha, 0200-beta]. Nepic B has napkins [0100-gamma]. Switch to B.
- **Subsystems**: napkin watcher full scan, renderer store, sidebar component
- **Expected**: after switch, store's napkins array contains only B's napkin(s). Sidebar renders 0100-gamma, not 0100-alpha or 0200-beta.
- **Breaks when**: napkins from A and B merge instead of replace, or sidebar still renders stale A data because napkin watcher didn't fire a full scan.
- **Size**: medium
- **Verification**: `page.evaluate` → `useTerminalStore.getState().napkins.map(n => n.slug)` equals `['0100-gamma']`. No A slugs present.

### T-1100-11: rapid switching doesn't corrupt state

- **Flow**: three nepics exist. Switch A→B→C→A in quick succession (no awaits between).
- **Subsystems**: debounce logic in watcher, store, IPC ordering
- **Expected**: final state settles on A. Napkins show A's content. Active terminal is A's architect. No stale IPC messages from B's or C's watcher arriving late.
- **Breaks when**: debounced watcher updates from B arrive after A's watcher starts, causing napkin data mixup. Or store activeNepicId flickers.
- **Size**: medium
- **Verification**: await a settle period (500ms). `page.evaluate` → `activeNepicId` = A. Napkins match A's set. No B or C data in store.

### T-1100-12: switching nepic when clicked nepic is already active — no-op

- **Flow**: nepic A is active. Click A's icon in gutter.
- **Subsystems**: store setActiveNepic, IPC handler
- **Expected**: no watcher restart, no IPC to main (or IPC is a no-op), no napkin reload. State unchanged. No flicker.
- **Breaks when**: every click triggers a full watcher restart and napkin reload even when target === current. Causes unnecessary work and potential flicker.
- **Size**: medium
- **Verification**: `page.evaluate` → store's napkins array reference is the same object before and after (no re-render triggered). Or: monitor IPC calls — no `nepic:switch` sent.

### Not tested (manual / future)

- **Gutter animation** — smooth transition of white bar moving. Visual only.
- **Sidebar scroll position** — whether sidebar remembers scroll position per nepic. Not in spec.
- **Terminal breadcrumb update** — breadcrumb navigation updates to show new nepic. Separate concern (0600 live-wiring).
- **Kanban overlay** — whether kanban updates on switch. Covered by napkin data reload, but visual correctness is manual.
- **Multiple agents per nepic** — switching to a nepic that has multiple running agents. Terminal should show the last-viewed one. Deferred until agent management is richer.

### Priority order

1. T-1100-01 — SQLite toggle (data foundation)
2. T-1100-06 — ptys survive switch (safety)
3. T-1100-02 — watcher switches (core mechanic)
4. T-1100-04 — terminal switches (core mechanic)
5. T-1100-10 — sidebar renders new napkins (visible correctness)
6. T-1100-07 — gutter highlight (visible correctness)
7. T-1100-05 — no-architect edge case
8. T-1100-03 — napkin statuses from SQLite
9. T-1100-08 — ui_state persistence
10. T-1100-09 — round-trip fidelity
11. T-1100-12 — no-op idempotency
12. T-1100-11 — rapid switching stability

### Notes for implementer

- **No `setNepicActive(id)` exists yet** — `createNepicRow` does deactivate-all + INSERT. Switching needs deactivate-all + UPDATE-target. Write a new `setNepicActive(id)` in session-store.ts.
- **Napkin data replacement** — current `setNapkinData` merges by slug. Switching nepics needs a `clearNapkins()` or `replaceNapkinData()` action to wipe A's data before B's arrives. Otherwise slugs from A and B mix.
- **Watcher debounce on switch** — `stopNapkinWatcher()` clears timers, good. But ensure the full scan from `startNapkinWatcher` arrives after the store has been cleared, not before.
- **Terminal DOM reparent** — xterm instances live in `terminal-registry.ts` outside React. Switching terminals is just changing `activeTerminalId` — React reparents the xterm container. No disposal needed. This is why round-trip (T-1100-09) should preserve buffer content.
- **IPC pattern** — use `ipcMain.handle` (invoke/return) for nepic switch so the renderer can `await` the result before updating store. This matches the `nepic:create` pattern.
