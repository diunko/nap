# test-eng response2 — fixes-01

## Results

```
vitest:     191 passed (191) — 14 test files
tsc:        0 errors
playwright: 52 passed, 2 failed (excluding GL-M VPN + PG-P playground)
```

The 2 remaining failures:
- **DS-P3-01** — missing import (fixed but not yet re-run in full suite)
- **MC-M01** — monaco command test, pre-existing failure unrelated to fixes-01

## What I did

### Fixed LP-P03, LP-P04, LP-P07 for new auth error UI

The fixes-01 changes altered how clone errors render:
- Non-existent repo now returns 401 (GitHub behavior), classified as "authentication failed"
- New `LoadingGate` shows inline token form (`data-testid="inline-token-input"` + `data-testid="save-and-retry"`) instead of plain error text when auth fails with no token
- LP tests were looking for "repository not found" / "can't reach" — updated to detect "authentication failed" and the inline form

**LP-P03** now verifies: inline token input visible, save & retry button visible, retry-all link visible, early steps have checkmarks, no header-bar during error.

**LP-P04** now verifies: enter fake token → save & retry → step re-runs → fails again (repo still doesn't exist) → error reappears.

**LP-P07** same pattern: retry-all → pipeline restarts from step 0.

### Fixed cloneFixtureRepo null safety

`cloneFixtureRepo` in `fixtures.ts` crashed with `Cannot read properties of undefined (reading 'getState')` because with the new `globalReady` async boot, `__napStore__` doesn't exist until the session step completes. Fixed to use optional chaining: `__napStore__?.getState()?.navSections?.length > 0`.

### Fixed debug-scenarios import

Added missing `waitForPanelReady` import in `debug-scenarios.test.ts`.

## Bugs found

### Bug 1: cloneFixtureRepo races with async boot (fixtures.ts)

With fixes-01, `App` now has `globalReady` state that gates boot. The `initGlobalTokens()` + `initGlobalDebugMode()` calls are async. This delays session creation, so `__napStore__` is undefined for longer. The `cloneFixtureRepo` helper accessed it without null check → TypeError.

**Fix:** `__napStore__?.getState()?.navSections?.length > 0` with optional chaining.

### Bug 2: LP tests assumed 404 but got 401 (lp-loading-pipeline.test.ts)

GitHub returns 401 (not 404) for non-existent repos when no auth token is provided. With the new `e.data?.statusCode` fallback in error classification, this is now correctly classified as "authentication failed". LP-P03/P04/P07 were looking for "repository not found" text.

**Fix:** Updated tests to expect "authentication failed" + inline token form. Created shared `waitForCloneError` helper that matches any of the three error patterns.

## What I didn't implement

### FX-P30, FX-P31 (inline token form end-to-end)

These require a private test repo with known credentials to test the full flow: 401 → enter real token → save & retry → clone succeeds. LP-P04 partially covers the retry mechanism (enter fake token → re-run → fail again) but can't test successful recovery without real auth.

### FX-S01..S04 (debug flag vitest), FX-S10..S16 (global tokens vitest), FX-S30..S36 (inline form vitest)

The fs-eng already wrote vitest tests for these (191 passing). I focused on Playwright-level regressions since that's where the fixes-01 changes broke things. The vitest layer is already covered.

### FX-P20 (real GitLab error capture)

Requires VPN to gitlab.grammarly.io. The fs-eng already wrote `fx-error-capture.test.ts` for this. Skipped without VPN.

## Surprise

GitHub returning 401 (not 404) for non-existent repos was the key insight. Without auth, GitHub doesn't distinguish "repo doesn't exist" from "you're not authorized" — both return 401. This means the inline token form correctly shows up in this case (you really might need a token), but it also means you can't reliably trigger a "repository not found" error in Playwright tests without a valid token that has access to some repos but not the target one. The current test approach (non-existent repo → 401 → inline form → fake token → retry → still 401) is the best we can do without a private fixture repo.
