## 0500 — kanban overlay + gutter + nepic switching: test cases

### Fixtures

**F14: kanban fixture (5 napkins across all phases + 2 nepics)**
```
nepic/30-napkins/0100-design/.napkin.nap.json  { status: 'done' }
nepic/30-napkins/0100-design/0100-design.nap.md  (file, 3 bullets: "* design system\n* color tokens\n* typography")
nepic/30-napkins/0100-design/agents/001-test-arch/.agent.nap.json
  { uuid: 'uuid-d-ta', role: 'test-arch', started: true, exited: true, done: true }
nepic/30-napkins/0100-design/agents/002-fs-eng/.agent.nap.json
  { uuid: 'uuid-d-fs', role: 'fs-eng', started: true, exited: true, done: true }

nepic/30-napkins/0200-model/.napkin.nap.json  { status: 'doing' }
nepic/30-napkins/0200-model/0200-model.nap.md  (file, 2 bullets: "* state machine\n* snapshot protocol")
nepic/30-napkins/0200-model/agents/001-fs-eng/.agent.nap.json
  { uuid: 'uuid-m-fs', role: 'fs-eng', started: true, exited: false }

nepic/30-napkins/0300-sidebar/.napkin.nap.json  { status: 'review' }
nepic/30-napkins/0300-sidebar/0300-sidebar.nap.md  (file)
nepic/30-napkins/0300-sidebar/0300-sidebar.spec.md  (file)

nepic/30-napkins/0400-zoom/.napkin.nap.json  { status: 'todo' }

nepic/30-napkins/0500-kanban/.napkin.nap.json  { status: 'backlog' }

nepic/20-architects/001-architect/.agent.nap.json
  { uuid: 'uuid-arch', role: 'architect', started: true, exited: false }
```

**F15: multi-nepic fixture (3 nepics — for gutter and switching tests)**
```
Two directories at the nepics/ level:
  nepics/01-v1/   (active)
  nepics/02-spaces/
  nepics/03-kanban/

nepics/01-v1/30-napkins/0100-explore/.napkin.nap.json  { status: 'doing' }
nepics/01-v1/30-napkins/0100-explore/agents/001-fs-eng/.agent.nap.json
  { uuid: 'uuid-v1-fs', role: 'fs-eng', started: true }
nepics/01-v1/20-architects/001-architect/.agent.nap.json
  { uuid: 'uuid-v1-arch', role: 'architect', started: true }

nepics/02-spaces/30-napkins/0100-design/.napkin.nap.json  { status: 'done' }
nepics/02-spaces/20-architects/001-architect/.agent.nap.json
  { uuid: 'uuid-s-arch', role: 'architect', started: true }

nepics/03-kanban/30-napkins/0100-board/.napkin.nap.json  { status: 'backlog' }
nepics/03-kanban/20-architects/001-architect/.agent.nap.json
  { uuid: 'uuid-k-arch', role: 'architect', started: false }
```

---

### Part 1: kanban data derivation — napkins grouped by status

#### T-0500-01: napkins grouped by status column — correct distribution
- **Flow**: Load F14 → derive kanban data from snapshot → verify grouping
- **Subsystems**: model → snapshot → renderer (kanban derivation logic)
- **Expected**: { backlog: [0500-kanban], todo: [0400-zoom], doing: [0200-model], review: [0300-sidebar], done: [0100-design] }. Each column count matches.
- **Breaks when**: Grouping uses wrong field, or unknown status falls through to nothing instead of backlog
- **Size**: small
- **Verification**: Load model with F14, capture snapshot, group napkins by status. Assert each column array has correct slugs and lengths.

#### T-0500-02: napkin with unknown/missing status → falls to backlog
- **Flow**: Napkin with no `.napkin.nap.json` (defaults to backlog) → appears in BACKLOG column
- **Subsystems**: model (default status) → kanban derivation
- **Expected**: Missing marker → status='backlog' → grouped into BACKLOG
- **Breaks when**: Missing marker throws or produces undefined status
- **Size**: small
- **Verification**: Create fixture with napkin dir but no marker. Verify it appears in backlog group.

#### T-0500-03: kanban card shows napkin bullets from .nap.md
- **Flow**: Expand card → napkin bullets extracted from `.nap.md` content
- **Subsystems**: model (napkin bullet parsing from .nap.md) → snapshot → renderer (KanbanCard expanded body)
- **Expected**: Card for 0100-design shows bullets: "design system", "color tokens", "typography"
- **Breaks when**: .nap.md not parsed for bullets, or bullets not included in snapshot
- **Size**: small
- **Verification**: Load F14, capture snapshot. Verify napkin entry for 0100-design has napkinBullets array matching expected content.

