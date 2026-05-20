Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — package architecture
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.nap.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.spec.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.stories.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/scratch/00-components.nap.md`

## What already exists (0650)

This napkin simplifies 0650's boot path. Read what's already tested:

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.test.md` — existing test architecture (WW-S01..S07, WW-M01..M04, WW-P01..P07)
- `packages/ext-react/src/__tests__/url-config.test.ts` — WW-S01..S03 (pure parsing, stays)
- `packages/ext-react/src/__tests__/pr-diff.test.ts` — WW-S04..S07 (diff ranges, stays)
- `packages/ext-react/src/__tests__/workflow-wiring.test.ts` — WW-M01..M04 (model mocks)
- `packages/ext-react/e2e/tests/ww-workflow-wiring.test.ts` — WW-P01..P07 (Playwright)

Many existing tests will survive with minor adjustments. Focus your design on:
1. What's NEW (boot-gate state machine, refresh-pr, idle-pane, content-script-trim)
2. What CHANGES in existing tests (model no longer has applyConfig timing dance)
3. What can be DELETED (tests for content script config messaging)

## Read the code

Before designing tests, read the current implementation:

- `packages/ext-react/src/index.tsx` — App (session management, message handling)
- `packages/ext-react/src/model.ts` — model (applyConfig, checkAutoClone, fetchLatest)
- `packages/ext-react/src/content.ts` — content script (hash parsing, config messaging)
- `packages/ext-react/src/ContentPane.tsx` — editor pane (has "no file open" placeholder)
- `packages/ext-react/src/store.ts` — store (activeSurface defaults to 'terminal')

## Your task

Design test cases for 0651-panel-boot. Write `0651-panel-boot.test.md`.

Key constraints:
- This is a simplification — fewer states, fewer moving parts
- Boot-gate has 3 terminal states — each needs a test
- Refresh-pr is new — needs both model-level and Playwright tests
- Idle-pane is a surface default change — DOM assertion
- Content script trim means some existing test fixtures change
- The lesson from 0600: check DOM, not just model state

Write response.md, then `nap3 done`.
