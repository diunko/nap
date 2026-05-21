Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Required reading — start here

**Principles:** `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/principles.nap.md`

This file shapes how you think about this feature. Read it before the spec. Key ideas:
- Test failures, not successes (Nygaard)
- Explore with "what happens if?", not "verify that" (Bach & Bolton)
- Write properties that must hold, not example tests (Hughes)
- One mid-flight failure test teaches more than ten happy-path tests (Dijkstra)

## Project context

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.nap.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.spec.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.stories.md` — 8 stories

## The failure analysis

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/bugfixes/01-clone-pipeline-failures.nap.md` — 9 steps, every failure mode, who owns what

## Read the code

Read the current boot flow deeply — this is what the pipeline replaces:

- `packages/ext-react/src/model.ts` — checkAutoClone, init, registerShell, onCommandComplete, findNepicRoot, refreshPr
- `packages/ext-react/src/boot-gate.ts` — resolveBootState
- `packages/ext-react/src/index.tsx` — App (boot gate), Panel (model init, shell registration)
- `packages/ext-react/src/session.ts` — createSession
- `packages/ext-react/src/git-command.ts` — clone, fetch, checkout error paths
- `packages/ext-react/src/TerminalPane.tsx` — shell initialization

Also read all existing tests — understand what's tested, what patterns exist:
- `packages/ext-react/src/__tests__/` — all vitest
- `packages/ext-react/e2e/tests/` — all Playwright

Explore freely. Don't limit yourself.

## Your task

Own the test architecture. This is a pipeline with explicit state, failure injection, and retry. The principles file tells you how to think about it. The stories tell you what the user sees. The failure analysis tells you where things break.

Design tests that:

1. **Inject failures.** For each step, make it fail (mock the async function to reject, or return an error). Verify: pipeline stops at that step, state shows error, UI shows hint, retry works.

2. **Test properties, not examples.** The key property: "after any sequence of step successes, failures, and retries, the user never sees partial state." Staging dirs are invisible. Retry is a fresh attempt. Pipeline state is consistent.

3. **Test the pipeline runner itself.** It's a new component with its own logic: step sequencing, retry from a specific step, retry-all with cleanup, skip logic. This is pure logic — vitest, no browser.

4. **Test the loading gate UI.** Does it render the right step states? Does the retry button work? Does it unmount after success? This needs Playwright.

5. **Design failure injection points for the fs-eng.** Tell them: "make this mockable so I can inject a 401 at step 6." The pipeline runner should accept step definitions that can be swapped in tests.

Write `0660-loading-pipeline.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/agents/001-test-arch-pipeline/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
