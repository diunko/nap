## Test architect response — 0400 sidebar zoom

### What I designed

40 test cases across 10 areas, written to `0400-sidebar-zoom.test.md`. 17 small (vitest), 23 medium (Playwright). No big tests — the integration test in 0500 covers end-to-end.

### Three parts, three risk profiles

**1. Dot colors (T-0400-01..06)** — P0, small tests only. This is the known bug from the bug bash (dots colored by role, not status). I designed a full state matrix covering all 5 lifecycle states: running, done, done+exited, exited, not-started. Each maps to a specific color + visual treatment (hollow, pulsing, dashed). Pure function tests — no DOM, no IPC.

Flagged one spec ambiguity: when an agent is both running AND done (called `nap done` but pty still alive), which color wins? Recommended running (green) takes visual precedence. Architect should resolve.

**2. Focused/extended views (T-0400-20..36)** — P0, mostly medium tests. The seam here is the data contract: `NapkinState` and architect snapshot data must include file entries (type, name, absPath) for the renderer to display them. I designed small tests for the data derivation (T-0400-50..53) and medium tests for the DOM rendering. Key cases:
- Napkin focused: `<slug>.nap.md` detected and rendered first
- Architect focused: one level deep only (dirs collapsed)
- Extended: all levels, hover controls, [terminal] virtual entries
- NO [diff] — negative test to catch accidental v2 port

**3. Filesystem watcher + debug panel (T-0400-60..77)** — Mixed sizes. The watcher is already proven at model level (0150), but the wiring in `main.ts` and the new file tree data in snapshots need medium tests. Key test: write a file to disk → verify it appears in the extended view (T-0400-61). For the debug panel, I test the three tabs + persistence to ui-state.json.

### What I learned from the bug bash

The bug bash report (`002-fs-eng-debug/response.md`) identified three classes of testing failures:
1. **Synchronous mocks hiding async races** — I didn't add timing-sensitive tests here (those belong in a stress tier), but the watcher debounce tests (T-0400-63..64) verify the suppression logic works.
2. **Tests derived from code, not requirements** — Every test case traces back to a spec line or napkin bullet. I avoided looking at the current implementation to decide what the test should assert.
3. **Missing user journey tests** — The focused/extended click flows (T-0400-22, 23, 34) test cross-layer journeys that weren't covered before.

### Store contract

The store needs new fields: `focusedCardSlug`, `cardViewMode`, `sidebarVisible`. I designed small tests (T-0400-80..82) to verify these fields exist and that `applySnapshot` doesn't overwrite renderer-only state. This is the kind of contract test that catches bugs early.

### What I didn't test

- Visual layout / CSS — manual territory
- [diff] — cut
- Kanban/gutter — 0500
- Debug panel drag resize — existing, unchanged
- xterm/pty rendering — 0150/0200

### Ready for implementation

The test document is structured so the implementing engineer can work through it top-down: dot color function first (pure, quick win), then store shape, then model/bridge file tree data, then renderer components, then watcher wiring, then debug panel tabs. Each section has fixtures, verification methods, and break-when analysis.
