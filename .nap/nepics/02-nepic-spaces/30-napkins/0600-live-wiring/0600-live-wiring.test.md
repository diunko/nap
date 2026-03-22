# 0600-live-wiring — Test Architecture

## Seam Map

```
filesystem service (0500)                SQLite / session status (0300)
  → IPC: napkin:update                     → IPC: socket:status-changed
    ↘                                        ↙
      zustand store (merge layer)
        → napkins: NapkinData[] (artifacts, agents, bullets from fs)
        → napkin statuses (from SQLite)
        → agent statuses (from session IPC)
        → kanbanVisible: boolean (Cmd+`)
        → breadcrumb derivation (activeTerminal → napkin → agent)
          ↓
    ┌─────┼──────────┐
    │     │          │
  Sidebar  Kanban   Breadcrumb
  (real    (real     (real
   data)   data)     data)
```

Seven seams:
1. **napkin:update IPC → store merge** — filesystem data lands in store, replaces mock data
2. **status IPC → store merge** — SQLite napkin phases update store without clobbering filesystem data
3. **session status IPC → agent dots** — `socket:status-changed` updates agent status in store
4. **store → NapkinBrowser** — component reads from `store.napkins`, not `MOCK_NAPKINS`
5. **store → KanbanOverlay** — same data, different rendering (columns by phase)
6. **store → Breadcrumb** — active terminal derives napkin/agent context from real data
7. **kanban → navigation** — card click dismisses overlay, scrolls sidebar, switches terminal

## Critical Design Observations

- **Two streams, one store.** Filesystem service pushes what exists (artifacts, agents, bullets). SQLite pushes annotations (napkin phase, agent status). The store merges by slug. If either stream arrives first, the other fills in later — no ordering guarantee.
- **Mock data must die.** `NapkinBrowser.tsx` currently imports `MOCK_NAPKINS` directly. After wiring, it reads `store.napkins`. The mock-data module becomes dead code. If any component still imports it, the wiring is incomplete.
- **Kanban is a read-only view over the same store.** It groups `store.napkins` by phase into columns. No new data fetching — just a different projection.
- **Breadcrumb maps terminal → napkin → agent.** This requires joining terminal metadata (which has `parentId` or napkin association) with store napkins. The join key is the link — if it's wrong, breadcrumbs show nothing.
- **Cmd+` is a new keyboard shortcut.** Must not conflict with xterm key capture. Same pattern as Cmd+B (IPC from main → renderer toggles state).

---

## T-0600-01: napkin:update IPC populates store with real napkin data

* **Flow**: filesystem service sends `napkin:update` with array of `NapkinData` → store receives → `store.napkins` populated with real data
* **Subsystems**: IPC bridge (`onNapkinUpdate`), store merge logic
* **Expected**: `store.napkins` has entries matching the IPC payload. Each entry has slug, artifacts, agents, napkinBullets from filesystem service.
* **Where it breaks**: IPC listener not registered in renderer, or store setter overwrites instead of merging (clobbers status data), or listener registered after initial payload sent (race)
* **Test size**: medium
* **Verification**: `app.evaluate` — create fixture napkin dirs in temp `30-napkins/`, trigger filesystem service init. `page.evaluate` — wait for store to have napkins matching fixture slugs. Assert artifact/agent/bullet data matches filesystem.

---

## T-0600-02: napkin status from SQLite merges with filesystem data

* **Flow**: filesystem service delivers napkin with artifacts → SQLite query returns status "doing" for that slug → store has both artifacts AND status on the same napkin entry
* **Subsystems**: store merge logic, status IPC (`onNapkinStatusChanged`), filesystem IPC
* **Expected**: `store.napkins.find(n => n.slug === '...')` has both `artifacts` (from fs) and `status` (from SQLite). Neither stream clobbers the other.
* **Where it breaks**: store has two separate arrays (napkins from fs, statuses from SQLite) but never joins them. Or: status update replaces the entire napkin entry, losing artifacts.
* **Test size**: medium
* **Verification**: `app.evaluate` — create napkin dirs AND set status in SQLite via `changeNapkinStatus`. `page.evaluate` — assert store napkin has both `artifacts.length > 0` and `status === 'doing'`.

