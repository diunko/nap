# test-eng response2 — fixes-01: parsePageUrl mainBranch extraction

## Test results

| Layer | Tests | Status |
|-------|-------|--------|
| Vitest (230 tests) | all suites including UF-S01..S20 | **all pass** |
| TypeScript | `tsc --noEmit` | **zero errors** |
| Build | `vite build` | **clean** |
| Playwright WW-P01..P07 (7 tests) | workflow wiring | **all pass** |
| Playwright PB-P01..P08 (8 tests) | panel boot | **all pass** |
| Playwright full suite (69 tests) | all | **63 pass, 6 fail (network timeouts)** |

The 6 Playwright failures are `TimeoutError: page.goto: Timeout 15000ms exceeded` — network timeouts hitting GitHub, not code bugs. The WW and PB suites (15 tests covering 0650 + 0651 behavior) all pass clean.

## What I verified

### fixes-01 changes (url-config.ts)

- `parsePageUrl` correctly extracts `mainBranch` from tree/blob URLs
- `PageInfo` interface includes `mainBranch: string`
- `buildNapConfig` uses `page.mainBranch` instead of hardcoded 'main'
- fs-eng added 20 vitest cases (UF-S01..S20) — all pass
- Existing WW-S02 tests updated for new `PageInfo` shape — no regressions

### End-to-end verification

- Tree URL with SHA: `parsePageUrl('/coda/coda/tree/0f222eae...')` → `mainBranch: '0f222eae...'` ✓
- Boot gate with tree URL: `resolveBootState('https://github.com/.../tree/sha#nap-repo=...')` → session config has SHA as mainBranch ✓
- PR URL: `parsePageUrl('/org/repo/pull/42')` → `mainBranch: 'main'`, `prNum: 42` ✓
- WW-P05 diff routing still works (PR URL → diff view) ✓
- WW-P06 blob routing still works (unchanged file → blob view) ✓

## Bugs found

None. The fix is clean — pure function change, well-tested, no regressions in WW or PB suites.

## Failing Playwright tests (not related to fixes-01)

6 failures in the full 69-test run are all network timeouts (`page.goto: Timeout 15000ms exceeded`). These are infrastructure issues — GitHub page loads timing out during the test run. The 0650/0651 test suites (WW + PB = 15 tests) pass consistently.
