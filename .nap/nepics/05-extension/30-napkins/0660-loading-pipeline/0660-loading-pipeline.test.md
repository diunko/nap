# loading pipeline — test architecture

## Principles driving this design

* Nygaard — test failures, not successes. Every test below injects a failure. Happy path is one test. Failure paths are twenty.
* Bach & Bolton — "what happens if?" Every test starts with a scenario disruption, not a verification of expected behavior.
* Hughes — properties, not examples. The core invariants are tested as properties that must hold across arbitrary failure sequences, not as specific input/output examples.
* Dijkstra — one mid-flight failure test teaches more than ten happy-path tests. The clone step gets the most attention because that's where things actually break.

## Test layers

| Layer | Runner | Size | Count | What it proves |
|---|---|---|---|---|
| Pipeline runner logic | vitest | small | ~15 | Step sequencing, retry, cleanup, state consistency — pure logic, no infrastructure |
| Step failure injection | vitest | small | ~10 | Each step's error classification, hint text, staging cleanup |
| Pipeline properties | vitest | small | ~4 | Invariants hold across arbitrary failure/retry sequences |
| Loading gate UI | Playwright | medium | ~8 | DOM rendering, retry button, gate unmount, step descriptions |

---

## Layer 1: Pipeline runner — pure logic (small, vitest)

The runner is the core. It takes `StepDef[]`, executes them in order, tracks state, supports retry. It's `steps.reduce` with async + error handling. Zero infrastructure needed — fake every step.

### Test harness

```typescript
// Fake step factory — controllable success/failure
function fakeStep(name: string, options?: {
  fail?: { error: string; hint: string };
  cleanup?: () => Promise<void>;
  sideEffect?: () => void;
}): StepDef {
  return {
    name,
    run: async () => {
      options?.sideEffect?.();
      if (options?.fail) return { ok: false, ...options.fail };
      return { ok: true };
    },
    cleanup: options?.cleanup,
  };
}
```

### LP-S01: sequential execution — all succeed

* **flow:** 5 fake steps, all succeed
* **subsystems:** pipeline runner
* **expected:** all steps status=done, overall=done, steps execute in order
* **where it breaks:** step ordering assumption, off-by-one in currentStep
* **verification:** record execution order via sideEffect callbacks, check final state

### LP-S02: failure stops the pipeline

* **flow:** steps [ok, ok, FAIL, ok, ok]
* **subsystems:** pipeline runner
* **expected:** step 2 status=error with error+hint, steps 3-4 status=pending, overall=error
* **where it breaks:** pipeline continues past failure, or marks wrong step as failed
* **verification:** check each step's status, verify steps 3-4 run functions were never called

### LP-S03: retry from failed step — succeeds

* **flow:** run → fail at step 2 → change step 2 to succeed → retry(2) → pipeline continues
* **subsystems:** pipeline runner
* **expected:** step 2 re-runs, succeeds, steps 3-4 run, overall=done
* **where it breaks:** retry doesn't reset step state, or doesn't continue forward
* **verification:** step 2 sideEffect called twice (first fail, then success), steps 3-4 called once

### LP-S04: retry from failed step — fails again

* **flow:** run → fail at step 2 → retry(2) still fails → overall stays error
* **subsystems:** pipeline runner
* **expected:** step 2 status=error (again), steps 3-4 still pending
* **where it breaks:** step error state not re-set before retry
* **verification:** state after second failure matches state after first failure

### LP-S05: retry-all with cleanup

* **flow:** run → fail at step 2 → retryAll() → cleanup called for steps 0, 1 → pipeline restarts from 0
* **subsystems:** pipeline runner
* **expected:** cleanup functions called in reverse order (1, 0), all steps re-run
* **where it breaks:** cleanup order wrong, or cleanup for failed step called, or pipeline doesn't restart from 0
* **verification:** track cleanup call order, track run call order on second pass

### LP-S06: cleanup reverse order

* **flow:** 4 steps succeed, then retryAll()
* **subsystems:** pipeline runner
* **expected:** cleanup called for steps 3, 2, 1, 0 (reverse)
* **where it breaks:** forward cleanup order would leave dependencies dangling
* **verification:** record cleanup call order, assert [3, 2, 1, 0]

### LP-S07: skip logic

