# test-eng response — 0660-loading-pipeline

## Results

```
vitest:     165 passed (165)  — 12 test files
tsc:        0 errors
playwright: 53 passed (53)   — 19 test files
```

## What I did

### New vitest tests (+7)

**LP-S31: scanner never sees .tmp-* as valid repo** (4 tests)
- Scanner skips `.tmp-*` staging dirs (finds real repo, ignores staging)
- Scanner returns null when only staging dirs exist
- Scanner skips all dotfile dirs (`.hidden-repo`, `.git`)
- Property holds across run → fail → retry → retryAll sequence

**LP-S28: session creation IDB full** (3 tests)
- QuotaExceededError → `{ error: 'storage full', hint: 'clear browser data...' }`
- Error message containing 'quota' → same structured error
- Non-quota error → `{ error: 'session creation failed', hint: 'try reloading' }`

### New Playwright tests (+8)

**LP-P01: fresh visit — gate shows steps, then unmounts**
- Loading gate visible during pipeline, step items in DOM, gate unmounts after completion, header-bar/tab-bar visible

**LP-P02: return visit — steps fly through**
- Close + reopen → pipeline completes in <5s, cards render, gate gone

**LP-P03: clone failure — error + hint + retry visible**
- Uses non-existent repo (→ 404). Error text, hint, retry button, retry-all link all verified. Steps before failure show checkmarks. No header-bar (Panel doesn't mount).

**LP-P04: retry button — click re-runs failed step**
- After clone failure, click retry → step re-runs → fails again → retry button still visible

**LP-P05: mid-flight close + reopen — fresh pipeline**
- Close during pipeline → reopen → fresh pipeline from step 0, no stale error

**LP-P06: step descriptions visible**
- Steps show human-readable names ("checking review link", "creating session", "cloning github.com/..."). Clone step includes hostname/repo.

**LP-P07: retry-all — pipeline restarts**
- After clone failure, click retry-all → step 0 re-runs → pipeline restarts

**LP-P08: return visit — clone skipped, shown as done**
- cloningStatus stays 'idle' (clone skipped), nav populated, no boot-gate or loading-gate in DOM

### Bugs found and fixed (3)

**Bug 1: cloningStatus not set by pipeline** (index.tsx)
- Existing Playwright tests assert `cloningStatus === 'done'` (fresh visit) and `cloningStatus === 'idle'` (return visit)
- Pipeline didn't call `setCloningStatus` on the store
- Fix: pipeline subscriber in index.tsx bridges clone step state → store.cloningStatus. When clone step runs: `'cloning'` → `'done'`. When clone is skipped (`ctx.skipClone`): stays `'idle'`.

**Bug 2: expandCard toggle collapses card on return visit** (pipeline-steps.ts)
- loadNavStep called `expandCard(napkinFocus)` unconditionally
- `expandCard` is a toggle — on return visit, persist hydration restores the focused slug, then `expandCard` with the same slug COLLAPSES it
- In focus mode with `focusedCardSlug === null`, no cards render → sidebar empty
- Fix: only call `expandCard` when `focusedCardSlug` is null (fresh visit). Persisted focus takes priority over URL hint.

**Bug 3: debug-scenarios tests used old manual-clone-via-terminal flow** (debug-scenarios.test.ts)
- 6 tests waited for `.wterm` before pipeline completes — terminal only mounts after Panel renders
- Pipeline auto-clones, so manual `git clone` in terminal is redundant
- Fix: adapted tests to wait for pipeline completion (`header-bar` visible or `cloneFixtureRepo`) instead of manual terminal clone

### Tests adapted

| Test file | Change | Reason |
|---|---|---|
| debug-scenarios.test.ts | Replaced terminal clone with pipeline wait | Pipeline owns boot flow now |

### What I didn't implement

**LP-P04 (retry → succeeds on second try):** The test.md envisions entering a token after auth failure, then retry succeeds. This requires a private repo fixture (to trigger 401, then authenticate with real token). I tested the retry mechanism (click → step re-runs) but couldn't test the full recover-from-auth-failure path. Needs: known private repo + token in test env.

**LP-S25 (terminal WASM failure):** Dropped by fs-eng because terminal step was removed from pipeline. Could be a TerminalPane-level test.

### Surprise

The `expandCard` toggle bug was subtle. It only manifests on return visit when persist hydration restores the same slug that the URL hash wants to focus. First visit always works (focusedCardSlug is null → expand works). The FM-P05 test caught a related variant: user focuses a different card, closes, reopens → pipeline override resets focus. The fix (only set when null) preserves both behaviors correctly.
