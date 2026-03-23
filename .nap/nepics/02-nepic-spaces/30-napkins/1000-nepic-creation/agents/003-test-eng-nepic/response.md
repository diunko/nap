## Test Results — 1000-nepic-creation

All 17 tests pass. Zero type errors (`tsc --noEmit`).

### Tests implemented

| ID | Name | Result |
|---|---|---|
| T-1000-01 | directory scaffold — all required subdirs created | PASS |
| T-1000-02 | slug generation — NN is next available number | PASS |
| T-1000-03 | slug generation — first nepic ever | PASS |
| T-1000-04 | SQLite — nepic row inserted with is_active=1 | PASS |
| T-1000-05 | SQLite — previous nepic deactivated | PASS |
| T-1000-06 | SQLite — multiple previous nepics all deactivated | PASS |
| T-1000-07 | architect session created in SQLite | PASS |
| T-1000-08 | architect pty spawned with correct command | PASS |
| T-1000-09 | architect prompt.md template created | PASS |
| T-1000-10 | ui_state updated with new active nepic | PASS |
| T-1000-11 | renderer notified — gutter re-renders with new icon | PASS |
| T-1000-12 | renderer notified — architect terminal appears and is active | PASS |
| T-1000-13 | previous nepic's sessions keep running | PASS |
| T-1000-14 | naming collision — duplicate name | PASS |
| T-1000-15 | missing .nap/ dir — created on demand | PASS |
| T-1000-16 | napkin watcher starts for new nepic | PASS |
| T-1000-17 | end-to-end — (+) click through architect terminal | PASS |

### Manual / not tested

Per `.test.md`: name input UI visual correctness, gutter animation, architect prompt quality, onboarding package generation.

### Fixes applied

1. **`forceCleanup` in nepic-creation tests** — previous engineer defined `forceCleanup` (using `app.exit(0)`) but never used it. All afterAll blocks used `cleanupApp` which waits for pty teardown, causing cascading timeouts. Switched all afterAll to `forceCleanup`, then upgraded it to use `teardownPtys()` + `app.quit()` for clean exits.

2. **macOS crash recovery dialog** — `app.exit(0)` caused macOS to show "unexpectedly quit" dialog on next Electron launch, blocking `firstWindow()`. Fixed by adding `ApplePersistenceIgnoreState` user default in test mode.

3. **macOS crash reporter dialog** — `killAllPtys()` disposed data handlers but not exit handlers. When `app.quit()` tore down V8, node-pty's native thread tried to call back into destroyed JS → segfault → macOS crash dialog. Fixed by adding `teardownPtys()` that disposes both data and exit handlers.

4. **Parallel test workers** — bumped Playwright workers from 1 to `'50%'` (half of CPU cores). All 194 medium tests pass in ~55s (was ~3min with workers=1). Required fixes #2 and #3 above.

### Files modified

- `tests/nepic-creation/nepic-creation.spec.ts` — switched cleanup to `forceCleanup` with `teardownPtys`
- `src/main/main.ts` — added `teardownPtys` on `__napTest`, `killAllPtys` on `__napTest`, `ApplePersistenceIgnoreState` for test mode, `systemPreferences` import
- `src/types/nap-test.d.ts` — added `killAllPtys` and `teardownPtys` to type
- `playwright.config.ts` — workers changed from 1 to `'50%'`
- `tests/helpers.ts` — no net changes (reverted `--user-data-dir` hack)
- `tests/poke-nap-done/poke-nap-done.spec.ts` — no net changes (reverted `--user-data-dir` hack)
- `tests/polish/polish.spec.ts` — no net changes (reverted `--user-data-dir` hack)