* **flow:** step 4 (clone) has skip condition (repo already exists) → marked done without running
* **subsystems:** pipeline runner, step skip
* **expected:** step 4 status=done, step 4 run function never called, step 5 proceeds
* **where it breaks:** skipped step still runs, or blocks pipeline
* **verification:** step 4 sideEffect never called, step 5 sideEffect called

### LP-S08: state subscriber fires on every transition

* **flow:** 3 steps, all succeed
* **subsystems:** pipeline runner, state subscription
* **expected:** subscriber called for: step0 running, step0 done, step1 running, step1 done, step2 running, step2 done
* **where it breaks:** batched updates miss intermediate states, subscriber not called on error
* **verification:** collect all callback arguments, verify sequence

### LP-S09: destroyed pipeline doesn't continue

* **flow:** start pipeline → after step 0 completes, destroy → step 1 should not run
* **subsystems:** pipeline runner
* **expected:** step 1 run function never called, no error
* **where it breaks:** async step 1 starts before destroy check
* **verification:** step 1 sideEffect never called

### LP-S10: concurrent retry calls — only one wins

* **flow:** pipeline fails at step 2 → call retry(2) twice simultaneously
* **subsystems:** pipeline runner
* **expected:** step 2 runs exactly once (second retry ignored or queued)
* **where it breaks:** double execution of same step, race condition in state
* **verification:** step 2 sideEffect called exactly once per retry resolution

---

## Layer 2: Step failure injection (small, vitest)

Each step's `run` function wraps real logic (clone, mkdir, wterm init). In tests, mock the dependency and verify the step returns correct `{ ok: false, error, hint }`. This tests error classification — the step's responsibility.

### Test harness

```typescript
// Mock the dependency each step wraps
// Step receives PipelineCtx — mock what it reads from ctx
function makeCtx(overrides?: Partial<PipelineCtx>): PipelineCtx {
  return {
    config: makeConfig(),
    session: null,
    model: null,
    adapter: null,
    shellExec: null,
    nepicRoot: null,
    ...overrides,
  };
}
```

### LP-S20: clone step — 401 (auth failure)

* **flow:** clone step runs → isomorphic-git throws `HttpError` with statusCode 401
* **subsystems:** clone step definition, error classifier
* **expected:** `{ ok: false, error: 'authentication failed', hint: 'enter your GitLab token in settings' }`
* **where it breaks:** error not classified (generic "clone failed"), wrong provider in hint
* **verification:** assert error and hint strings, assert provider name matches config

### LP-S21: clone step — 404 (repo not found)

* **flow:** clone step → 404 error
* **expected:** `{ ok: false, error: 'repository not found', hint: 'check the review link' }`
* **where it breaks:** 404 classified as auth failure
* **verification:** assert hint mentions "review link", not "token"

### LP-S22: clone step — network error

* **flow:** clone step → TypeError: Failed to fetch (host unreachable)
* **expected:** `{ ok: false, error: "can't reach {hostname}", hint: 'check your network or VPN' }`
* **where it breaks:** hostname not extracted from config, generic error swallowed
* **verification:** assert hostname appears in error message

### LP-S23: clone step — staging cleanup on retry

* **flow:** clone step → fail → staging dir `.tmp-{name}` exists → retry → old staging removed, new staging created
* **subsystems:** clone step + cleanup function
* **expected:** cleanup removes old `.tmp-{name}`, new run creates fresh `.tmp-{name}`
* **where it breaks:** old staging not cleaned, or cleanup tries to remove non-existent dir
* **verification:** mock adapter.rm called with `.tmp-{name}` during cleanup, mock adapter.mkdir called with `.tmp-{name}` during new run

### LP-S24: scan repo — no nepics/ directory

* **flow:** scan step runs → findNepicRoot returns null
* **expected:** `{ ok: false, error: 'no .nap structure found', hint: 'cloned {repo} but no .nap structure' }`
* **where it breaks:** scan returns ok:true with null nepicRoot, leaving downstream steps to crash
* **verification:** assert step returns ok:false, not ok:true with empty result

### LP-S25: terminal step — WASM load failure

* **flow:** terminal step → WTerm.init() rejects with WASM error
* **expected:** `{ ok: false, error: 'terminal failed to start', hint: 'try reloading the panel' }`
* **where it breaks:** error swallowed, step hangs waiting for shell
* **verification:** step returns within timeout, error message mentions terminal

