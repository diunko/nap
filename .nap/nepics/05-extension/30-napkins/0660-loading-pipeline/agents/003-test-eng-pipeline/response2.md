# test-eng response2 — fixes-01

## Results

```
vitest:     191 passed (191) — 14 test files
tsc:        0 errors
playwright: 59 passed (59)   — excluding 6 PG-P playground tests (separate napkin)
```

## What I did

### New Playwright tests (+5)

**FX-P30: inline form → enter token → save & retry → clone succeeds**
- Fresh visit → private GitLab repo → no token → 401 → inline form appears
- DOM: `inline-token-input` visible, label says "GitLab PAT"
- Enter real GITLAB_API_TOKEN → save & retry → clone succeeds → pipeline completes
- Loading gate unmounts, header-bar visible, nav populated, card focused

**FX-P31: token persists in chrome.storage.sync across close/reopen**
- Enter token via inline form → pipeline completes → close panel → reopen
- Second visit: no inline form (no auth error), clone skipped (IDB scan finds repo)
- chrome.storage.sync retains token across panel lifecycle

**FX-P32: Enter key triggers save & retry**
- Enter token in input → press Enter (not click button) → clone re-runs → succeeds
- Tests the `onKeyDown` handler in `TokenInputAndRetry`

### Fixed GL-M01 and GL-M03 for fixes-01

Tokens moved from per-session Zustand (`store.getState().setGitlabToken()`) to `chrome.storage.sync`. The old GL tests used `__napStore__` injection which no longer works.

**GL-M01**: Now waits for clone 401 → enters token via inline form → save & retry → nav populates. Uses the same inline form path as FX-P30.

**GL-M03**: Same as GL-M01 for first visit, then close/reopen → verify token persists in chrome.storage.sync, clone skipped on return visit.

### Fixed LP-P03, LP-P04, LP-P07 for new auth error UI

Non-existent repo returns 401 (GitHub behavior), not 404. With fixes-01:
- Error classified as "authentication failed" (correct)
- `CloneTokenForm` renders inline PAT input instead of plain text error
- Tests updated to check for `inline-token-input` and `save-and-retry` testids

### Fixed cloneFixtureRepo null safety (fixtures.ts)

`__napStore__?.getState()?.navSections?.length` — optional chaining for async `globalReady` boot delay.

### Fixed debug-scenarios missing import

Added `waitForPanelReady` import.

## Bugs found (3)

**Bug 1: cloneFixtureRepo TypeError with async boot**
- `globalReady` state gates boot → session creation delayed → `__napStore__` undefined for longer
- Fix: optional chaining in `cloneFixtureRepo`

**Bug 2: GL-M01/M03 use removed store fields**
- `store.getState().setGitlabToken()` no longer exists (tokens moved to chrome.storage.sync)
- Fix: enter tokens via inline form instead of store injection

**Bug 3: LP tests expected 404 but got 401**
- GitHub returns 401 for non-existent repos without auth. Inline form renders instead of plain text.
- Fix: updated assertions to match `authentication failed` + inline form UI

## What I didn't implement

**FX-S01..S04, FX-S10..S16, FX-S30..S36 (vitest)**: The fs-eng already wrote these (191 passing). I focused on Playwright-level integration tests since that's where fixes-01 broke things.

**FX-P20 (GitLab error capture)**: Already implemented by fs-eng in `fx-error-capture.test.ts`. Ran and passed.

## Surprise

The inline token form (`TokenInputAndRetry`) is a clean design. `setGlobalToken` writes to both chrome.storage.sync AND the in-memory `globalTokens` ref in a single call, so the retry immediately reads the new token. No race condition. The `onKeyDown` Enter handler fires `handleSaveAndRetry` which is async (awaits `setGlobalToken`) then calls `onRetry()`. This means the token is guaranteed to be persisted before the pipeline retry fires. Good work by the fs-eng.
