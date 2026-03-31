## Test architect response — 0610 nepic creation debug

### What I read
- All 7 bugs + 2 fixes in the napkin
- Expected flow, designer journeys (J1, J5, full 00-journeys)
- All source files in `packages/v3/src/` (28 files)
- All test files in `packages/v3/tests/` (22 files)
- Bug bash learnings from 0220 (the nap-wait race, done persistence, on-demand resume)

### What I produced
`0610-nepic-creation-debug.test.md` — 29 test cases across 10 sections:

1. **Cross-nepic isolation (Bug 1)** — 4 tests. The core invariant: createNepic must never write to old nepic markers. Tests check marker files before/after, ephemeral set leakage, and full round-trip through switch-away-switch-back.

2. **Watcher ENOTDIR (Bug 2)** — 4 tests. `getNepics` must exclude `ui-state.json` and non-dirs. Also tests graceful handling if someone passes a non-dir slug to switchNepic, and verifies watcher path is correct after creation.

3. **Terminal activation (Bug 3)** — 3 tests (1 medium). Running agents must have valid ptys after startAgents. Exited agents need pty:resume on demand. Medium test verifies the markReady→flush→data pipeline.

4. **Previous nepic workable (Bug 4)** — 4 tests. Switch-back must load correct napkins/architects, bridge must reflect correct nepic, and ptys must NOT be killed on switch.

5. **Watcher coverage (Bug 5)** — 3 tests. `startWatching` must cover both `30-napkins/` AND `20-architects/`. Tests change architect marker externally and verify model picks it up.

6. **Architect auto-start (Bug 6)** — 4 tests. computeResumeActions must handle architects in all cases (A, B, C). startAgents must actually spawn architect pty. Fresh architect on new nepic must have correct prompt path.

7. **Missing prompt.md (Bug 7)** — 3 tests. createNepic must scaffold prompt.md. Fresh start command must reference a file that exists. Content must be valid template, not empty.

8. **Display string fix** — 1 manual test. "lead" not "acting".

9. **Debug panel overlay** — 1 medium test. Terminal width unchanged on toggle.

10. **Multi-nepic invariants** — 5 tests. nepicId consistency, ui-state.json accuracy, creation atomicity, concurrent creation safety, done+exited state survives nepic switch.

### Key insights from reading the code

**Bug 1 root cause hypothesis**: The model's ephemeral `doneAgents` and `runningAgents` sets persist across nepic switches. `loadFromFilesystem` at line 326 reapplies them: `if (doneAgents.has(agent.id)) agent.done = true`. If any operation during nepic creation accidentally adds the old architect's ID to `doneAgents`, the old architect gets `done: true` when you switch back. The `switchNepic` → `loadFromFilesystem` → `stopWatching` → debounced handler sequence is the likely race window.

**Bug 2 root cause**: `getNepics()` already filters `ui-state.json` (line 336), but `switchNepic` doesn't validate the slug. If the renderer somehow passes an invalid slug (from a stale nepic list before the filter was added), `startWatching(base + '/ui-state.json')` → ENOTDIR.

**Bug 5 root cause**: `startWatching` at line 366 only watches `dir + '/30-napkins'`. Simple fix: add a second watcher for `dir + '/20-architects'`.

**Bug 7 root cause**: `createNepicFn` at line 702 writes `.agent.nap.json` but never writes `prompt.md`. The template exists at `src/templates/nepic/20-architects/001-architect/prompt.md`.

**What the existing tests miss**: No test operates across two nepics. All fixtures use a single nepic dir. The multi-nepic fixture (F15) tests switching and listing but not creation + switch + switch-back with running agents. The dangerous gap is ephemeral state leaking across nepic boundaries — the `runningAgents`/`doneAgents` sets are global but the model only loads one nepic at a time.

### What 0220's bugs taught me (applied here)
1. **Synchronous mocks hide async races**: The bug-1 corruption may only manifest with real filesystem timing. I marked cross-nepic-with-running-agents tests as candidates for medium tests if small tests don't reproduce.
2. **Tests derived from code vs requirements**: The existing tests verify switching works. None verify that switching doesn't damage the OTHER nepic. T-0610-01 through T-0610-04 explicitly test the "don't touch" invariant.
3. **State matrix over individual cases**: T-0610-04 checks ALL agents, not just the architect. If any agent's state changes, the test fails. This is the pattern from 0220's done-vs-exited matrix.
