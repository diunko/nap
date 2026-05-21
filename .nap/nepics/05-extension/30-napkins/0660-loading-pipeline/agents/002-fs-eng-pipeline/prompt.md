Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Required reading — start here

**Principles:** `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/principles.nap.md` — design philosophy for this feature.

## Project context

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.nap.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.spec.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.stories.md`

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.test.md` — 37 test cases, 6 failure injection points. Read this FIRST — it shapes how you structure the code.
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/agents/001-test-arch-pipeline/response.md`

## The failure analysis

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/bugfixes/01-clone-pipeline-failures.nap.md` — every step, every failure mode

## Read the code deeply

You're replacing the implicit boot flow with an explicit pipeline. Read what exists:

- `packages/ext-react/src/model.ts` — checkAutoClone, init, registerShell, onCommandComplete, findNepicRoot. This is what you're replacing with pipeline steps.
- `packages/ext-react/src/boot-gate.ts` — resolveBootState. Stays, but integrates with pipeline.
- `packages/ext-react/src/index.tsx` — App/Panel boot flow. Loading gate replaces the current pattern.
- `packages/ext-react/src/session.ts` — createSession. Becomes a pipeline step.
- `packages/ext-react/src/git-command.ts` — clone error paths. Step 6 wraps this.
- `packages/ext-react/src/TerminalPane.tsx` — shell init. Step 4 wraps this.
- `packages/ext-react/src/Sidebar.tsx` — cloningStatus. Replaced by pipeline state.

Read all existing tests too. Understand what breaks when you change the boot flow.

Explore freely. Don't limit yourself.

## Your task

Build the loading pipeline. The TA designed 6 failure injection points — they shape your code:

1. **FI-01:** `createPipeline(steps)` — steps are a parameter, not hardcoded.
2. **FI-02:** Each step's dependency is injectable — `makeCloneStep(cloneFn)`.
3. **FI-03:** Pipeline state is a plain observable, not React state.
4. **FI-04:** `PipelineCtx` accumulates results — pre-populatable for tests.
5. **FI-05:** Cleanup functions per step, reverse order on retryAll.
6. **FI-06:** Error classification owned by step, not runner.

Build in phases:

**Phase 1: Pipeline runner** — `pipeline.ts`. Pure logic: run steps, track state, retry, retryAll, skip, subscribe. Write the runner vitest tests (layer 1 from test.md). No browser needed.

**Phase 2: Step definitions** — extract each step from the current model.ts boot flow. Make dependencies injectable. Write step failure vitest tests (layer 2).

**Phase 3: Loading gate UI** — `LoadingGate.tsx`. Renders pipeline state as step list. Replaces boot-gate. Wire into index.tsx.

**Phase 4: Staging pattern** — clone step uses `.tmp-{name}`, rename on success, cleanup on retry.

**Phase 5: Debugging scenarios** — run the real extension. Navigate to fixture URL. Watch the step list progress. Inject a failure (wrong token). Verify error + hint + retry. Read the console traces.

Run all existing tests after each phase — regressions are the signal that the wiring broke.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/agents/002-fs-eng-pipeline/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