---

## T-0600-03: agent status change updates dot in real-time

* **Flow**: agent terminal running (green dot) → `nap done` fires → `socket:status-changed` IPC → store updates agent status to 'done' → dot changes from green to blue
* **Subsystems**: socket handler (`onSocketStatusChanged`), store agent status, NapkinBrowser dot rendering
* **Expected**: store reflects new agent status immediately. No page reload needed.
* **Where it breaks**: `onSocketStatusChanged` doesn't update store, or updates the wrong agent (slug/name mismatch), or React doesn't re-render because selector doesn't detect nested agent status change
* **Test size**: medium
* **Verification**: `page.evaluate` — read agent status from store for a known agent. `app.evaluate` — simulate `socket:status-changed` IPC with `{ id, status: 'done' }`. `page.evaluate` — poll store until agent status is 'done' (with timeout). Assert status changed.

---

## T-0600-04: NapkinBrowser renders from store, not mock data

* **Flow**: app launches → filesystem service populates store → NapkinBrowser shows napkins from store with real slugs, real artifact lists, real agent names
* **Subsystems**: NapkinBrowser.tsx (import change), store.napkins, rendering
* **Expected**: rendered napkin names match real filesystem napkin dirs, not the hardcoded `MOCK_NAPKINS` list. If filesystem has 3 napkins, browser shows 3.
* **Where it breaks**: component still imports `MOCK_NAPKINS`. Or: store.napkins is empty at render time (race with IPC), showing blank sidebar.
* **Test size**: medium
* **Verification**: `app.evaluate` — create 3 fixture napkin dirs with unique slugs (e.g. `9901-test-alpha`, `9902-test-beta`, `9903-test-gamma`). `page.evaluate` — wait for store to have 3 napkins. Query DOM for rendered napkin names (via `[data-testid="napkin-card"]` text content). Assert all 3 fixture slugs appear. Assert no mock data slugs (e.g. `0010-project-bootstrap`) appear.

---

## T-0600-05: sidebar shows correct phase badges from SQLite

* **Flow**: napkin has status "review" in SQLite → sidebar card shows "review" badge with blue color
* **Subsystems**: store (napkin status field), NapkinBrowser phase badge rendering
* **Expected**: each napkin card's phase badge text and color match the SQLite status
* **Where it breaks**: status not merged into store napkin, or badge still reads from mock data's `phase` field
* **Test size**: medium
* **Verification**: `app.evaluate` — set napkin status to "review" via `changeNapkinStatus`. `page.evaluate` — find the napkin card in DOM, read the phase badge text. Assert it says "review".

---

## T-0600-06: Cmd+` toggles kanban overlay

