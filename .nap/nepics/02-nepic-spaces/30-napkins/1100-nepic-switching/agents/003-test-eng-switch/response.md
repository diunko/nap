# 1100-nepic-switching — Test Results

## Summary

12 tests implemented, all green. No small tests (all seams require Electron IPC + real SQLite).

## Test Results

| Test | Name | Result |
|------|------|--------|
| T-1100-01 | SQLite is_active toggle | PASS |
| T-1100-02 | Watcher switches to new nepic dir | PASS |
| T-1100-03 | Napkin statuses from SQLite | PASS |
| T-1100-04 | Terminal switches to new architect | PASS |
| T-1100-05 | No-architect edge case | PASS |
| T-1100-06 | Ptys survive switch | PASS |
| T-1100-07 | Gutter highlight moves | PASS |
| T-1100-08 | ui_state persistence | PASS |
| T-1100-09 | Round-trip preserves state | PASS |
| T-1100-10 | Sidebar shows new nepic napkins | PASS |
| T-1100-11 | Rapid switching stability | PASS |
| T-1100-12 | Same nepic click is no-op | PASS |

## Full suite regression

- `npm run test:small` — 123 passed, 1 skipped
- `npm run test:medium` — 206 passed, 4 skipped, 0 failed

## Skipped (manual / future per .test.md)

- Gutter animation
- Sidebar scroll position per nepic
- Terminal breadcrumb update
- Kanban overlay visual correctness
- Multiple agents per nepic

## Notable findings

### Race condition in rapid switching (T-1100-11)

When three switches fire without awaits, three concurrent `nepic:switch` IPC handlers run on main. Each calls `stopNapkinWatcher()` + `await startNapkinWatcher(newDir)`. The full scans from all three complete and send `napkin:update` to the renderer. The last scan to arrive wins in the store (array = replace).

The `switchNepic` store action's generation guard (`if (get().activeNepicId !== id) return`) protects against stale IPC results (statuses + architectSessionId), but the `onNapkinUpdate` listener in `index.tsx` has no guard — it calls `setNapkinData` unconditionally.

In practice, the scans complete in FIFO order (same event loop, similar-sized dirs), so the last switch's data arrives last. The test passes. But under load (many concurrent file operations), scan completion order is not guaranteed. If a stale scan arrives after the correct one, the store would show wrong napkins.

**Not blocking** — the generation guard covers the critical path (activeNepicId, terminal switching, statuses). Napkin data self-corrects on the next file change event since the final watcher is watching the correct dir.

## File written

`tests/nepic-switching/nepic-switching.spec.ts` — 12 medium tests
