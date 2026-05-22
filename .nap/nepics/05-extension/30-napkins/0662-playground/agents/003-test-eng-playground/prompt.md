Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## The feature

- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.nap.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.stories.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/0662-playground.test.md` — TA plan (PG-P01..P06)
- `.nap/nepics/05-extension/30-napkins/0662-playground/agents/002-fs-eng-playground/response.md`

## Read the code

- `packages/ext-react/src/playground.ts` — YAML parsing, yamlToSteps, condition state
- `packages/ext-react/src/PlaygroundPane.tsx` — component
- `packages/ext-react/src/__tests__/playground.test.ts` — 19 vitest already passing
- `packages/ext-react/src/index.tsx` — playground tab wiring

## Your task

1. **Run everything.** Confirm 184 tests pass. Build. Run Playwright — no regressions.

2. **Implement PG-P01 through PG-P06** from the test.md — Playwright tests for the playground:
   - PG-P01: playground tab visible, step list rendered from default YAML
   - PG-P02: run → steps progress → clone fails (token_present=false) → error + hint
   - PG-P03: toggle condition checkbox → retry → step passes → pipeline continues
   - PG-P04: edit playground.yaml in editor → switch to playground → see updated steps
   - PG-P05: invalid YAML → parse error shown → fix → step list returns
   - PG-P06: run again after completion → fresh run from step 0

3. **Fix bugs you find.**

4. **Report:** total pass/fail, bugs, story coverage.

Write response.md, then `nap3 done`.
