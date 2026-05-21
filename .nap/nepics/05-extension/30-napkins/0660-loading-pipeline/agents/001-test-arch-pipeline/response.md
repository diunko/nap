# Test architect response — 0660-loading-pipeline

## What I produced

`0660-loading-pipeline.test.md` in the napkin directory. 37 test cases across 4 layers.

## Architecture summary

**4 layers, ordered by dependency:**

1. **Pipeline runner — pure logic** (small, vitest, ~15 tests)
   - The runner is `steps.reduce` with async. Zero infrastructure. Fake every step.
   - Tests: sequencing, failure stops pipeline, retry from step N, retry-all with reverse cleanup, skip logic, state subscriber, destroy, concurrency guard.

2. **Step failure injection** (small, vitest, ~10 tests)
   - For each of the 9 pipeline steps, mock the async dependency to fail.
   - Clone gets 4 tests alone (401, 404, network, staging cleanup) because that's where things actually break.
   - Each test verifies the step returns correct `{ ok: false, error, hint }`.

3. **Pipeline properties** (small, vitest, ~4 tests)
   - State consistency: before current = done, current = running|error, after = pending.
   - No partial state: scanner never sees `.tmp-*` as a real repo.
   - Retry = fresh: no carry-over from failed attempt.
   - Ephemeral: pipeline state never persisted to Zustand.

4. **Loading gate UI** (medium, Playwright, ~8 tests)
   - Gate renders step progress, error+hint+retry, unmounts after success.
   - Return visit: gate flies through in < 3s.
   - Mid-flight close: fresh pipeline, no partial state.

## Critical design requirements for fs-eng

6 failure injection points that shape how the code gets built:

- **FI-01:** `createPipeline(steps: StepDef[])` — steps are a parameter, not hardcoded. This is the single most important decision for testability.
- **FI-02:** Each step's async dependency is injectable (`makeCloneStep(cloneFn)` not `cloneStep` with hardcoded git).
- **FI-03:** Pipeline state is a plain observable object with `subscribe()`, not React state.
- **FI-04:** `PipelineCtx` accumulates results — tests can pre-populate to start from any step.
- **FI-05:** Cleanup functions per step, called in reverse order on retryAll.
- **FI-06:** Error classification owned by step (401 → auth hint), not runner.

## What changes in existing tests

- `workflow-wiring.test.ts` — **replace**. Auto-clone logic moves into pipeline steps.
- `panel-boot.test.ts` PB-M01 — **replace**. Model-with-config becomes pipeline step tests.
- `im-01-clone-nav.test.ts` — **adapt**. Same end state, mechanism changes from model guards to pipeline.
- Everything else (session, store, adapter, persistence) — **keep unchanged**.

## Execution order

1. Pipeline runner tests first — validates the core before any UI
2. Step failure tests second — alongside fs-eng building the steps
3. Property tests third — validates invariants across random failure patterns
4. Playwright tests last — needs full extension wired up