### LP-S26: fetch PR diff — 403 forbidden

* **flow:** fetch step → GitHub API returns 403
* **expected:** `{ ok: false, error: "can't read PR files", hint: 'check your GitHub token' }`
* **where it breaks:** fetch step is optional (skip if no PR) — ensure it still errors when PR exists but token fails
* **verification:** assert ok:false only when prNum > 0

### LP-S27: parse URL — malformed hash

* **flow:** parse step → hash missing nap-repo param
* **expected:** `{ ok: false, error: 'invalid review link', hint: 'ask the author for a review link with #nap-repo=...' }`
* **where it breaks:** step returns ok:true with null config, downstream steps crash
* **verification:** assert step validates config presence before returning ok:true

### LP-S28: session creation — IDB full

* **flow:** session step → LightningFS constructor throws (storage quota)
* **expected:** `{ ok: false, error: 'storage full', hint: 'clear browser data or close other tabs' }`
* **where it breaks:** rare — error propagates as unhandled rejection
* **verification:** mock LightningFS to throw, assert step catches and returns structured error

---

## Layer 3: Pipeline properties (small, vitest)

Properties that must hold regardless of which steps fail, how many retries happen, or what order operations occur. These are the invariants from the napkin.

### LP-S30: state consistency — structural property

* **property:** at any point during pipeline execution:
  * all steps before currentStep have status 'done'
  * currentStep has status 'running' or 'error'
  * all steps after currentStep have status 'pending'
  * at most one step has status 'running'
  * overall matches: if any step is 'error' → overall='error'; if all 'done' → overall='done'; else 'running'
* **method:** generate random step definitions (N=3..8), randomly assign some to fail. Run pipeline. After each state callback, check the structural property holds.
* **subsystems:** pipeline runner
* **where it breaks:** retry leaves stale 'done' on re-run step, or skip marks step as 'running'

### LP-S31: no partial state visible — scanner property

* **property:** after any sequence of [run, fail, retry, retryAll], the repo scanner (findNepicRoot) never sees a `.tmp-*` directory as a valid repo
* **method:** mock adapter, run pipeline with various failure points, call scanExistingRepos after each operation, assert it never returns a path containing `.tmp-`
* **subsystems:** pipeline runner + clone step + scanner
* **where it breaks:** rename-on-success fails silently, staging dir has valid structure, scanner doesn't filter dotfiles

### LP-S32: retry = fresh attempt — no carry-over

* **property:** after retry(N), the Nth step's run function receives clean context — no artifacts from previous failed attempt
* **method:** have failing step write a marker to ctx. On retry, assert marker is absent.
* **subsystems:** pipeline runner, step context
* **where it breaks:** ctx not reset before retry, step reads stale data

### LP-S33: ephemeral state — pipeline state not persisted

* **property:** pipeline state is never written to Zustand store's persisted partition
* **method:** create persisted store, run pipeline to completion, extract raw persisted data, assert no pipeline state keys
* **subsystems:** pipeline runner, store persistence
* **where it breaks:** pipeline state accidentally added to store, persist middleware serializes it

---

## Layer 4: Loading gate UI (medium, Playwright)

These require the real extension running in Chrome. They test what the user actually sees — DOM rendering, not model state.

### LP-P01: fresh visit — all steps succeed → gate unmounts

* **flow:** open panel → loading gate visible → steps progress → gate disappears → normal Panel renders
* **subsystems:** loading gate, pipeline runner, Panel
* **expected:** 
  * DOM: loading gate element visible during load
  * DOM: step items show checkmarks as they complete
  * DOM: loading gate element removed from DOM after pipeline completes
  * DOM: header-bar, tab-bar, sidebar all visible after gate unmounts
* **where it breaks:** gate stays visible after success, or Panel mounts before gate unmounts (flash)
* **verification:** wait for header-bar visible, assert no loading-gate element in DOM

### LP-P02: clone failure — error + hint + retry visible

* **flow:** fresh visit, private repo, no token → clone step fails with 401
* **subsystems:** loading gate, clone step, error display
* **expected:**
  * DOM: clone step shows red X / error icon
  * DOM: error message visible: "authentication failed"
  * DOM: hint visible: "enter your {provider} token in settings"
  * DOM: [retry] button visible on failed step
  * DOM: steps after clone show pending (gray)
  * DOM: steps before clone show checkmark (green)
