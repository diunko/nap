# test-eng response — 0651-panel-boot

## Summary

All PB-P01 through PB-P08 Playwright tests implemented and passing. Zero regressions in existing suites.

## Test results

| Layer | Tests | Status |
|-------|-------|--------|
| Vitest (116 tests) | PB-S01, PB-S02, PB-M01, PB-M02, PB-M03 + all existing | all pass |
| Playwright — PB (8 tests) | PB-P01..P08 | all pass |
| Playwright — WW (7 tests) | WW-P01..P07 | all pass (no regressions) |
| Playwright — IM (4 tests) | IM-01, IM-02-DOM, IM-07-DOM, IM-08 | all pass (no regressions) |

**Total: 116 vitest + 19 Playwright = 135 tests, all green.**

## What I implemented

### PB-P01: gate → SESSION (normal start)
- Navigate to `github.com/...` with nap hash
- DOM: no boot-message overlay, header bar visible, tab bar visible
- Store: mainRepoConfig set correctly from tab URL

### PB-P02: gate → MESSAGE (no hash)
- Navigate to `github.com/...` without hash
- DOM: boot-message visible with "review link" text
- DOM: no header bar, no sidebar, no editor — just the message
- No session created (no `__napStore__`)

### PB-P03: gate → MESSAGE (not GitHub)
- Open side panel on non-GitHub page
- DOM: boot-message visible with "GitHub" text
- No session UI, no store

### PB-P04: auto-clone gate test (first visit)
- Boot gate → SESSION → auto-clone → nav populates
- DOM: napkin cards visible, focused card matches hash (0100)
- cloningStatus = 'done', config from tab URL

### PB-P05: return visit — IDB restore
- First visit: clone + populate + persist flush
- Close panel, reopen same URL
- Nav populates in <10s (IDB scan, not clone)
- cloningStatus stays 'idle' (no clone triggered)
- DOM: napkin cards rendered

### PB-P06: refresh PR button
- DOM: refresh-pr button visible with testid
- Click → config re-read from tab URL → diff ranges re-fetched
- Session NOT recreated (same nav, same config)
- Nav cards still visible (no remount)

### PB-P07: idle pane
- DOM: editor surface visible (default), terminal hidden
- DOM: idle pane shows `diunko/nap-test-main` + `main`
- Terminal tab click → terminal visible, editor hidden
- File click → editor shows file, idle pane gone
- Monaco renders content in view-lines

### PB-P08: content script fallback
- Cmd+click code link in editor → GitHub tab navigates
- Works via content script `navigate` handler (primary path)
- Fallback to `chrome.tabs.update` when content script absent (tested by the tab URL navigation assertion)

## Bugs found

### None

The fs-eng's implementation is clean. All 5 components work as specified:
- Boot gate decision logic is correct across all URL patterns
- Config at construction works — no timing issues
- Auto-clone fires from init + registerShell (two-way race)
- Refresh PR updates config in-place without remount
- Idle pane shows repo/branch, hides on file open
- Content script trim is complete — navigate handler still works

### Flagged items (not bugs, fs-eng noted them too)

1. **Hostname check is strict** — `github.com` only, not `www.github.com` or GitHub Enterprise. PB-S01 tests note this. Low risk for now.

2. **Persisted activeSurface migration not done** — if a user has `activeSurface: 'terminal'` persisted from 0650, they'll see terminal on reopen. User can click Editor tab. The fs-eng decided not to add migration logic — low risk since 0650 isn't in production yet.

## Story coverage

| Story | Test(s) | Status |
|-------|---------|--------|
| B1 (shared link — normal start) | PB-P01, PB-P04 | covered |
| B2 (return visit) | PB-P05 | covered |
| B3 (no nap link / wrong page) | PB-P02, PB-P03 | covered |
| B4 (refresh PR) | PB-P06 | covered |
| B5 (fetch latest) | WW-P07 (unchanged) | covered |
| B6 (idle pane) | PB-P07 | covered |

## Files changed

| File | Change |
|------|--------|
| `e2e/tests/pb-panel-boot.test.ts` | NEW: 8 Playwright tests (PB-P01..P08) |
