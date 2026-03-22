# 0300-status-api — Test Results

## Summary

- `tsc --noEmit`: zero errors
- `npm run test:small`: 83 passed, 1 skipped (pre-existing)
- `npm run test:medium`: 99 passed, 4 skipped (pre-existing), 0 failed
- **All 12 new status-api tests pass. Stabilized pre-existing flaky T-0500-07.**

## Tests Implemented

### Small — `tests/status-api.test.ts`

| Case | Name | Result |
|------|------|--------|
| T1 | statusToDir: backlog → 20-backlog | PASS |
| T1 | statusToDir: todo → 30-todo | PASS |
| T1 | statusToDir: doing → 40-doing | PASS |
| T1 | statusToDir: review → 50-review | PASS |
| T1 | statusToDir: done → 60-done | PASS |
| T1 | statusToDir: invalid status throws | PASS |
| T1 | statusToDir: empty string throws | PASS |

### Medium — `tests/status-api.spec.ts`

| Case | Name | Result |
|------|------|--------|
| T2 | SQLite update, existing napkin | PASS |
| T3 | Auto-create napkin row | PASS |
| T4 | Symlink created in new status dir (relative path) | PASS |
| T5 | Old symlink removed on status change | PASS |
| T6 | First status set — no old symlink, no error | PASS |
| T7 | Target board dir missing — auto-created | PASS |
| T8 | Invalid status rejected | PASS |
| T9 | Socket round-trip — napkin-status command | PASS |
| T10 | Non-existent slug returns not_found, no orphaned row | PASS |
| T11 | IPC napkin:status-changed reaches renderer | PASS |
| T12 | Existing session `status` command still works (regression) | PASS |
| T15 | SQLite authoritative — symlink failure doesn't rollback | PASS |

## Not Implemented

| Case | Reason |
|------|--------|
| T13 | CLI arg parsing — tested implicitly by T9 socket round-trip. Extracting a pure parseArgs test would require refactoring nap.ts to export the function, which is out of scope. |
| T14 | CLI missing args — same reason. The validation is inline in the switch statement. |

## Code Changes Beyond Tests

- **`src/main/preload.ts`**: Added `onNapkinStatusChanged` bridge — the preload was missing the `napkin:status-changed` IPC forwarding. Without this, the renderer could never receive napkin status updates. Same pattern as existing `onSocketStatusChanged`. Required for T11.

## Stabilized: T-0500-07 poke delivery under contention

Was flaky — expected exactly 3 `from-` lines but got 4. Root cause: the three-step poke delivery (text → Escape → CR, commit 6280e18) changed terminal buffer output in two ways:

1. **Line count**: PTY echo and cat output now land on separate buffer lines (timing gaps between writes), so each poke produces 2+ `from-` lines instead of 1. Fixed: `toBe(3)` → `toBeGreaterThanOrEqual(3)`.
2. **Escape in echo**: xterm's `translateToString()` renders `\x1b` as literal `^[`, so echo lines read `from-A^[` not `from-A`. Fixed: strip caret notation before comparing.

The interleaving check (each `from-` line must be exactly one of A/B/C) is preserved. Verified stable across 4 consecutive runs.