* **where it breaks:** error shown but no hint, retry button missing, pending steps show as running
* **verification:** locator assertions for error text, hint text, retry button, step status icons
* **note:** requires test fixture that triggers 401 — either a private repo with no token, or mock the auth callback

### LP-P03: retry button — click → clone re-runs → succeeds

* **flow:** clone fails → user enters token in settings → clicks retry → clone succeeds → pipeline continues → gate unmounts
* **subsystems:** loading gate, settings overlay, clone step, pipeline retry
* **expected:**
  * DOM: after retry click, clone step shows spinner again
  * DOM: after clone succeeds, remaining steps complete
  * DOM: gate unmounts, Panel renders
* **where it breaks:** retry doesn't re-read token from store, or pipeline doesn't continue after retry
* **verification:** settings input → save → retry click → wait for Panel header-bar

### LP-P04: retry-all link

* **flow:** clone fails → click "retry all" → pipeline restarts → all steps re-run
* **subsystems:** loading gate, pipeline retryAll
* **expected:**
  * DOM: all steps reset to pending
  * DOM: steps begin progressing from step 0
* **where it breaks:** retry-all doesn't trigger cleanup, or some steps skipped on restart
* **verification:** watch for step 0 showing spinner (pipeline restarted from beginning)

### LP-P05: return visit — gate flies through

* **flow:** first visit → clone → nav → close panel → reopen → gate shows briefly → scan finds repo → clone skipped → gate unmounts fast
* **subsystems:** loading gate, scan step, skip logic
* **expected:**
  * DOM: gate visible for < 2 seconds on return visit
  * DOM: clone step shows checkmark (skipped, not run)
  * DOM: Panel renders with nav tree populated
* **where it breaks:** scan doesn't find IDB data, clone runs again, gate hangs
* **verification:** measure time from gate visible to Panel header-bar visible; assert < 3s

### LP-P06: mid-flight close + reopen — fresh pipeline

* **flow:** open panel → clone in progress → close panel → reopen → fresh pipeline, no partial state
* **subsystems:** loading gate, pipeline lifecycle, staging
* **expected:**
  * DOM: new pipeline starts from step 0
  * DOM: no error from previous attempt visible
  * Store: pipeline state is fresh (not recovered from previous run)
* **where it breaks:** stale pipeline state persisted, partial clone visible, staging dir confuses scanner
* **verification:** reopen → loading gate starts clean → eventually succeeds

### LP-P07: step descriptions visible

* **flow:** open panel → while loading gate is active, read step descriptions
* **subsystems:** loading gate, step definitions
* **expected:**
  * DOM: each step shows human-readable name
  * DOM: clone step shows "cloning {hostname}/{repo}..." with actual repo name
  * DOM: not just "step 6" — meaningful descriptions
* **where it breaks:** step names are internal IDs, not user-facing labels
* **verification:** text assertions on step list items

### LP-P08: gate replaces boot-gate completely

* **flow:** navigate to github.com with hash → loading gate appears (not old boot-message)
* **subsystems:** loading gate, boot-gate removal
* **expected:**
  * DOM: no `data-testid="boot-message"` in DOM
  * DOM: loading gate component present instead
  * DOM: no-hash and wrong-page states still work (these are pre-pipeline)
* **where it breaks:** boot-gate not fully replaced, two competing loading indicators
* **verification:** check for absence of old boot-message testid

---

## Failure injection points — design recommendations for fs-eng

These are requirements on the pipeline implementation that make testing possible. The TA is upstream of the fs-eng — these shape how the code gets built.

### FI-01: pipeline runner accepts StepDef[]

```typescript
function createPipeline(steps: StepDef[], onStateChange: (state: PipelineState) => void): Pipeline;
```

* Steps are an array parameter, not hardcoded inside the runner
* Production: real steps bound to session/adapter/lfs
* Tests: fake steps from `fakeStep()` factory
* This is the single most important design decision for testability

### FI-02: each step's async dependency is injectable

Don't:
```typescript
// BAD — clone step has isomorphic-git hardcoded inside
{ name: 'clone', run: async (ctx) => { await git.clone(...); } }
```

Do:
```typescript
// GOOD — clone function is passed in, mockable
function makeCloneStep(cloneFn: CloneFn): StepDef {
  return { name: 'clone', run: async (ctx) => { await cloneFn(ctx.cloneUrl, ctx.auth); } };
}
```