#### T-0500-04: kanban card shows agent dots with correct role colors
- **Flow**: Card for 0100-design has 2 agents (test-arch done+exited, fs-eng done+exited) → dots rendered
- **Subsystems**: renderer (KanbanCard) → dot-style pure function
- **Expected**: Two dots: both gray/hollow (exited overrides role color). Collapsed card shows slug + 2 dots.
- **Breaks when**: Dot derivation in kanban uses different logic than sidebar
- **Size**: small
- **Verification**: Pure function: `dotStyle({ role: 'test-arch', running: false, done: true, exited: true })` returns hollow gray. Same for fs-eng exited.

#### T-0500-05: kanban card shows artifact badges (nap, spec, test, journeys)
- **Flow**: Expand card for 0300-sidebar → badges show: nap (filled), spec (filled), test (dimmed), journeys (dimmed)
- **Subsystems**: renderer (KanbanCard badge derivation from file entries)
- **Expected**: Badges derived from file names ending in `.nap.md`, `.spec.md`, `.test.md`, `.journeys.md`. Present = filled style, absent = dimmed.
- **Breaks when**: Badge detection regex wrong, or entries not included in snapshot for kanban
- **Size**: small
- **Verification**: Given entries array with [0300-sidebar.nap.md, 0300-sidebar.spec.md], derive badge set. Assert nap=present, spec=present, test=absent, journeys=absent.

---

### Part 2: kanban overlay — toggle + layout

