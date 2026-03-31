## 0400 — sidebar zoom + filesystem watcher + debug panel tabs: test cases

### Fixtures

**F12: zoom fixture (agents in all lifecycle states)**
```
nepic/30-napkins/0100-explore/.napkin.nap.json  { status: 'doing' }
nepic/30-napkins/0100-explore/0100-explore.nap.md  (file exists)
nepic/30-napkins/0100-explore/0100-explore.spec.md  (file exists)
nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json
  { uuid: 'uuid-ta', role: 'test-arch', started: true, exited: false }
nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json
  { uuid: 'uuid-fs', role: 'fs-eng', started: true, exited: true, done: true }
nepic/30-napkins/0100-explore/agents/003-reviewer/.agent.nap.json
  { uuid: 'uuid-rv', role: 'reviewer', started: false, exited: false }

nepic/30-napkins/0200-build/.napkin.nap.json  { status: 'backlog' }
nepic/30-napkins/0200-build/0200-build.nap.md  (file exists)

nepic/20-architects/001-architect/.agent.nap.json
  { uuid: 'uuid-arch', role: 'architect', started: true, exited: false }
nepic/20-architects/001-architect/prompt.md  (file exists)
nepic/20-architects/001-architect/scratch/notes.md  (file exists)
nepic/20-architects/001-architect/onboarding/setup.md  (file exists)
```

**F13: dot color state matrix fixture (one agent per lifecycle state)**
```
nepic/30-napkins/0100-dots/.napkin.nap.json  { status: 'doing' }
agent-running:   { started: true, exited: false }  → setAgentRunning(id, true)
agent-done:      { started: true, exited: false, done: true }
agent-done-exit: { started: true, exited: true, done: true }
agent-exited:    { started: true, exited: true }
agent-waiting:   { started: false, exited: false }
```

---

### Part 1: dot system — color by role, shape by status

The dot system encodes TWO dimensions: role (color) and status (shape). This is the approved design — role colors visually encode the pipeline (orange TA → green FS → gray TE). Do NOT change to status-based colors.