* In production: `makeCloneStep(realGitClone)`
* In tests: `makeCloneStep(mockThatThrows401)`
* Same pattern for terminal init, session creation, PR diff fetch

### FI-03: pipeline state is a plain observable object

```typescript
interface Pipeline {
  getState(): PipelineState;
  subscribe(fn: (state: PipelineState) => void): () => void;
  retry(stepIndex: number): void;
  retryAll(): void;
  destroy(): void;
}
```

* NOT React state. NOT Zustand. A plain object with a callback list.
* Loading gate UI subscribes. Tests subscribe.
* `getState()` returns current snapshot — tests can assert at any point.

### FI-04: PipelineCtx accumulates results

```typescript
interface PipelineCtx {
  config: NapConfig;
  session: Session | null;     // set by "create session" step
  adapter: LightningFsAdapter | null;
  model: NapModel | null;
  shellExec: ShellExec | null; // set by "start terminal" step
  nepicRoot: string | null;    // set by "scan repo" step
}
```

* Each step reads from ctx what previous steps produced
* Each step writes its output back to ctx
* Tests can pre-populate ctx fields to start from any step
* On retryAll, ctx resets to initial state

### FI-05: cleanup functions per step — called in reverse order

```typescript
interface StepDef {
  name: string;
  run: (ctx: PipelineCtx) => Promise<StepResult>;
  cleanup?: () => Promise<void>;  // for retryAll
}
```

Clone step cleanup: remove `.tmp-*` staging dir.
Session step cleanup: destroy session.
Terminal step cleanup: dispose wterm.

Tests verify: cleanup called in reverse order, cleanup actually removes artifacts.

### FI-06: error classification owned by step, not runner

The runner doesn't know what a 401 means. The step does:

```typescript
function makeCloneStep(cloneFn, config): StepDef {
  return {
    name: `cloning ${config.hostname}/${config.repo}`,
    run: async (ctx) => {
      try {
        await cloneFn(...);
        return { ok: true };
      } catch (e) {
        if (e.statusCode === 401) return { ok: false, error: 'authentication failed', hint: `enter your ${config.provider} token in settings` };
        if (e.statusCode === 404) return { ok: false, error: 'repository not found', hint: 'check the review link' };
        return { ok: false, error: `can't reach ${config.hostname}`, hint: 'check your network or VPN' };
      }
    },
  };
}
```

Tests: mock `cloneFn` to throw specific errors → assert correct hint string.

---

## What existing tests to keep, adapt, or replace

| Existing test | Action | Reason |
|---|---|---|
| model.test.ts (IS-05) | keep, extend | Debounce + echo suppression unchanged. Add pipeline-specific model tests. |
| workflow-wiring.test.ts (WW-M01..M04) | **replace** with LP-S* | Auto-clone logic moves into pipeline steps. WW-M02 (checkAutoClone) becomes LP-S07 (step skip). |
| panel-boot.test.ts (PB-S01..M03) | keep PB-S01, **replace** PB-M01 | Boot-gate decision logic unchanged. Model-with-config tests become pipeline step tests. |
| session.test.ts (SS-01..06) | keep | Session isolation unchanged. Pipeline uses sessions the same way. |
| im-01-clone-nav.test.ts (IM-01) | **adapt** | Auto-clone → nav flow is now pipeline → loading gate → Panel. Same end state, different mechanism. |
| pb-panel-boot.test.ts (PB-P01..08) | **adapt** PB-P01..05, **replace** PB-P04 | Gate test becomes LP-P01. Auto-clone gate becomes LP-P01/P05. |

---

## Test execution plan

1. **First:** LP-S01..S10 (pipeline runner, pure logic) — vitest, no infrastructure, fast. This validates the core abstraction before any UI work.
2. **Second:** LP-S20..S28 (step failure injection) — vitest, depends on step definitions existing. Runs alongside fs-eng building the steps.
3. **Third:** LP-S30..S33 (properties) — vitest, depends on runner + steps. Validates invariants across random failure patterns.
4. **Fourth:** LP-P01..P08 (loading gate UI) — Playwright, depends on loading gate component + pipeline wired up. Last because it needs the full extension running.

All vitest tests (layers 1-3): `npm run test:small`
All Playwright tests (layer 4): `npx playwright test --config e2e/playwright.config.ts`