* **Flow**: Cmd+` → kanban overlay appears (slides down from top, full width) → Cmd+` again → overlay dismisses
* **Subsystems**: keyboard handler (new IPC channel or renderer-side), store.kanbanVisible, KanbanOverlay component
* **Expected**: overlay renders on toggle, disappears on second toggle. Terminal stays underneath, untouched. Store state flips correctly.
* **Where it breaks**: backtick key conflicts with terminal input (xterm captures it), or IPC channel not wired, or overlay renders but doesn't unmount (stays in DOM with display:none which could intercept clicks)
* **Test size**: medium
* **Verification**: `page.evaluate` — assert kanban overlay not in DOM (or `kanbanVisible === false`). Dispatch Cmd+` keydown. Assert `store.kanbanVisible === true` and overlay DOM element exists. Dispatch again. Assert `kanbanVisible === false` and overlay gone.

---

## T-0600-07: kanban columns render napkins grouped by phase

* **Flow**: store has napkins with statuses: 2 doing, 1 review, 1 done → kanban shows 3 columns with correct card counts
* **Subsystems**: KanbanOverlay component, store.napkins (grouped by status)
* **Expected**: 5 columns always present (backlog, todo, doing, review, done). Cards distributed by their status. Column headers show counts.
* **Where it breaks**: grouping logic uses wrong field name, or status values don't match column names (e.g. "doing" vs "in-progress"), or napkins without status default to wrong column
* **Test size**: small (vitest + jsdom — pure rendering with mocked store)
* **Verification**: set store.napkins to fixture data with known statuses. Render KanbanOverlay. Query column elements, assert card counts per column match expected distribution.

---

## T-0600-08: kanban cards show .nap.md bullets when expanded

* **Flow**: kanban card collapsed → click card name → card expands → first-level `*` bullets from .nap.md visible
* **Subsystems**: KanbanOverlay card rendering, store.napkins[].napkinBullets
* **Expected**: expanded card shows the bullet strings that came from the filesystem service's `.nap.md` parsing
* **Where it breaks**: napkinBullets not passed through to kanban card component, or rendering truncates/strips bullet text
* **Test size**: small (vitest + jsdom — render with mocked store data)
* **Verification**: set store napkin with `napkinBullets: ['connect real data', 'replace mocks']`. Render kanban with that napkin expanded. Assert bullet text appears in rendered output.

---

## T-0600-09: kanban cards show artifact badges (filled vs dimmed)

* **Flow**: napkin has `.nap.md` and `.spec.md` but not `.test.md` → kanban card shows "nap" and "spec" badges filled, "test" badge dimmed
* **Subsystems**: KanbanOverlay card rendering, store.napkins[].artifacts
* **Expected**: badges for present artifacts are visually filled. Missing artifacts are dimmed. Badge set is fixed: nap, spec, test, journeys.
* **Where it breaks**: artifact extension format mismatch (`.nap.md` vs `nap`), or all badges shown as filled regardless of presence
* **Test size**: small (vitest + jsdom)
* **Verification**: render kanban card with `artifacts: ['.nap.md', '.spec.md']`. Assert "nap" and "spec" badges have filled style. Assert "test" and "journeys" badges have dimmed style.

---

## T-0600-10: kanban cards show agent dots

* **Flow**: napkin has 3 agents with statuses run, done, nap → kanban card shows 3 dots with correct colors
* **Subsystems**: KanbanOverlay card rendering, StatusDot component (reused from sidebar)
* **Expected**: dots match agent statuses — green filled pulsing, blue filled, amber hollow
* **Where it breaks**: agent data not passed to kanban card, or dot component not imported/reused
* **Test size**: small (vitest + jsdom)
* **Verification**: render kanban card with 3 agents of different statuses. Assert 3 dot elements rendered. Assert color/style matches status (same assertions as existing dot tests in 0400).

---

## T-0600-11: kanban → navigation — click card arrow dismisses overlay and navigates

* **Flow**: kanban open → click → arrow on card → overlay dismisses → sidebar scrolls to that napkin → terminal switches to best agent
* **Subsystems**: KanbanOverlay click handler, store.kanbanVisible, store.expandCard, store.setActive, sidebar scroll behavior
* **Expected**: three things happen: (1) kanbanVisible → false, (2) focusedCardSlug → clicked napkin slug, (3) activeTerminalId → best agent's terminal ID
* **Where it breaks**: click handler only does one of three things, or "best agent" heuristic wrong (e.g. picks exited agent over running one), or sidebar doesn't scroll because scrollIntoView not called
* **Test size**: medium
* **Verification**: `page.evaluate` — open kanban, then call the navigation handler for a specific napkin slug. Assert `store.kanbanVisible === false`, `store.focusedCardSlug === slug`, `store.activeTerminalId` matches an agent terminal for that napkin. Check sidebar has the card in view (scroll position or element visibility).

---

## T-0600-12: breadcrumb shows `S > napkin-name > agent-name` with real data

* **Flow**: click agent in sidebar → terminal switches → breadcrumb header shows `S > 0200-sqlite-setup > 001-fs-eng`
* **Subsystems**: Terminal.tsx breadcrumb, store (activeTerminalId → napkin/agent derivation), store.napkins
* **Expected**: breadcrumb segments derived from real store data, not mock. Segments update when active terminal changes.
* **Where it breaks**: derivation function can't find the napkin for the terminal (join key wrong), or breadcrumb still reads from mock data constants
* **Test size**: medium
* **Verification**: `app.evaluate` — create napkin dirs, start agent terminal with known napkin association. `page.evaluate` — switch to agent terminal, read breadcrumb DOM text. Assert it contains the real napkin slug and agent name.

---

## T-0600-13: breadcrumb click S → switches to architect terminal

* **Flow**: viewing agent terminal → click "S" segment in breadcrumb → terminal switches to architect
* **Subsystems**: breadcrumb click handler, store.setActive
* **Expected**: activeTerminalId changes to architect's terminal ID
* **Where it breaks**: click handler not wired, or architect terminal ID lookup fails
* **Test size**: medium
* **Verification**: `page.evaluate` — switch to agent terminal first. Click the S breadcrumb segment (or call the handler directly). Assert `store.activeTerminalId` is the architect's terminal ID.

---

## T-0600-14: breadcrumb click napkin-name → focuses card in sidebar

* **Flow**: viewing agent terminal → click napkin-name segment → sidebar card for that napkin becomes focused
* **Subsystems**: breadcrumb click handler, store.expandCard
* **Expected**: `store.focusedCardSlug` changes to the napkin slug from the breadcrumb
* **Where it breaks**: click handler calls wrong store action, or napkin slug derivation fails
* **Test size**: medium
* **Verification**: `page.evaluate` — click napkin segment in breadcrumb. Assert `store.focusedCardSlug` matches expected napkin slug.

---

## T-0600-15: fs.watch → sidebar artifact list updates in real-time

* **Flow**: agent creates a new file (e.g. `response.md`) → fs.watch fires → filesystem service pushes update → store merges → sidebar shows new artifact
* **Subsystems**: filesystem service (0500), IPC, store merge, NapkinBrowser rendering
* **Expected**: new artifact appears in the focused card's artifact list without manual refresh
* **Where it breaks**: IPC update received but store merge drops the change (no re-render trigger), or the artifact doesn't match KNOWN_ARTIFACTS and is ignored
* **Test size**: medium
* **Verification**: `app.evaluate` — write a `.test.md` file into a fixture napkin dir (which previously had only `.nap.md`). `page.evaluate` — wait for store napkin to have `.test.md` in artifacts (poll with timeout). Assert sidebar DOM shows the new artifact if card is focused.

---

## T-0600-16: new agent dir created → sidebar updates agent list

* **Flow**: architect creates `agents/002-fs-eng/` → fs.watch fires → IPC update → store merges → sidebar napkin card shows new agent entry
* **Subsystems**: filesystem service (agent dir detection), IPC, store, NapkinBrowser
* **Expected**: new agent appears in the napkin's agent list with default status
* **Where it breaks**: filesystem service reads agent dir names but store doesn't merge them, or merge replaces agents list instead of diffing
* **Test size**: medium
* **Verification**: `app.evaluate` — create `agents/002-fs-eng/` dir. `page.evaluate` — poll store until napkin's agents includes `'002-fs-eng'`. Assert agent rendered in sidebar card.

---

## T-0600-17: kanban overlay doesn't interfere with terminal

* **Flow**: kanban open → terminal underneath still receives output → dismiss kanban → terminal buffer unchanged, scroll position preserved
* **Subsystems**: KanbanOverlay z-index/positioning, terminal xterm instance
* **Expected**: terminal continues receiving pty output while kanban is visible. No dropped output, no scroll jump.
* **Where it breaks**: overlay intercepts keyboard events meant for terminal, or overlay's DOM insertion causes terminal container to resize (triggers fitAddon.fit which changes cols)
* **Test size**: medium
* **Verification**: `page.evaluate` — record terminal buffer length. Open kanban. `app.evaluate` — write 100 lines to pty. Close kanban. `page.evaluate` — assert buffer length increased by ~100. Assert terminal cols unchanged (no resize from overlay).

---

## T-0600-18: store handles out-of-order IPC — status before filesystem

* **Flow**: SQLite status IPC arrives for a napkin slug before filesystem service has scanned that napkin → status stored → filesystem data arrives later → merged correctly
* **Subsystems**: store merge logic (handles partial data)
* **Expected**: napkin entry in store has status from first IPC and artifacts from second. No error, no lost data.
* **Where it breaks**: status update for unknown slug is dropped, or creates a napkin entry with only status that gets overwritten (not merged) when filesystem data arrives
* **Test size**: small (vitest — test store merge function directly)
* **Verification**: call store's status update action with a slug and status "doing". Then call store's filesystem update action with the same slug and artifacts. Assert final napkin has both status and artifacts.

---

## T-0600-19: existing terminal features still work after wiring

* **Flow**: run existing test suite — terminal switching, scroll lock, Cmd+B toggle, Cmd+W close, buffer preservation all pass
* **Subsystems**: all
* **Expected**: zero regressions. Live wiring changes data source but not terminal mechanics.
* **Where it breaks**: store shape change (new fields) breaks existing selectors. Import path changes (NapkinBrowser no longer imports mock-data). Index.tsx keyboard handler registration order affects existing shortcuts.
* **Test size**: medium (full suite run)
* **Verification**: `npm test` — all existing tests green. This is a constraint, not a new test.

---

## Test Count Summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 5     | T-07, T-08, T-09, T-10, T-18 |
| Medium | 14    | T-01 through T-06, T-11 through T-17, T-19 |
| Big    | 0     | — |

## Priority Order

1. **T-01, T-02, T-04** — data flow foundation: if IPC doesn't populate the store or mock data isn't replaced, nothing works
2. **T-03, T-05** — status wiring: agent dots and phase badges are the primary visual feedback
3. **T-15, T-16** — real-time updates: the live feedback loop that makes the app feel alive
4. **T-06, T-07, T-08, T-09, T-10** — kanban overlay: new feature, needs full coverage
5. **T-11** — kanban navigation: the one-click overview→deep-work flow
6. **T-12, T-13, T-14** — breadcrumb: navigation correctness with real data
7. **T-17** — terminal isolation: kanban must not break the core
8. **T-18** — store ordering robustness
9. **T-19** — regression: the safety net

## Notes for Implementer

- **Store merge is the hardest part.** Two IPC streams (filesystem + status) converge on one `napkins[]` array. The merge must be additive — updating artifacts shouldn't clobber status, and updating status shouldn't clobber artifacts. Design the store setter as a merge-by-slug function.
- **Kill mock-data imports.** After wiring, `NapkinBrowser.tsx` should not import from `../mock-data`. The mock-data module can stay for reference but must not be referenced by any production component. T-04 validates this.
- **Kanban small tests use jsdom.** The KanbanOverlay is a pure rendering component — it reads store state and renders columns/cards. No IPC, no native modules. Perfect for vitest + jsdom.
- **Breadcrumb derivation needs a join.** The active terminal has an ID. The store has napkins with agents. The derivation must walk: `activeTerminalId → find terminal in store → extract napkin_slug from terminal metadata → find napkin in store.napkins → find agent by name`. If any link is missing, breadcrumb shows nothing. Test T-12 exercises the full chain.
- **Cmd+` keyboard handling.** Must go through main process IPC (same as Cmd+B, Cmd+T) to avoid xterm capturing the key. Add `onToggleKanban` to preload.ts. The renderer listener toggles `store.kanbanVisible`.
- **Kanban navigation "best agent" heuristic.** When clicking → on a kanban card, the terminal should switch to the "best" agent: running > napping > done > exited. If no agent has a terminal, switch to architect.

## What NOT to test here

- Filesystem service internals (readNapkinDir, debounce, fs.watch) — tested in 0500
- SQLite schema, changeNapkinStatus — tested in 0200/0300
- Terminal mechanics (pty, buffer, scroll, DOM reparenting) — tested in 0100/0200
- Visual correctness (colors, spacing, animation) — manual testing against screenshots
- Kanban drag-to-reorder — out of scope for v2 (read-only)
- Nepic switching in gutter — that's 1100-nepic-switching
