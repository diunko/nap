## Test Results — 0900-reconciliation

### All 12 tests green

| Test | Name | Result | Time |
|------|------|--------|------|
| T-0900-01 | Happy path — all dirs match SQLite | PASS | 6ms |
| T-0900-02 | New napkin dir — no SQLite entry | PASS | 6ms |
| T-0900-03 | New agent dir — no SQLite session | PASS | 7ms |
| T-0900-04 | Orphaned napkin — SQLite row, no dir | PASS | 4ms |
| T-0900-05 | Orphaned session — SQLite row, no agent dir | PASS | 5ms |
| T-0900-06 | Branch switch round-trip — orphan then reconnect | PASS | 8ms |
| T-0900-07 | Empty 30-napkins/ — no dirs at all | PASS | 6ms |
| T-0900-08 | Missing 30-napkins/ — dir doesn't exist | PASS | 3ms |
| T-0900-09 | Agent dir with no prompt.md | PASS | 5ms |
| T-0900-10 | Reconciliation runs before UI renders | PASS | 158ms |
| T-0900-11 | Performance — 40 napkins x 3 agents < 100ms | PASS | 16ms |
| T-0900-12 | Never deletes rows, never deletes files | PASS | 8ms |

### Regression check

- `npm run test:small` — 123 passed, 1 skipped (pre-existing)
- `npm run test:medium` — 177 passed, 4 skipped (pre-existing)
- `tsc --noEmit` — zero errors

### Test file

`tests/reconciliation/reconciliation.spec.ts` — 12 medium tests (Playwright + Electron)

### Approach

All tests use `app.evaluate` to call `reconcile(nepicDir, db)` directly inside the Electron main process, then query SQLite to verify outcomes. Each test suite gets its own temp dir via `launchApp()`. Filesystem state (napkin dirs, agent dirs) is created on the test side with `fs.mkdirSync`, then reconcile is called on the main process side.

T-0900-10 is the only test that creates dirs *before* app launch to verify startup sequencing.

### No manual tests

No test cases in the `.test.md` were marked manual — all 12 implemented.

### No untestable cases

All test cases implementable as specified.
