# 0600-live-wiring — Test Engineer Response

## Results

- `npm run test:small`: **114 passed**, 1 skipped (pre-existing), 0 failed
- `npm run test:medium`: **136 passed**, 4 skipped (pre-existing), 0 failed
- `tsc --noEmit`: zero type errors

## Test Files Created

### Small tests (vitest)

**`tests/live-wiring/store-merge.test.ts`** — 5 tests
- T-0600-18: status before filesystem → placeholder created, filesystem merges correctly
- T-0600-18: filesystem before status → status merges without clobbering
- T-0600-18: multiple filesystem updates preserve status
- T-0600-18: setNapkinData with array creates multiple napkins
- T-0600-18: toggleKanban flips kanbanVisible

**`tests/live-wiring/kanban-render.test.ts`** — 5 tests (React + jsdom)
- T-0600-07: 5 columns always present, cards distributed by status
- T-0600-07: napkins without status default to backlog column
- T-0600-08: expanded card shows napkinBullets text
- T-0600-09: present artifacts filled (#9cdcfe), missing dimmed (#6b7280)
- T-0600-10: 3 agents with different statuses render 3 dots with correct colors

### Medium tests (Playwright)

**`tests/live-wiring/live-wiring.spec.ts`** — 13 tests
- T-0600-01: store.napkins populated with data matching fixture slugs
- T-0600-02: store napkin has both artifacts (from fs) and status (from SQLite)
- T-0600-03: socket:status-changed updates terminal status in store
- T-0600-04: rendered napkin names match real filesystem, not mock data
- T-0600-05: napkin card phase badge text matches SQLite status
- T-0600-06: kanban overlay toggles on/off via IPC
- T-0600-11: navigation handler dismisses overlay, focuses card, switches terminal
- T-0600-12: breadcrumb segments contain napkin slug and agent name
- T-0600-13: clicking S breadcrumb switches to architect terminal
- T-0600-14: clicking napkin name in breadcrumb sets focusedCardSlug
- T-0600-15: writing .test.md file updates store artifacts in real-time
- T-0600-16: creating agent dir updates store agents list
- T-0600-17: terminal receives output while kanban is open, cols unchanged

### Regression fixes

**`tests/layout-mock.spec.ts`** — T-0400-05 updated
- NapkinBrowser now reads from `store.napkins` (empty at startup), not mock data
- Populates store with 4 fixture napkins before filter test
- Adjusted assertion from 8 → 4 total napkins

**`tests/polish/polish.spec.ts`** — T-0600-20, T-0600-21 updated
- Same issue: populates store with 8 fixture napkins before filter tests
- T-0600-21 assertion unchanged (8 napkins, matches injected count)

### T-0600-19: regression suite

All pre-existing tests pass. The live wiring changes don't break terminal switching, scroll lock, Cmd+B toggle, Cmd+W close, buffer preservation, or any other terminal mechanics.

## Notes

- **jsdom color normalization**: jsdom converts hex colors (#22c55e) to rgb format (rgb(34, 197, 94)). Dot and badge color assertions use `toContain` with distinctive rgb channel values instead of exact hex comparison.
- **React rendering in vitest**: Used `createRoot` + `act()` from React 18 to render KanbanOverlay in jsdom. No @testing-library/react needed.
- **Card expansion in jsdom**: Click targeting requires finding the slug `<span>` element and clicking it (event bubbles to parent `onClick` handler). Clicking the outer container div doesn't trigger the inner handler.