**Color = role:**
- Orange (#f59e0b) = test-architect
- Green (#22c55e) = fullstack-eng
- Gray (#6b7280) = test-engineer
- Blue (#3b82f6) = architect + default/unknown

**Shape = status:**
- Filled = running
- Dashed + checkmark = done
- Hollow gray = exited (overrides role color — all exited dots are gray)

#### T-0400-01: running test-arch → orange filled dot
- **Flow**: Agent with role=test-arch, running=true → dot
- **Subsystems**: renderer (Sidebar dot rendering)
- **Expected**: dot color = #f59e0b (orange, from role), filled circle
- **Breaks when**: dot uses status color instead of role color
- **Size**: small
- **Verification**: Pure function — `dotStyle({ role: 'test-arch', running: true, done: false, exited: false })` returns `{ color: '#f59e0b', shape: 'filled' }`

#### T-0400-02: running fs-eng → green filled dot
- **Flow**: Agent with role=fs-eng, running=true → dot
- **Expected**: dot color = #22c55e (green, from role), filled circle
- **Size**: small
- **Verification**: `dotStyle({ role: 'fs-eng', running: true, done: false, exited: false })` returns `{ color: '#22c55e', shape: 'filled' }`

#### T-0400-03: done test-arch → orange dashed + checkmark
- **Flow**: Agent with role=test-arch, done=true → dot
- **Expected**: dot color = #f59e0b (orange, from role), dashed border, checkmark inside
- **Breaks when**: done overrides role color (should keep role color, change shape only)
- **Size**: small
- **Verification**: `dotStyle({ role: 'test-arch', running: false, done: true, exited: false })` returns `{ color: '#f59e0b', shape: 'dashed-check' }`

#### T-0400-04: exited agent (any role) → hollow gray
- **Flow**: Agent exited, regardless of role → dot
- **Expected**: dot color = #6b7280 (gray), hollow. Role color overridden by exited state.
- **Breaks when**: exited agent keeps role color
- **Size**: small
- **Verification**: `dotStyle({ role: 'fs-eng', running: false, done: false, exited: true })` returns `{ color: '#6b7280', shape: 'hollow' }`

#### T-0400-05: unknown/default role → blue filled dot
- **Flow**: Agent with role not matching known roles → dot
- **Expected**: dot color = #3b82f6 (blue), shape by status
- **Size**: small
- **Verification**: `dotStyle({ role: 'researcher', running: true, done: false, exited: false })` returns `{ color: '#3b82f6', shape: 'filled' }`

#### T-0400-06: dot system state matrix — all role×status combos via snapshot
- **Flow**: Load F13 with agents of different roles and statuses → verify all dots correct
- **Subsystems**: model → FakeBridge → snapshot → dot derivation
- **Expected**: Each agent maps to correct role color + status shape combo
- **Size**: small
- **Verification**: Load model, capture snapshot, map each agent to expected dot style

---

### Part 2: sidebar zoom — collapsed refinements

#### T-0400-10: click agent dot → switches to that specific terminal
- **Flow**: Click dot for agent-B on a napkin card → activeTerminalId changes to agent-B
- **Subsystems**: renderer (Sidebar click handler) → store (setActiveTerminal)
- **Expected**: activeTerminalId = agent-B's id, not the first running agent
- **Breaks when**: Click handler propagates to card-level click (sets first running)
- **Size**: medium
- **Verification**: `page.evaluate` — call store action or simulate click on dot data-testid, read `activeTerminalId` from store

#### T-0400-11: click card body → switches to first running/started agent
- **Flow**: Click napkin card header → activeTerminalId changes to first running agent
- **Subsystems**: renderer → store
- **Expected**: activeTerminalId = first running agent's id (or first started if none running)
- **Breaks when**: No agents running or started → click does nothing (correct)
- **Size**: medium
- **Verification**: Read `activeTerminalId` from store after click

---

### Part 3: sidebar zoom — focused view

#### T-0400-20: click napkin card → card expands to focused view, shows artifacts
- **Flow**: Click collapsed napkin card → card body expands in-place, showing file entries + agent entries
- **Subsystems**: renderer (Sidebar state) → store (focusedCardSlug, cardViewMode)
- **Expected**: Focused card shows: `<slug>.nap.md` first/prominent, then spec.md, test.md. Agent entries below with dots + role + status label. Rest of sidebar visible below.
- **Breaks when**: cardViewMode not tracked in store, or expand logic missing
- **Size**: medium
- **Verification**: `page.evaluate` — set focusedCardSlug in store, query DOM for file entries and agent entries within the expanded card. Verify .nap.md appears first.

#### T-0400-21: napkin focused — detect <slug>.nap.md as main file, render first
- **Flow**: Napkin has files [spec.md, 0100-explore.nap.md, test.md] → focused view reorders so .nap.md is first
- **Subsystems**: renderer (card data derivation)
- **Expected**: First file entry in focused view = `0100-explore.nap.md`
- **Breaks when**: Files rendered in filesystem order (alphabetical) instead of napkin-first
- **Size**: small
- **Verification**: Pure function test — given file entries array, derive focused view data, assert order

#### T-0400-22: napkin focused — click agent entry → terminal switches
- **Flow**: In focused napkin view, click agent row → activeTerminalId changes
- **Subsystems**: renderer → store → Terminal component
- **Expected**: Terminal panel shows the clicked agent's terminal
- **Breaks when**: Agent entry click handler missing or doesn't call setActiveTerminal
- **Size**: medium
- **Verification**: `page.evaluate` — click agent entry, read activeTerminalId

#### T-0400-23: napkin focused — click file entry → opens in editor
- **Flow**: In focused view, click file entry → shell.openPath called with absolute path
- **Subsystems**: renderer → preload (electronAPI.openFilePath) → main (shell.openPath)
- **Expected**: shell.openPath called with the file's absolute path
- **Breaks when**: File path not absolute, or IPC channel not wired
- **Size**: medium
- **Verification**: `app.evaluate` — mock shell.openPath, trigger click via page.evaluate, verify mock called with expected path

#### T-0400-24: architect focused — shows top-level home dir contents
- **Flow**: Click architect card → focused view shows prompt.md, onboarding/, scratch/
- **Subsystems**: model (file tree data in snapshot) → bridge → renderer
- **Expected**: Focused architect card shows file entries (prompt.md) and dir entries (onboarding/, scratch/). One level deep only — dirs shown as collapsed entries, no nested files.
- **Breaks when**: Snapshot doesn't include file tree data for architect, or architect card renders differently than napkin card
- **Size**: medium
- **Verification**: `page.evaluate` — load F12 fixture, verify DOM contains prompt.md, onboarding/, scratch/ under architect card. Verify no nested files (setup.md NOT visible).

#### T-0400-25: architect focused — dirs show as collapsed (one level deep)
- **Flow**: Architect focused view with onboarding/ dir → dir shown as entry but contents not expanded
- **Subsystems**: renderer (ArchitectCard focused body)
- **Expected**: onboarding/ visible as dir entry, setup.md NOT visible until extended
- **Breaks when**: Focused accidentally renders all levels (should be extended only)
- **Size**: small (data derivation) + medium (DOM verification)
- **Verification**: Query DOM — dir entry exists, nested file does not

#### T-0400-26: rest of sidebar visible below focused card
- **Flow**: Expand one napkin card → other napkin cards still visible below
- **Subsystems**: renderer (Sidebar layout)
- **Expected**: Focused card expands in-place, no modal/overlay. Scrollable sidebar with other cards below.
- **Breaks when**: Focused card takes full height, pushing others off-screen
- **Size**: medium
- **Verification**: `page.evaluate` — count visible napkin-card elements, verify > 1 when one is focused

---

### Part 4: sidebar zoom — extended view

#### T-0400-30: Cmd+E toggles focused → extended
- **Flow**: Card is focused → Cmd+E → cardViewMode changes to 'extended'
- **Subsystems**: renderer (keyboard handler) → store
- **Expected**: cardViewMode toggles focused ↔ extended. If no card focused, Cmd+E does nothing.
- **Breaks when**: Keyboard handler not registered, or store method missing
- **Size**: medium
- **Verification**: `page.evaluate` — focus a card, dispatch Cmd+E keydown, read cardViewMode from store

#### T-0400-31: Cmd+E on extended → back to focused
- **Flow**: Card is extended → Cmd+E → back to focused
- **Subsystems**: renderer → store
- **Expected**: cardViewMode = 'focused'
- **Breaks when**: Toggle logic only sets to extended, doesn't toggle back
- **Size**: medium
- **Verification**: Read cardViewMode after two Cmd+E presses

#### T-0400-32: extended napkin — full file tree with all nesting levels
- **Flow**: Napkin in extended mode → shows all files and dirs recursively
- **Subsystems**: model (file tree in snapshot) → renderer
- **Expected**: All files visible including nested subdirs. Agent files (prompt.md, response.md) visible under agent dirs.
- **Breaks when**: File tree not included in snapshot, or renderer only shows one level
- **Size**: medium
- **Verification**: Query DOM for nested file entries, verify depth > 1

#### T-0400-33: extended — file hover controls (copy path + open in editor)
- **Flow**: Hover over file entry in extended view → ⎘ and ↗ controls appear
- **Subsystems**: renderer (FileRow component)
- **Expected**: Controls hidden by default, visible on hover. ⎘ copies absolute path to clipboard. ↗ calls shell.openPath.
- **Breaks when**: Hover controls not wired, or only visible in focused mode
- **Size**: medium (needs real DOM hover)
- **Verification**: Trigger mouseenter on file row, query for control elements. Click ⎘ → check clipboard. Click ↗ → check shell.openPath mock.
- **Note**: May need manual verification for hover visual — programmatic hover via dispatchEvent may not trigger CSS :hover

#### T-0400-34: extended — [terminal] virtual entry for agents with live sessions
- **Flow**: Agent with running=true → extended view shows [terminal] clickable entry
- **Subsystems**: renderer (NapkinCard extended body)
- **Expected**: [terminal] entry visible only for agents where running=true or started=true (has a pty). Click → switches terminal.
- **Breaks when**: [terminal] shown for all agents including never-started
- **Size**: medium
- **Verification**: Query DOM for [terminal] entries, count matches agents with started=true

#### T-0400-35: extended — NO [diff] entry
- **Flow**: Extended view should NOT show [diff] — cut from this version
- **Subsystems**: renderer
- **Expected**: No element containing "[diff]" in any card body
- **Breaks when**: Someone ports v2 code that included [diff]
- **Size**: small (code grep) + medium (DOM assertion)
- **Verification**: DOM query for text "[diff]" returns empty

#### T-0400-36: extended architect — full file tree with all subdirs expanded
- **Flow**: Architect in extended mode → onboarding/, scratch/ expand to show contents
- **Subsystems**: renderer (ArchitectCard extended body)
- **Expected**: All files visible: prompt.md, onboarding/setup.md, scratch/notes.md
- **Breaks when**: Extended doesn't recurse into subdirs
- **Size**: medium
- **Verification**: Query DOM for nested files, verify setup.md and notes.md visible

---

### Part 5: keyboard shortcuts

#### T-0400-40: Cmd+K shows filter bar, typing filters cards
- **Flow**: Press Cmd+K → filter input appears and is focused. Type "explore" → only 0100-explore visible.
- **Subsystems**: renderer (Sidebar keyboard handler, filter state)
- **Expected**: Filter bar visible. Input focused. Napkin cards filtered by slug match.
- **Breaks when**: Key handler conflicts with terminal (xterm captures Cmd+K), or filter state not in store
- **Size**: medium
- **Verification**: `page.evaluate` — dispatch Cmd+K, verify filter visible in store. Type text, count visible napkin cards.

#### T-0400-41: Escape dismisses filter bar
- **Flow**: Filter bar visible → Escape → filter bar hidden, filter text cleared
- **Subsystems**: renderer
- **Expected**: browserFilterVisible = false
- **Breaks when**: Escape handler not registered for filter context
- **Size**: medium
- **Verification**: Read store state after Escape

#### T-0400-42: Cmd+B toggles sidebar visibility
- **Flow**: Press Cmd+B → sidebar hidden. Press again → sidebar visible.
- **Subsystems**: renderer (root layout component) → store (sidebarVisible)
- **Expected**: Sidebar element display toggles between visible and hidden
- **Breaks when**: Store doesn't track sidebar visibility, or layout doesn't respond
- **Size**: medium
- **Verification**: `page.evaluate` — dispatch Cmd+B, query sidebar element visibility. Dispatch again, verify restored.

#### T-0400-43: Cmd+D toggles debug panel collapsed/expanded
- **Flow**: Press Cmd+D → debug panel collapses to thin bar. Press again → expands.
- **Subsystems**: renderer (DebugPanel) → store or local state
- **Expected**: Debug panel toggles between full view and thin bar
- **Breaks when**: Collapse state not tracked, or Cmd+D not handled
- **Size**: medium
- **Verification**: Check debug panel width before/after Cmd+D

---

### Part 6: model/bridge — file tree data in snapshot

#### T-0400-50: NapkinState includes file entries for focused/extended views
- **Flow**: Model reads filesystem → NapkinState includes entries[] with files and dirs
- **Subsystems**: model (loadFromFilesystem) → bridge-types (NapkinState)
- **Expected**: Snapshot's NapkinState has `entries` field containing file entries (type, name, absPath) and dir entries (type, name, children). `<slug>.nap.md` detected and flagged as main.
- **Breaks when**: NapkinState shape not expanded, or loadFromFilesystem doesn't read file entries
- **Size**: small
- **Verification**: Load F12, capture snapshot, verify napkins[0].entries contains expected files

#### T-0400-51: AgentState (architect) includes file entries for home dir
- **Flow**: Model reads architect home dir → AgentState includes entries for focused view
- **Subsystems**: model (loadFromFilesystem) → bridge-types (AgentState or AppSnapshot)
- **Expected**: Architect's data includes file entries for prompt.md, onboarding/, scratch/
- **Breaks when**: Architects not given file tree data in snapshot
- **Size**: small
- **Verification**: Load F12, verify architect snapshot data includes entries

#### T-0400-52: file entries include absolute paths
- **Flow**: File entries in snapshot have absolute paths for shell.openPath and clipboard copy
- **Subsystems**: model
- **Expected**: Each file entry's absPath is resolvable (starts with nepicDir prefix)
- **Breaks when**: Relative paths used, breaking shell.openPath
- **Size**: small
- **Verification**: Assert all entry absPath values start with expected prefix

#### T-0400-53: napkin file entries detect <slug>.nap.md as main
- **Flow**: Napkin dir contains [spec.md, 0100-explore.nap.md, agents/] → model flags .nap.md
- **Subsystems**: model (file tree derivation)
- **Expected**: Entry for 0100-explore.nap.md has `isMain: true` (or equivalent)
- **Breaks when**: Detection regex wrong (matches other .nap.md files, or misses hyphenated slugs)
- **Size**: small
- **Verification**: Assert exactly one entry has isMain=true, and its name matches `<slug>.nap.md`

---

### Part 7: filesystem watcher wiring in app

#### T-0400-60: watcher wired in main.ts — model.startWatching called after load
- **Flow**: App starts → model.loadFromFilesystem → model.startWatching(nepicDir) → watcher active
- **Subsystems**: main.ts → model (startWatching) → filesystem (watch)
- **Expected**: After app boot, filesystem changes trigger model reload
- **Breaks when**: startWatching not called, or called before loadFromFilesystem
- **Size**: medium (needs real Electron app to verify wiring)
- **Verification**: Boot app with F12 fixture. Write a new file to the napkin dir on disk. Wait for debounce. Read store — verify new data reflected.

#### T-0400-61: agent writes response.md → file appears in extended view
- **Flow**: Agent writes response.md to its home dir → watcher fires → model re-reads → snapshot pushed → extended view shows response.md
- **Subsystems**: filesystem (watch) → model (reload) → bridge (snapshot) → renderer (extended card)
- **Expected**: New file visible in extended view within debounce window (~200ms + render)
- **Breaks when**: Watcher not watching agent subdirs (only watching napkins root), or snapshot doesn't include new files
- **Size**: medium
- **Verification**: Boot app, write file to agent dir via `fs.writeFileSync`, wait for store update via `page.waitForFunction`, verify file entry in store

#### T-0400-62: CLI set-status → phase label updates in sidebar
- **Flow**: `nap set-status 0100-explore review` → socket → model → snapshot → sidebar phase label
- **Subsystems**: socket → model (setNapkinStatus) → bridge → renderer
- **Expected**: Phase label changes from "doing" to "review" with correct color
- **Breaks when**: setNapkinStatus doesn't trigger snapshot push (already tested in 0210, but verify wiring)
- **Size**: medium (already covered by T-0210-84, but verify sidebar label specifically)
- **Verification**: Already covered — reference T-0210-84

#### T-0400-63: watcher debounce — rapid changes coalesced into single reload
- **Flow**: Three file writes within 50ms → only one model reload fires
- **Subsystems**: model (debounce timer) → filesystem
- **Expected**: Model reloads once after 200ms from last change, not three times
- **Breaks when**: Debounce timer not reset on subsequent events
- **Size**: small
- **Verification**: Use MemoryFileSystem, fire three simulateChange() calls in rapid succession, count loadFromFilesystem calls via onChange spy. Expect exactly 1 notification after debounce.

#### T-0400-64: watcher + pending write suppression — model's own writes don't trigger reload
- **Flow**: model.setNapkinStatus writes to disk → sets hasPendingWrite → watcher fires → reload skipped
- **Subsystems**: model (hasPendingWrite flag)
- **Expected**: No extra reload when model writes to its own marker files
- **Breaks when**: hasPendingWrite cleared before watcher debounce fires (race condition)
- **Size**: small (already tested in 0150, but verify for new file tree reads too)
- **Verification**: Set status, count onChange calls — should be exactly 1 (from setNapkinStatus), not 2 (from watcher reload)

#### T-0400-65: NodeFileSystem.watch() uses recursive:true
- **Flow**: Watcher should catch changes in nested dirs (agents writing files)
- **Subsystems**: filesystem (NodeFileSystem.watch)
- **Expected**: Changes in `30-napkins/0100/agents/001/response.md` are caught
- **Breaks when**: Watch is non-recursive, only catches top-level changes
- **Size**: small (code inspection — already implemented, but good to verify contract)
- **Verification**: Verify NodeFileSystem.watch passes `{ recursive: true }` to fs.watch. Already confirmed in source (filesystem.ts:53).

---

### Part 8: debug panel tabs

#### T-0400-70: debug panel has three tabs — model, filesystem, events
- **Flow**: Debug panel renders with tab bar showing three tabs
- **Subsystems**: renderer (DebugPanel)
- **Expected**: Three tab buttons visible. Default selected tab = model (preserves current behavior).
- **Breaks when**: Tabs not rendered, or default tab wrong
- **Size**: medium
- **Verification**: Query DOM for tab buttons, verify 3 exist, verify "model" tab is active

#### T-0400-71: model tab shows current JSON view (backward compatible)
- **Flow**: Select model tab → same color-coded JSON as current DebugPanel
- **Subsystems**: renderer
- **Expected**: Same output as current DebugPanel — architects, napkins, activeTerminalId, with agent lifecycle flags
- **Breaks when**: Tab refactor breaks existing JSON rendering
- **Size**: medium
- **Verification**: Compare model tab content structure with current DebugPanel output format

#### T-0400-72: filesystem tab shows raw dir/file tree as JSON
- **Flow**: Select filesystem tab → shows what the watcher reads from disk
- **Subsystems**: renderer ← bridge ← model (file tree data)
- **Expected**: JSON tree showing dirs and files as the filesystem sees them. Independent from model state.
- **Breaks when**: Filesystem data not pushed through bridge, or tab shows same data as model tab
- **Size**: medium
- **Verification**: Switch to filesystem tab, verify JSON contains file paths / dir structure

#### T-0400-73: events tab shows live log of watcher changes
- **Flow**: File changes on disk → watcher events appear in events tab, most recent at top
- **Subsystems**: model (watcher events) → bridge → renderer (DebugPanel events tab)
- **Expected**: Append-only log. Each entry: timestamp, event type, filename. Most recent at top.
- **Breaks when**: Events not forwarded to renderer, or log not appended
- **Size**: medium
- **Verification**: Boot app, write file to disk, switch to events tab, verify new entry appears

#### T-0400-74: model vs filesystem disagreement → visible in debug panel
- **Flow**: Model thinks agent is done, filesystem marker says done:false → tabs show different data
- **Subsystems**: renderer (both tabs visible simultaneously or switchable)
- **Expected**: Discrepancy visible by comparing model and filesystem tabs
- **Breaks when**: Both tabs read from same source (model), making disagreement invisible
- **Size**: medium
- **Verification**: Manually set model state to differ from disk, verify tabs show different values. This is the primary use case for having both tabs.

#### T-0400-75: collapse toggle — debug panel collapses to thin bar
- **Flow**: Click collapse button (or Cmd+D) → panel becomes thin bar. Click again → expands.
- **Subsystems**: renderer (DebugPanel) → store or local state
- **Expected**: Collapsed: ~20px wide, no content visible. Expanded: previous width restored.
- **Breaks when**: Collapse state not stored, or thin bar not clickable to expand
- **Size**: medium
- **Verification**: Check panel width before and after toggle

#### T-0400-76: collapsed/expanded state persisted across restarts
- **Flow**: Collapse panel → quit app → relaunch → panel still collapsed
- **Subsystems**: model (saveUiState) → ui-state.json → model (loadUiState) → renderer
- **Expected**: ui-state.json includes `debugPanelCollapsed: true`. On boot, panel starts collapsed.
- **Breaks when**: saveUiState not called on toggle, or renderer doesn't read ui-state on mount
- **Size**: medium
- **Verification**: Collapse panel, quit, relaunch, verify panel collapsed. Check ui-state.json on disk.

#### T-0400-77: tab selection persisted across restarts
- **Flow**: Switch to "events" tab → quit → relaunch → events tab still selected
- **Subsystems**: model (saveUiState) → ui-state.json → renderer
- **Expected**: ui-state.json includes `debugPanelTab: 'events'`. On boot, events tab active.
- **Breaks when**: Tab selection not written to ui-state.json
- **Size**: medium
- **Verification**: Switch tab, quit, relaunch, verify active tab

---

### Part 9: store changes

#### T-0400-80: store tracks focusedCardSlug + cardViewMode
- **Flow**: Click card → focusedCardSlug set. Cmd+E → cardViewMode toggles.
- **Subsystems**: store (useNapStore)
- **Expected**: New store fields: focusedCardSlug (string | null), cardViewMode ('collapsed' | 'focused' | 'extended'). Click card sets focusedCardSlug + mode='focused'. Click same card again sets focusedCardSlug=null + mode='collapsed'.
- **Breaks when**: Store shape doesn't include these fields
- **Size**: small
- **Verification**: Unit test store actions: expandCard, extendCard, collapseCard

#### T-0400-81: store tracks sidebarVisible
- **Flow**: Cmd+B → sidebarVisible toggles
- **Subsystems**: store
- **Expected**: `sidebarVisible` boolean, default true. Cmd+B toggles.
- **Breaks when**: Field missing from store
- **Size**: small
- **Verification**: Unit test toggleSidebar action

#### T-0400-82: applySnapshot preserves renderer-only state (focusedCardSlug, cardViewMode)
- **Flow**: New snapshot arrives → napkins/architects updated, but focusedCardSlug and cardViewMode preserved
- **Subsystems**: store (applySnapshot)
- **Expected**: Snapshot only overwrites napkins, architects, activeNepicId. Renderer state (focused card, view mode, sidebar visible) untouched.
- **Breaks when**: applySnapshot does `set(snapshot)` which overwrites everything
- **Size**: small
- **Verification**: Set focusedCardSlug, call applySnapshot with new data, verify focusedCardSlug unchanged

---

### Part 10: integration seams (intent/snapshot round-trip)

#### T-0400-90: click napkin card → focused → shows file entries from snapshot
- **Flow**: Full round-trip: model loads with file entries → bridge pushes snapshot → store receives → click card → focused view renders files
- **Subsystems**: model → FakeBridge → store mock → Sidebar render
- **Expected**: File entries from model appear in focused card UI
- **Breaks when**: Any layer drops or transforms file entries incorrectly
- **Size**: small (vitest with FakeBridge, no real DOM)
- **Verification**: Capture snapshot, verify entries field present and correct

#### T-0400-91: watcher change → snapshot push → store update → focused card refreshes
- **Flow**: File written to disk → watcher → model reload → bridge snapshot → store → UI re-render
- **Subsystems**: filesystem → model → bridge → store → renderer
- **Expected**: New file appears in focused/extended view without user interaction
- **Breaks when**: Snapshot push doesn't include updated file entries, or UI doesn't re-render on snapshot change
- **Size**: medium
- **Verification**: Boot app with focused card, write file to that napkin's dir, wait for store update, verify new file entry in DOM

---

### Test matrix summary

| ID | Description | Size | Priority |
|----|-------------|------|----------|
| T-0400-01..05 | Dot color state matrix (5 lifecycle states) | small | P0 — catches the known bug |
| T-0400-06 | State matrix round-trip via snapshot | small | P0 |
| T-0400-10..11 | Collapsed click behaviors | medium | P1 |
| T-0400-20..26 | Focused view (napkin + architect) | medium | P0 — new feature |
| T-0400-30..36 | Extended view (Cmd+E, file tree, hover) | medium | P0 — new feature |
| T-0400-40..43 | Keyboard shortcuts | medium | P1 |
| T-0400-50..53 | Model/bridge file tree data | small | P0 — data contract |
| T-0400-60..65 | Filesystem watcher wiring | small+medium | P0 — infrastructure |
| T-0400-70..77 | Debug panel tabs + persistence | medium | P1 |
| T-0400-80..82 | Store shape changes | small | P0 — contract |
| T-0400-90..91 | Integration round-trip | small+medium | P0 — seam |

**Total: 40 test cases (17 small, 23 medium, 0 big)**

---

### What NOT to test

- Visual layout / spacing / colors beyond the dot color matrix — manual testing territory
- [diff] feature — cut from this version
- Kanban or gutter — that's 0500
- Debug panel drag-resize — already tested/working, not changed
- xterm rendering or pty data flow — tested in 0150/0200
- Socket handler routing — tested in 0210

### Design note

Dot colors are ROLE-based (orange=TA, green=FS, gray=TE, blue=default). Status is encoded in shape (filled/dashed-check/hollow-gray). Exited is the only status that overrides role color (all exited dots are gray). This system was proven in live use and approved by the human — do not change it.