#### T-0500-10: Cmd+` toggles kanban overlay visibility
- **Flow**: Press Cmd+` → kanbanVisible=true, overlay slides down. Press again → kanbanVisible=false.
- **Subsystems**: renderer (keyboard handler) → store (kanbanVisible, toggleKanban)
- **Expected**: Store gains `kanbanVisible: boolean` (default false) and `toggleKanban()` action. Cmd+` toggles it.
- **Breaks when**: Keybinding conflicts with macOS system shortcut (Cmd+` = app switch). Needs fallback keydown listener.
- **Size**: medium
- **Verification**: `page.evaluate` — dispatch keydown for Cmd+`. Read `kanbanVisible` from store. Dispatch again, verify false.

#### T-0500-11: kanban overlay fallback keydown handler for macOS Cmd+` conflict
- **Flow**: Electron menu accelerator may not fire due to macOS system shortcut → fallback `window.addEventListener('keydown')` catches it
- **Subsystems**: renderer (keydown handler in root component)
- **Expected**: Both Electron accelerator AND manual keydown handler exist. If accelerator swallowed by OS, keydown handler fires.
- **Breaks when**: Only accelerator, no fallback (same bug as v2 before fix)
- **Size**: medium
- **Verification**: `page.evaluate` — dispatch synthetic KeyboardEvent for backtick+meta. Verify kanbanVisible toggles.

#### T-0500-12: kanban overlay has five columns with correct headers and counts
- **Flow**: Open kanban with F14 data → five columns render
- **Subsystems**: renderer (KanbanOverlay layout)
- **Expected**: Columns: BACKLOG (1), TODO (1), DOING (1), REVIEW (1), DONE (1). Headers show label + count.
- **Breaks when**: Column order wrong, or count doesn't update
- **Size**: medium
- **Verification**: `page.evaluate` — query DOM for `[data-testid="kanban-col-*"]` elements. Verify 5 exist. Read header text for each, verify label and count.

#### T-0500-13: kanban cards collapsed by default — only slug + dots visible
- **Flow**: Open kanban → all cards show slug + agent dots, no expanded content
- **Subsystems**: renderer (KanbanCard default state)
- **Expected**: No napkin bullets, no artifact badges visible. Just the header row.
- **Breaks when**: Cards auto-expand, or expanded content leaks into default view
- **Size**: medium
- **Verification**: Query DOM within kanban for card body content. Assert none expanded.

#### T-0500-14: click card name → expand to show bullets + badges
- **Flow**: Click card slug text → card expands in place showing napkin bullets + artifact badges + agent chips
- **Subsystems**: renderer (KanbanCard local state via useState)
- **Expected**: Expanded card shows divider, bullets, badges, agent chips. Other cards unaffected.
- **Breaks when**: Click doesn't toggle expansion, or expansion is global (all cards expand)
- **Size**: medium
- **Verification**: Click card element, query DOM for bullets/badges content within that card. Verify other cards still collapsed.

---

### Part 3: kanban → navigation

#### T-0500-20: → button on card → dismisses kanban + focuses sidebar card + switches terminal
- **Flow**: Click → on 0200-model card → kanbanVisible=false, focusedCardSlug='0200-model', activeTerminalId=best agent
- **Subsystems**: renderer (KanbanCard onNavigate) → store (toggleKanban, expandCard, setActiveTerminal)
- **Expected**: Three things happen atomically: (1) kanban closes, (2) sidebar card focused with blue flash, (3) terminal switches to running agent uuid-m-fs
- **Breaks when**: Any of the three actions missing, or order wrong (sidebar focus before kanban dismiss causes flash behind overlay)
- **Size**: medium
- **Verification**: `page.evaluate` — click → button, verify: kanbanVisible=false, focusedCardSlug='0200-model', activeTerminalId='uuid-m-fs'

#### T-0500-21: → navigation — best agent heuristic: running > done > exited
- **Flow**: Napkin has agents: [exited, running, done] → terminal switches to running one
- **Subsystems**: renderer (handleNavigate agent selection logic)
- **Expected**: Priority: running > done > exited. First match wins.
- **Breaks when**: Heuristic picks first agent by creation order instead of by status priority
- **Size**: small
- **Verification**: Pure function: given terminal list with mixed statuses for same napkin slug, verify selected terminal matches running agent. Test all priority orderings.

#### T-0500-22: → navigation — no agents → try architect
- **Flow**: Napkin has no agent terminals → navigation falls back to running architect
- **Subsystems**: renderer (handleNavigate fallback)
- **Expected**: If no napkin-specific agents, set activeTerminalId to running architect
- **Breaks when**: Fallback logic missing — nothing selected when no agents exist
- **Size**: small
- **Verification**: Given terminal list with only architect (no agents for target napkin), verify architect selected.

#### T-0500-23: → navigation — sidebar scrolls to card + blue flash highlight
- **Flow**: After → click, sidebar card for target napkin gets focused and scrolled into view
- **Subsystems**: renderer (Sidebar scroll + expandCard)
- **Expected**: focusedCardSlug set → React renders card as focused → scrollIntoView called. Blue flash animation on the card border.
- **Breaks when**: scrollIntoView not called, or card not in DOM (sidebar hidden)
- **Size**: medium
- **Verification**: `page.evaluate` — navigate to card, verify focusedCardSlug set. Check that card element exists in DOM and is focused. Blue flash is visual — mark as "manual verification for animation."

---

### Part 4: gutter — nepic icons + active indicator

#### T-0500-30: gutter renders nepic icons from snapshot nepics list
- **Flow**: Snapshot includes `nepics: [{ id: '01-v1', slug: '01-v1', name: 'v1' }, { id: '02-spaces', slug: '02-spaces', name: 'spaces' }]` → gutter shows V, S
- **Subsystems**: model (nepic list) → AppSnapshot → store → renderer (Gutter)
- **Expected**: Gutter shows icons derived from nepic slugs. V for 01-v1, S for 02-spaces, K for 03-kanban.
- **Breaks when**: Nepic list not in snapshot, or gutter not reading from store
- **Size**: medium
- **Verification**: `page.evaluate` — query DOM for `[data-testid="nepic-icon"]` elements. Verify count matches nepics. Read text content to verify label derivation.

#### T-0500-31: nepic label derivation — strips numeric prefix, takes first char uppercase
- **Flow**: slug '01-v1' → strip '01-' → 'v1' → 'V'. slug '02-spaces' → 'S'. slug '03-kanban-overlay' → 'K'.
- **Subsystems**: renderer (nepicLabel pure function)
- **Expected**: Correct letter for each slug pattern
- **Breaks when**: Regex doesn't match multi-digit prefix, or takes wrong char
- **Size**: small
- **Verification**: Pure function: nepicLabel('01-v1')='V', nepicLabel('02-spaces')='S', nepicLabel('03-kanban-overlay')='K', nepicLabel('10-long-name')='L'

#### T-0500-32: active nepic shows white left bar indicator
- **Flow**: activeNepicId = '01-v1' → gutter icon for 01-v1 has white left border, others don't
- **Subsystems**: renderer (Gutter active indicator styling)
- **Expected**: Active icon: white (#e5e5e5) left bar, highlighted background (#37373d), bright text. Inactive: no bar, transparent bg, dim text (#6b7280).
- **Breaks when**: Active indicator applied to all icons, or not applied at all
- **Size**: medium
- **Verification**: `page.evaluate` — query DOM for active nepic icon, verify child element with white bar exists. Verify inactive icons lack the bar element.

#### T-0500-33: gutter (+) button visible at bottom
- **Flow**: Gutter renders (+) button below all nepic icons
- **Subsystems**: renderer (Gutter layout)
- **Expected**: `[data-testid="nepic-add"]` element exists after nepic icons. Shows "+" text.
- **Breaks when**: (+) button missing or rendered at top
- **Size**: medium
- **Verification**: Query DOM for `[data-testid="nepic-add"]`, verify exists and position is after nepic icons.

---

### Part 5: gutter — nepic switching

#### T-0500-40: click nepic in gutter → model switches context
- **Flow**: Click on inactive nepic '02-spaces' → model.switchNepic called → model reloads from different nepic dir → new snapshot pushed
- **Subsystems**: renderer (click) → store (switchNepic intent) → bridge → main → model (re-loadFromFilesystem) → bridge → snapshot
- **Expected**: After click: activeNepicId='02-spaces', napkins list reflects 02-spaces content, sidebar updates
- **Breaks when**: switchNepic not wired through bridge/IPC, or model doesn't reload
- **Size**: medium
- **Verification**: `page.evaluate` — click nepic icon, wait for snapshot, verify activeNepicId and napkins changed in store.

#### T-0500-41: nepic switch — model reloads from new nepic dir
- **Flow**: model.switchNepic('02-spaces') → resolves to nepics/02-spaces/ → re-runs loadFromFilesystem
- **Subsystems**: model (switchNepic method)
- **Expected**: Model state fully replaced with new nepic's napkins + architects. Old nepic data gone from state.
- **Breaks when**: Model appends instead of replaces, or doesn't find the new nepic dir
- **Size**: small
- **Verification**: Load F15 for nepic 01-v1. Call switchNepic('02-spaces'). Verify getNapkins() returns 02-spaces napkins, not 01-v1.

#### T-0500-42: nepic switch — watcher restarts for new nepic dir
- **Flow**: After switchNepic, file watcher should watch the new nepic's dir, not the old one
- **Subsystems**: model (stopWatching + startWatching)
- **Expected**: Changes in new nepic dir trigger reload. Changes in old nepic dir do NOT trigger reload.
- **Breaks when**: Watcher not restarted — still watching old dir
- **Size**: small
- **Verification**: Use MemoryFileSystem. switchNepic, then simulateChange on new dir → onChange fires. simulateChange on old dir → no reload.

#### T-0500-43: nepic switch — ui-state.json updated with new activeNepicId
- **Flow**: switchNepic → model writes activeNepicId to ui-state.json → next launch uses it
- **Subsystems**: model (saveUiState) → filesystem (write)
- **Expected**: ui-state.json includes `activeNepicId: '02-spaces'` after switch
- **Breaks when**: activeNepicId not persisted — next launch defaults to first nepic
- **Size**: small
- **Verification**: Call switchNepic, read ui-state.json from MemoryFileSystem, verify activeNepicId field.

#### T-0500-44: nepic switch — sidebar shows new nepic's napkins + architects
- **Flow**: switchNepic('02-spaces') → snapshot with 02-spaces data → sidebar re-renders with different napkin list
- **Subsystems**: store (applySnapshot) → renderer (Sidebar)
- **Expected**: Sidebar napkin cards change to reflect new nepic. Architect cards change.
- **Breaks when**: applySnapshot doesn't clear old napkins before applying new ones
- **Size**: medium
- **Verification**: `page.evaluate` — switch nepic, wait for store update, verify napkins in store match expected new nepic data.

---

### Part 6: gutter — (+) create new nepic

#### T-0500-50: (+) click → name input overlay appears
- **Flow**: Click (+) → inline input overlay appears next to gutter with focus
- **Subsystems**: renderer (Gutter local state, isAdding)
- **Expected**: `[data-testid="nepic-name-input"]` visible and focused. Input styled with monospace, dark background, blue border.
- **Breaks when**: Input doesn't appear, or appears but not focused
- **Size**: medium
- **Verification**: Click `[data-testid="nepic-add"]`, query for `[data-testid="nepic-name-input"]`, verify exists and has focus.

#### T-0500-51: type name + Enter → nepic created, scaffolded, switched to
- **Flow**: Type "my-feature" + Enter → socket message → model.createNepic → dirs scaffolded → architect stub → switch to new nepic
- **Subsystems**: renderer → IPC (createNepic) → model → filesystem → model (switch) → snapshot
- **Expected**: New nepic dir exists with 10-docs/, 20-architects/001-architect/, 30-napkins/. Model switches to new nepic. Gutter shows new icon.
- **Breaks when**: createNepic doesn't scaffold all dirs, or doesn't switch after creation
- **Size**: medium
- **Verification**: `page.evaluate` — fill input, press Enter. Wait for store update. Verify new nepic appears in store's nepics list and activeNepicId matches.

#### T-0500-52: model.createNepic scaffolds correct directory structure
- **Flow**: createNepic('04-feature', 'Feature') → creates nepics/04-feature/{10-docs, 20-architects/001-architect, 30-napkins}
- **Subsystems**: model → filesystem (mkdir + writeJSON)
- **Expected**: Three dirs created. Architect has .agent.nap.json with uuid, role='architect', started=false.
- **Breaks when**: Missing dirs, or architect marker incomplete
- **Size**: small
- **Verification**: Call createNepic on model with MemoryFileSystem. Assert expected files/dirs exist. Read architect marker, verify shape.

#### T-0500-53: Escape on input → dismisses without creating
- **Flow**: Press Escape while name input is visible → input hidden, nothing created
- **Subsystems**: renderer (Gutter input keyDown handler)
- **Expected**: isAdding=false, input removed from DOM, no IPC calls
- **Breaks when**: Escape handler missing — input stays open
- **Size**: medium
- **Verification**: Open input, press Escape, verify input element removed from DOM.

#### T-0500-54: blur on input → dismisses without creating
- **Flow**: Click elsewhere while input is open → onBlur fires → input hidden
- **Subsystems**: renderer (Gutter input onBlur)
- **Expected**: Same as Escape — dismiss without side effects
- **Breaks when**: onBlur not wired
- **Size**: medium
- **Verification**: Open input, trigger blur, verify dismissed.

#### T-0500-55: empty name + Enter → no-op (does not create)
- **Flow**: Open input, leave blank, press Enter → nothing happens, input closes
- **Subsystems**: renderer (handleCreate validation)
- **Expected**: Empty or whitespace-only name short-circuits. No IPC call.
- **Breaks when**: Creates nepic with empty slug
- **Size**: small
- **Verification**: Pure logic check: handleCreate returns early if `name.trim()` is empty.

---

### Part 7: model + snapshot — nepic list

#### T-0500-60: AppSnapshot gains nepics field
- **Flow**: Model builds snapshot → includes `nepics: NepicInfo[]` listing all nepics in `.nap/nepics/`
- **Subsystems**: model (nepic dir listing) → bridge-types (AppSnapshot shape)
- **Expected**: `AppSnapshot.nepics` = `[{ id: '01-v1', slug: '01-v1', name: 'v1' }, ...]`. Derived from directory names under `.nap/nepics/`.
- **Breaks when**: AppSnapshot type not expanded, or model doesn't read nepics dir
- **Size**: small
- **Verification**: Load F15 model, capture snapshot. Verify nepics array has 3 entries with correct slugs.

#### T-0500-61: nepic list survives snapshot round-trip to store
- **Flow**: Snapshot with nepics → applySnapshot → store.nepics populated
- **Subsystems**: store (applySnapshot) → NapStore shape
- **Expected**: Store gains `nepics` field. applySnapshot sets it from snapshot.
- **Breaks when**: applySnapshot doesn't transfer nepics field, or store type missing it
- **Size**: small
- **Verification**: Call applySnapshot with mock snapshot including nepics. Read store.nepics, verify present and correct.

#### T-0500-62: store gains kanbanVisible + toggleKanban
- **Flow**: Store needs `kanbanVisible: boolean` (default false) and `toggleKanban()` action
- **Subsystems**: store (NapStore type)
- **Expected**: kanbanVisible defaults to false. toggleKanban flips it. applySnapshot does NOT reset kanbanVisible (it's renderer-only state).
- **Breaks when**: kanbanVisible overwritten by snapshot, or missing from store
- **Size**: small
- **Verification**: Unit test: get initial state, verify kanbanVisible=false. Call toggleKanban, verify true. Apply snapshot, verify still true.

#### T-0500-63: store gains nepics + switchNepic
- **Flow**: Store tracks nepics list and provides switchNepic(id) action
- **Subsystems**: store
- **Expected**: `nepics: NepicInfo[]`, `switchNepic(id)` sends intent through bridge → main process handles switch
- **Breaks when**: switchNepic only updates store locally without notifying main process
- **Size**: small
- **Verification**: Verify store type has nepics and switchNepic. Call switchNepic — verify intent sent (or IPC called).

---

### Part 8: integration seams — kanban round-trip

#### T-0500-70: model → snapshot → store → kanban overlay renders correct cards
- **Flow**: Full round-trip: model loads F14 → snapshot → store → kanbanVisible=true → KanbanOverlay renders 5 cards in correct columns
- **Subsystems**: model → bridge → store → renderer
- **Expected**: Kanban overlay visible with cards distributed across columns matching F14 status values
- **Breaks when**: Any layer drops or transforms napkin data incorrectly
- **Size**: medium
- **Verification**: Boot app with F14 fixture. Toggle kanban. Query DOM for cards in each column. Verify distribution.

#### T-0500-71: model → snapshot → store → gutter renders correct icons
- **Flow**: Full round-trip: model loads F15 → snapshot with nepics → store → Gutter renders 3 icons + (+)
- **Subsystems**: model → bridge → store → renderer
- **Expected**: Gutter shows V, S, K icons + (+) button. V has active indicator (01-v1 is active).
- **Breaks when**: Nepic list not flowing through snapshot to renderer
- **Size**: medium
- **Verification**: Boot app with F15 fixture. Query DOM for nepic icons. Verify labels and active state.

#### T-0500-72: CLI set-status → kanban card moves to new column
- **Flow**: `nap set-status 0200-model review` → model → snapshot → kanban re-renders → 0200-model moves from DOING to REVIEW
- **Subsystems**: socket → model → bridge → store → renderer (kanban grouping)
- **Expected**: Card for 0200-model appears in REVIEW column after status change
- **Breaks when**: Kanban derivation caches column assignment, doesn't react to snapshot updates
- **Size**: medium
- **Verification**: Boot app. Toggle kanban. Verify 0200-model in DOING. Send set-status via socket. Wait for snapshot. Verify 0200-model now in REVIEW.

#### T-0500-73: nepic switch → kanban shows different nepic's napkins
- **Flow**: Switch from 01-v1 to 02-spaces → kanban data changes → kanban shows 02-spaces napkins
- **Subsystems**: gutter click → model switch → snapshot → kanban derivation
- **Expected**: Kanban columns reflect new nepic's napkins. Old napkins gone.
- **Breaks when**: Kanban reads from stale snapshot, or nepic switch doesn't trigger re-render
- **Size**: medium
- **Verification**: Open kanban, verify cards from active nepic. Switch nepic. Re-open kanban, verify different cards.

---

### Part 9: edge cases + defensive tests

#### T-0500-80: kanban with zero napkins → five empty columns render
- **Flow**: Nepic with no napkins → kanban opens with five empty columns
- **Subsystems**: renderer (KanbanOverlay)
- **Expected**: All five columns render with count (0). No errors.
- **Breaks when**: Grouping logic crashes on empty napkins array
- **Size**: small
- **Verification**: Render kanban with empty napkins array. Verify 5 columns, all counts = 0.

#### T-0500-81: gutter with single nepic → one icon, (+) button, no crash
- **Flow**: Only one nepic exists → gutter shows one icon + (+)
- **Subsystems**: renderer (Gutter)
- **Expected**: Single icon with active indicator. (+) button below.
- **Breaks when**: Gutter assumes ≥2 nepics
- **Size**: medium
- **Verification**: Boot with single-nepic fixture. Verify one icon + (+) button in DOM.

#### T-0500-82: kanban → navigate while sidebar hidden → sidebar shows + card focused
- **Flow**: sidebarVisible=false → click → on kanban card → sidebar should become visible + card focused
- **Subsystems**: renderer (handleNavigate)
- **Expected**: Navigation from kanban forces sidebar visible if hidden. Card still focused.
- **Breaks when**: Navigate only sets focusedCardSlug without ensuring sidebar is visible — card focused but invisible
- **Size**: medium
- **Verification**: Hide sidebar (Cmd+B). Open kanban. Click →. Verify sidebarVisible=true and focusedCardSlug set.

#### T-0500-83: rapid Cmd+` toggle doesn't break overlay state
- **Flow**: Toggle kanban 5 times rapidly → final state consistent
- **Subsystems**: store (toggleKanban)
- **Expected**: Odd number of toggles = visible, even = hidden. No animation glitches.
- **Breaks when**: Toggle uses async state and races
- **Size**: small
- **Verification**: Call toggleKanban 5 times synchronously. Verify kanbanVisible=true (odd count).

#### T-0500-84: nepic switch during open kanban → kanban re-renders with new data
- **Flow**: Kanban open → switch nepic via gutter → kanban stays open but shows new nepic's cards
- **Subsystems**: store (applySnapshot while kanbanVisible=true)
- **Expected**: Kanban reflects new nepic data without needing close/reopen
- **Breaks when**: Kanban captures snapshot at open time and doesn't react to updates
- **Size**: medium
- **Verification**: Open kanban. Switch nepic. Verify kanban columns now show new nepic's napkins without toggling.

---

### Part 10: existing tests must not break

#### T-0500-90: all existing 0100–0400 tests pass unchanged
- **Flow**: Run full test suite after 0500 changes
- **Subsystems**: all
- **Expected**: No regressions. Specifically: model.test.ts, socket-handler.test.ts, survivability.test.ts/spec.ts, model-layer.spec.ts, cli-integration.spec.ts
- **Breaks when**: AppSnapshot type change breaks existing snapshot assertions, or store shape change breaks existing store tests
- **Size**: small + medium (run existing suites)
- **Verification**: `nap` test runner: vitest for small, playwright for medium. Zero failures.

#### T-0500-91: applySnapshot backward compatible — missing nepics field defaults to []
- **Flow**: Old-format snapshot without `nepics` field → applySnapshot doesn't crash
- **Subsystems**: store (applySnapshot)
- **Expected**: `nepics` defaults to `[]` when absent from snapshot. Gutter renders (+) only.
- **Breaks when**: Destructuring assumes nepics always present
- **Size**: small
- **Verification**: Call applySnapshot with snapshot lacking nepics field. Verify store.nepics = [].

---

### Test matrix summary

| ID | Description | Size | Priority |
|----|-------------|------|----------|
| T-0500-01..05 | Kanban data derivation (grouping, bullets, dots, badges) | small | P0 — data contract |
| T-0500-10..14 | Kanban overlay toggle + layout | medium | P0 — core feature |
| T-0500-20..23 | Kanban → navigation (→ button) | small+medium | P0 — core interaction |
| T-0500-30..33 | Gutter icons + active indicator | small+medium | P0 — core feature |
| T-0500-40..44 | Nepic switching (model + watcher + UI) | small+medium | P0 — core feature |
| T-0500-50..55 | (+) create new nepic | small+medium | P1 — secondary flow |
| T-0500-60..63 | Model + store shape changes | small | P0 — data contract |
| T-0500-70..73 | Integration seams (round-trip) | medium | P0 — catches wiring bugs |
| T-0500-80..84 | Edge cases + defensive | small+medium | P1 — robustness |
| T-0500-90..91 | Regression + backward compat | small+medium | P0 — non-negotiable |

**Total: 40 test cases (17 small, 23 medium, 0 big)**

---

### What NOT to test

- Visual layout / spacing / colors beyond data-testid verification — manual testing territory
- Kanban slide animation (CSS transition) — visual, not programmatic
- Gutter hover effects — CSS-only, no logic
- Sidebar zoom behavior — tested in 0400
- Debug panel — tested in 0400
- Dot system — tested in 0400
- xterm/pty — tested in 0150/0200
- Socket handler routing — tested in 0210

### Design notes

- Kanban is a **read-only view of existing snapshot data** — it derives from napkins grouped by status. No new model methods needed for kanban rendering itself.
- Gutter needs **nepic list in snapshot** — this IS a new model capability (read .nap/nepics/ directory listing).
- Nepic switching is the **deepest integration** — model reload, watcher restart, snapshot push, UI update. This is where bugs live.
- The v2 KanbanOverlay and Gutter are reference implementations. Port styles verbatim, adapt data layer for v3 model/store.
