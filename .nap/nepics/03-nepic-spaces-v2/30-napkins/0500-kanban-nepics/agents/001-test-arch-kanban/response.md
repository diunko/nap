## test architect — 0500 kanban + gutter + nepic switching

### What I read
- Role file, promise, napkin, spec
- All v3 src/ and tests/ (model, store, bridge, renderer, fixtures, 18 test files)
- v2 KanbanOverlay.tsx (359 lines) — five columns, card expand, → navigate, Cmd+` toggle
- v2 Gutter.tsx (194 lines) — nepicLabel derivation, click handler, (+) button, inline input
- Designer screenshots 01 (gutter) and 04 (kanban) + voiceover
- bridge-types.ts — current AppSnapshot shape (missing nepics field)
- Existing test.md files (0100, 0150, 0200, 0210, 0400) for format reference

### Test architecture delivered

**40 test cases** across 10 parts:

1. **Kanban data derivation** (5 small) — grouping by status, bullets, dots, badges. Pure function territory.
2. **Kanban overlay toggle + layout** (5 medium) — Cmd+` toggle with macOS fallback, five columns, card collapse/expand.
3. **Kanban → navigation** (4 small+medium) — → button: dismiss kanban + focus sidebar card + switch to best agent. Priority heuristic tested as pure function.
4. **Gutter icons** (4 small+medium) — nepicLabel derivation, active indicator, (+) button.
5. **Nepic switching** (5 small+medium) — the deepest integration seam. Model reload, watcher restart, ui-state persistence, sidebar update.
6. **Create new nepic** (6 small+medium) — (+) flow: input overlay, scaffold dirs, architect stub, error cases.
7. **Model + store shape** (4 small) — AppSnapshot.nepics, store.kanbanVisible, store.nepics, store.switchNepic.
8. **Integration round-trips** (4 medium) — model → snapshot → store → kanban/gutter renders correctly. CLI set-status → kanban card moves column.
9. **Edge cases** (5 small+medium) — zero napkins, single nepic, navigate while sidebar hidden, rapid toggle, switch during open kanban.
10. **Regression** (2 small+medium) — all 0100–0400 tests still pass, applySnapshot backward compatible.

### Two new fixtures
- **F14**: kanban fixture — 5 napkins across all 5 phases, 1 nepic
- **F15**: multi-nepic fixture — 3 nepics for gutter/switching tests

### Where bugs live
1. **Nepic switching** — model reload + watcher restart is the riskiest seam. If watcher doesn't restart for new dir, stale data.
2. **Cmd+` macOS conflict** — system shortcut steals the accelerator. Fallback keydown handler is critical (v2 had this bug).
3. **applySnapshot backward compatibility** — adding nepics to AppSnapshot could break existing tests if destructuring assumes the field exists.
4. **Kanban → navigate atomicity** — three actions (dismiss, focus, switch terminal) must happen without intermediate renders showing broken state.

### What I left out
- Visual layout/animation — manual territory
- Dot system — fully tested in 0400
- Sidebar zoom — fully tested in 0400
- Socket routing — tested in 0210
