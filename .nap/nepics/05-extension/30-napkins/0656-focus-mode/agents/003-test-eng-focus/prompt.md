Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.nap.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.spec.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.stories.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.test.md` — TA plan (FM-P01..P05)

## What the fs-eng built

- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/agents/002-fs-eng-focus/response.md`

Read the code:
- `packages/ext-react/src/Sidebar.tsx` — ArchitectCard, focus mode filtering, separator
- `packages/ext-react/src/store.ts` — focusMode, toggleFocusMode
- `packages/ext-react/src/index.tsx` — focus-toggle button, Ctrl+Shift+F
- `packages/ext-react/src/__tests__/focus-mode.test.ts` — 7 vitest already passing

## Your task

1. **Run everything.** Confirm 123 vitest pass. Build. Run all Playwright tests — no regressions.

2. **Implement FM-P01 through FM-P05** from the test.md. Real DOM assertions — check what's visible, not just store state.

3. **Fix bugs you find.** The fs-eng built the feature and ran vitest but may not have run Playwright debugging scenarios.

4. **Report:** total pass/fail, bugs found, story coverage.

Write response.md, then `nap3 done`.
