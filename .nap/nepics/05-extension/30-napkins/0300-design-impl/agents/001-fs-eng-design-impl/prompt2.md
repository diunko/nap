## Round 2: build it

The test architect analyzed all 48 existing tests and produced a migration plan. Read it:

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.test.md`
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/agents/002-test-arch-design-impl/response.md`

Key findings:
- 29 vitest tests are pure logic — untouched
- 15 Playwright tests use stable selectors — should pass unchanged
- 4 Playwright tests need selector updates (see migration table in test.md)
- The UX-E2E test is the most important — get it green first

The TA identified stable element IDs to preserve: `#app`, `#nav-tree`, `#tab-bar`, `#editor-surface`, `#terminal-surface`, `.tab[data-tab="*"]`, `#settings-btn`, `#settings-overlay`, `#main-repo-input`, `#main-branch-input`, `#settings-save`. Keep these to minimize test churn.

You have your stashed work from round 1 (`git stash list` to see it). Pop it if useful, or start fresh — your call.

Build, update the tests that need selector changes per the migration table, then run everything:
- `npx vitest run` — 29 small tests
- `npx playwright test` — all e2e suites

Iterate until all tests pass. The UX-E2E test (`ux-e2e.spec.ts`) is the gate — if it passes, the user journey works.

Write response2.md, then `nap3 done`.
