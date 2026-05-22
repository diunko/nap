Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.nap.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.spec.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.stories.md`

## What this builds on

- `packages/ext-react/src/pipeline.ts` — the pipeline runner (reused by playground)
- `packages/ext-react/src/LoadingGate.tsx` — the step list UI (reused by playground)
- `packages/ext-react/src/__tests__/pipeline.test.ts` — existing pipeline tests

Read these. The playground reuses the pipeline runner with fake steps — the runner is already tested. The new code is: YAML parsing, condition state management, PlaygroundPane component, file seeding.

Read existing tests too. Explore freely.

## Your task

This feature is a development tool, not a user-facing feature. It reuses proven infrastructure (pipeline runner, LoadingGate). The new seams are:

1. **YAML → steps** — parsing, handling invalid YAML, default config
2. **Condition state** — initial from YAML, live toggles, conditions read at step execution time (not snapshot)
3. **PlaygroundPane** — reads file from LFS, renders LoadingGate + checkboxes, run/retry wiring
4. **File seeding** — playground.yaml created on fs init if not exists

Think about:
- The pipeline runner is already tested (22 vitest). Don't re-test it. Test the YAML → fake steps conversion and the condition toggle behavior.
- The LoadingGate rendering is already tested (8 Playwright). Don't re-test it. Test that PlaygroundPane wires it correctly.
- Invalid YAML mid-edit is the most interesting edge case — auto-save fires partial YAML, playground should handle gracefully.
- Condition toggle → retry is the core interaction. The condition is live, not snapshotted. Step reads it at execution time.

Write `0662-playground.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0662-playground/agents/001-test-arch-playground/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
