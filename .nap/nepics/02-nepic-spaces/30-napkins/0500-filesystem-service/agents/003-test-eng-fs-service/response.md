# 0500-filesystem-service — Test Results

## Test file

`tests/napkin-watcher.spec.ts` — 18 Playwright medium tests.

## Results

| ID | Test | Result |
|----|------|--------|
| T-0500-01 | readNapkinDir — artifact extensions | PASS |
| T-0500-02 | readNapkinDir — agent dir names | PASS |
| T-0500-03 | readNapkinDir — napkin bullets | PASS |
| T-0500-04 | readNapkinDir — missing .nap.md | PASS |
| T-0500-05 | readNapkinDir — no agents/ dir | PASS |
| T-0500-06 | startup full scan | PASS |
| T-0500-07 | fs.watch — file create | PASS |
| T-0500-08 | fs.watch — file modify | PASS |
| T-0500-09 | fs.watch — file delete | PASS |
| T-0500-10 | debounce batches rapid changes | PASS |
| T-0500-11 | debounce per-napkin-dir | PASS |
| T-0500-12 | empty 30-napkins/ | PASS |
| T-0500-13 | 30-napkins/ doesn't exist yet | PASS |
| T-0500-14 | new napkin dir at runtime | PASS |
| T-0500-15 | IPC payload shape | PASS |
| T-0500-16 | watcher stops on app quit | PASS |
| T-0500-17 | agent dir at runtime | PASS |
| T-0500-18 | concurrent changes during startup | PASS |

**18/18 pass. 0 failures.**

## Regression

- `npm run test:small` — 104 passed, 1 skipped (unchanged)
- `npm run test:medium` — 120 passed, 4 skipped, 1 failed (pre-existing flaky T-0100-02: xterm input reverse path timeout — unrelated to this feature)

## Typecheck

`tsc --noEmit` — zero errors.

## Implementation notes

- Each test group gets its own `launchApp()` instance with isolated tmpDir.
- T-01 through T-05 and T-15 test `readNapkinDir` directly via `app.evaluate` — no watcher needed.
- T-06 through T-18 use a `startWatcherWithCapture` helper that: sets up an IPC listener in the renderer, starts the watcher from main process via `__napTest`, discards the initial scan payload, then captures incremental updates.
- fs.watch timing: allowed 1000ms after file operations (200ms debounce + FSEvents latency + margin).
- T-0500-13 (missing 30-napkins/) exercises the parent-dir watcher — confirmed it detects `30-napkins/` creation and starts the recursive watcher.
- No manual test cases in the `.test.md` — all 18 implemented.
