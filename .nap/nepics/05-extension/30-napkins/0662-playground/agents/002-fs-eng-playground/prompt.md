Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## The feature

- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.nap.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.spec.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.stories.md`

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.test.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/agents/001-test-arch-playground/response.md`

## Read the code deeply

You're reusing existing infrastructure. Understand it before building:

- `packages/ext-react/src/pipeline.ts` — the runner. `createPipeline(steps, ctx)`. Your playground creates fake pipelines from YAML config using this same runner.
- `packages/ext-react/src/LoadingGate.tsx` — renders pipeline state. The playground reuses this component, extended with condition checkboxes per step.
- `packages/ext-react/src/pipeline-steps.ts` — real step factories. The default playground.yaml should mirror these step names.
- `packages/ext-react/src/index.tsx` — surface switching, tab bar. Add 'playground' as third surface.
- `packages/ext-react/src/store.ts` — activeSurface type. Extend to include 'playground'.

Explore freely.

## Your task

1. **YAML parsing** — `yamlToSteps` function. Takes parsed YAML config + live condition state → `StepDef[]`. Each fake step: sleep(delay) → check conditions → ok or error. Add `js-yaml` dependency.

2. **Condition state** — per-step, per-condition booleans. Initial values from YAML. Toggleable via checkboxes. Live — not snapshotted on run.

3. **PlaygroundPane component** — reads `/home/user/playground.yaml` from LFS on mount and on LFS changes. Renders LoadingGate + condition checkboxes + [run] button. Handles YAML parse errors gracefully.

4. **File seeding** — in pipeline-steps.ts init-fs step: write default playground.yaml if not exists. Default config mirrors real boot steps with some conditions false.

5. **Surface switching** — extend activeSurface to include 'playground'. Add tab to tab bar.

6. **Write vitest tests** from the test.md. YAML parsing, condition toggling, invalid YAML handling.

7. **Run debugging scenarios.** Build, load extension. Open playground.yaml in editor. Edit. Switch to Playground tab. Click run. Toggle conditions. Retry. Verify it all works visually. Read console traces.

8. **Run all existing tests** — no regressions.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0662-playground/agents/002-fs-eng-playground/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
