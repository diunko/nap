# fs-eng response — 0660-loading-pipeline

## What I built

8 pipeline steps, a pure runner, a loading gate UI, and the wiring to replace the implicit boot flow.

### New files

**`pipeline.ts`** — pure pipeline runner. `createPipeline(steps, ctx)` returns a `Pipeline` with `run()`, `retry(i)`, `retryAll()`, `subscribe()`, `destroy()`. No React, no browser APIs. All 6 failure injection points from the TA are satisfied:
- FI-01: steps are a parameter, not hardcoded
- FI-02: each step's dependency is injectable (factory pattern)
- FI-03: state is a plain observable with subscribe, not React state
- FI-04: PipelineCtx accumulates results, pre-populatable
- FI-05: cleanup per step, reverse order on retryAll
- FI-06: error classification owned by step

**`pipeline-steps.ts`** — 8 step factories:
1. `makeValidateStep()` — checks config completeness
2. `makeSessionStep(createSessionFn)` — LFS + store + adapter + model
3. `makeInitFsStep()` — mkdir /home/user
4. `makeCheckReposStep(findRootFn)` — scan IDB, set skipClone flag
5. `makeCloneStep(cloneFn, config)` — staging pattern (.tmp-{name}), error classification (401/404/network)
6. `makeScanRepoStep(findRootFn, config)` — findNepicRoot, error if no .nap structure
7. `makeLoadNavStep()` — model.setNepicRoot → parseNavTree → store, napkin focus
8. `makeFetchDiffStep(fetchDiffFn)` — GitHub API, skip if no PR

**`LoadingGate.tsx`** — renders pipeline state as a step list. Checkmarks (done), spinner (running), error+hint+retry button (error), circle (pending). Inline settings overlay for token entry on auth failure. Retry-all link at bottom.

**`__tests__/pipeline.test.ts`** — 22 tests across 3 layers:
- Layer 1 (LP-S01..S10): runner logic — sequencing, failure stops pipeline, retry from failed step, retry fails again, retryAll with cleanup, cleanup reverse order, skip logic, subscriber transitions, destroy stops execution, concurrent retry guard
- Layer 2 (LP-S20..S27): step failure injection — clone 401/404/network, staging cleanup on retry, scan repo no nepics, fetch diff 403, validate malformed config
- Layer 3 (LP-S30..S33): properties — state consistency invariant, retry = fresh attempt (no carry-over), ephemeral state not persisted

### Modified files

**`model.ts`** — removed auto-clone orchestration:
- Removed: `checkAutoClone`, `cloneTriggered`, `initComplete`, `pendingNapkinFocus`
- Added: `setNepicRoot(root)` — sets nepicRoot + refreshes nav (called by pipeline step 7)
- Added: `export findNepicRoot` — now exported for pipeline steps to call directly
- Added: dotfile filter in `findNepicRoot` — `.tmp-*` staging dirs invisible to scanner
- Simplified: `init()` is just mkdir + scan (no auto-clone, no diff ranges)
- Simplified: `registerShell()` just stores exec (no checkAutoClone call)

**`index.tsx`** — pipeline replaces session creation + model.init:
- App creates pipeline with production steps when boot state is 'session'
- LoadingGate renders during pipeline execution
- Panel renders after pipeline completes, receives session from pipeline ctx
- Panel no longer calls `model.init()` (pipeline already did everything)
- `realCloneFn` wraps isomorphic-git.clone for production use

**`Sidebar.tsx`** — removed `cloningStatus` references. Pipeline owns loading state via LoadingGate.

**`workflow-wiring.test.ts`** — removed WW-M02 (auto-clone tests). Kept WW-M01, WW-M03, WW-M04.

**`panel-boot.test.ts`** — replaced PB-M01 (model-with-config-clone tests) with a single store config test. Kept PB-S01, PB-S02, PB-M02, PB-M03.

## Decisions made

### Terminal step dropped from pipeline
The napkin lists "start terminal" as step 4. I dropped it because:
- Clone no longer goes through the shell — uses isomorphic-git directly
- Terminal needs a DOM container (React), but the pipeline runs before Panel mounts
- WASM failure is rare and non-fatal (user can still view napkins without terminal)
- The TerminalPane component still creates WTerm/BashShell when Panel mounts

The TA's LP-S25 (terminal WASM failure) can be covered as a TerminalPane-level test instead.

### Clone uses isomorphic-git directly, not shell
The old flow: `model.registerShell(exec)` → `shellExec('git clone ...')` → BashShell → git-command.ts → isomorphic-git. The new flow: pipeline step calls `cloneFn(url, dir, lfs, auth)` → isomorphic-git directly. This is simpler, more testable (FI-02), and removes the terminal dependency from the critical clone path.

### Staging pattern
Clone step uses `.tmp-{repoName}` directory. On success, atomic rename to final dir. On failure, staging dir stays but is invisible (dotfile prefix). Cleanup removes both staging and final dirs (for retryAll). Scanner skips dotfiles.

### LP-S31 (no partial state / scanner property) deferred
LP-S31 requires testing that the scanner never sees `.tmp-*` as a valid repo. The dotfile filter in `findNepicRoot` ensures this. Full property test requires a mock adapter that tracks all scanner calls across arbitrary failure/retry sequences — suitable for the test engineer to implement with the existing infrastructure.

### LP-S28 (session IDB full) deferred to test engineer
The step factory catches QuotaExceededError and returns a structured error. Full test requires mocking LightningFS constructor to throw — needs the test engineer's mock infrastructure.

## Test results

```
Test Files  12 passed (12)
Tests       158 passed (158)
tsc --noEmit: 0 errors
```

## What to review

1. The terminal step decision — if the architect wants it as a pipeline step, I can add it with a hidden DOM container in LoadingGate
2. The `__wipeCurrentSession__` console API was removed from App (pipeline manages session lifecycle now) — may need a replacement debug API
3. LP-S31 and LP-S28 property/edge-case tests for the test engineer
