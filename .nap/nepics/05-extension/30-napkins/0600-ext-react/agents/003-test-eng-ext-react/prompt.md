Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — approved design

## The feature

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.nap.md` — what was built
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.spec.md` — constraints
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.stories.md` — 15 user stories

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.test.md` — the TA's full plan. Read Part 2 (integration tests IM-01 through IM-08) and Part 3 (story coverage map). This is your blueprint.

## What the fs-eng built

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/agents/002-fs-eng-ext-react/response.md` — what's done, what's not done, architecture decisions

## Read the code

Before writing tests, read the actual source code in `packages/ext-react/src/`. Understand how the components work, how the store drives rendering, how the model layer connects adapter events to store updates. Read:

- `src/store.ts` — state shape, all actions
- `src/model.ts` — adapter subscription, debounce, echo suppression
- `src/ContentPane.tsx` — Monaco lifecycle, auto-save, role decorations, link clicks
- `src/Sidebar.tsx` — card rendering, file clicks, agent dots
- `src/TerminalPane.tsx` — wterm setup, dark theme
- `src/index.tsx` — layout, surface switching
- `src/fs-adapter.ts` — event emitter (onChange, emit)

Also read the existing Playwright fixture and the gate test:
- `e2e/tests/fixtures.ts` — how to open the real side panel
- `e2e/tests/im-01-clone-nav.test.ts` — the pattern for integration tests

## Your task

1. **Run everything the fs-eng built.** Confirm 28 vitest pass. Build the extension. Run IM-01 (gate test). Report results.

2. **Implement IM-02 through IM-08.** Follow the test.md designs — they specify flow, subsystems, expected behavior, verification method, and where it breaks. Each test is a Playwright test in `e2e/tests/`.

   Key rule from the TA: **No `window.__` hooks for driving actions.** Use DOM clicks, keyboard input, real terminal commands. `window.__napStore__` and `window.__monaco__` for READING state only (verification), never for driving the action being tested.

3. **If a test fails because of a bug in the code, fix the bug.** The fs-eng may have left wiring issues — that's expected. Fix them and document in your response.

4. **Report:** total pass/fail, bugs found and fixed, story coverage achieved.

Write response.md, then `nap3 done`.
