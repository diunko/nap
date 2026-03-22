# 0600-live-wiring — Engineering Response

## What was built

### 1. Store integration (`src/renderer/store.ts`)
- Added types: `NapkinPhase`, `AgentStatus`, `NapkinEntry`
- Added utility functions: `dotColor`, `isDotHollow`, `isDotPulsing`, `phaseColor`, `terminalStatusToAgent`
- Extended `TerminalMeta` with `role?: string`, `napkinSlug?: string`
- Added state: `napkins: NapkinEntry[]`, `kanbanVisible: boolean`
- Added actions:
  - `setNapkinData` — handles `napkin:update` IPC (both full array and single updates), merges by slug preserving status
  - `mergeNapkinStatus` — handles `napkin:status-changed` IPC, creates placeholder if slug unknown (handles out-of-order delivery)
  - `toggleKanban` — Cmd+` toggle
- Updated `addSocketTerminal` to accept `role` and `napkinSlug`

### 2. NapkinBrowser refactor (`src/renderer/components/NapkinBrowser.tsx`)
- **Removed all imports from `mock-data.ts`** — imports types and helpers from `store.ts` instead
- Architects derived from `store.terminals` where `role === 'architect'`, sorted by createdAt
- Napkin cards derived from `store.napkins` merged with terminal data:
  - Filesystem agents matched to terminals by napkinSlug + creation order
  - Agent status mapped from terminal status: running→run, done→done, exited→exit
- Artifacts display computed from extension strings (`.nap.md` → display "nap.md", extended shows full filename)
- Separator only renders when architects exist
- `StatusDot` exported for reuse by KanbanOverlay

### 3. KanbanOverlay (`src/renderer/components/KanbanOverlay.tsx`)
- **New component** — quake console overlay matching v2-final.html design exactly
- Fixed position, slides from top (0 → 70vh), `#1a1a2e` background, `#007acc` border
- Five columns: BACKLOG, TODO, DOING, REVIEW, DONE with card counts
- Cards: collapsed shows slug + agent dots + → arrow; expanded shows:
  - Napkin bullets from `.nap.md`
  - Artifact badges (filled vs dimmed based on presence in KNOWN_BADGES: nap, spec, test, journeys)
  - Agent chips with status dots
- → click handler: (1) dismiss overlay, (2) focus card in sidebar, (3) switch terminal to best agent (running > done > exited)
- Smooth height transition: `transition: height 0.25s ease`

### 4. Breadcrumb update (`src/renderer/components/Terminal.tsx`)
- Replaced mock-data `deriveBreadcrumb` with store-based derivation
- Maps `activeTerminalId` → find terminal → check role/napkinSlug → derive segments
- Architect terminals show `S > (acting)` or `S > (done)`
- Agent terminals show `S > napkin-slug > terminal-name`
- Click handlers:
  - Click S → switch to architect terminal (finds running architect, falls back to any)
  - Click napkin-name → `expandCard(napkinSlug)` to focus card in sidebar

### 5. IPC wiring (`src/renderer/index.tsx`)
- Added `napkin:update` listener → `store.setNapkinData`
- Added `napkin:status-changed` listener → `store.mergeNapkinStatus`
- Added `kanban:toggle` listener → `store.toggleKanban`
- Updated `socket:terminal-created` handler to pass `role` and `napkinSlug`
- Added `KanbanOverlay` component to JSX (rendered above content as fixed overlay)
- All new listeners properly cleaned up in return function

### 6. Main process changes
- `src/main/main.ts`:
  - `socket:terminal-created` IPC now includes `role` and `napkinSlug` from session
  - Added `kanban:toggle` menu item under View (accelerator: `CmdOrCtrl+\``)
  - After watcher init, sends all existing napkin statuses from SQLite to renderer
  - Added `getAllNapkinStatuses` to test helper exports
- `src/main/napkin-store.ts`: Added `getAllNapkinStatuses()` function
- `src/main/preload.ts`: Added `onToggleKanban` IPC listener, extended `onSocketTerminalCreated` data type
- `src/types/electron-api.d.ts`: Added `onToggleKanban`, `onNapkinStatusChanged`, extended socket data types
- `src/types/nap-test.d.ts`: Added `getAllNapkinStatuses` to test helpers

### 7. Mock data preserved
- `src/renderer/mock-data.ts` kept for reference/testing (as specified)
- No production component imports from it
- Existing layout-mock.test.ts tests still pass (they import mock-data directly)

## Decisions

1. **Agent matching heuristic**: filesystem agent dirs matched to terminals by napkinSlug + creation order. If more terminals than filesystem agents, extras shown. If more filesystem agents than terminals, unmatched show as 'exit' status.
2. **Architect file listings**: Not available from filesystem service (it watches 30-napkins/, not architect dirs). Architect cards show header only (name + dot + label). Extended file listings deferred to a future napkin.
3. **Initial napkin statuses**: Sent as individual `napkin:status-changed` events from SQLite on startup, after filesystem watcher init. This ensures statuses merge correctly regardless of arrival order.
4. **Store merge strategy**: Additive merge by slug — filesystem updates don't clobber status, status updates don't clobber filesystem data. Handles both orderings (T-0600-18 pattern).

## Verification

- `tsc --noEmit`: zero errors
- `vitest run`: 104 passed, 0 failed, 1 skipped (pre-existing)
- All 21 layout-mock tests green (no regression)
