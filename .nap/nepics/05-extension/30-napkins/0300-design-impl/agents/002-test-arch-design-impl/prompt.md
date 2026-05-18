Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these before looking at the feature.

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works: navigation/map/territory, sidebar card system, Monaco editor, terminal, two-repo bridge
- `.nap/nepics/05-extension/10-docs/context/10-du-thoughts.nap.md` — the vision: where the editor evolves
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — the approved design decisions
- `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png` — what it should look like
- `.nap/nepics/05-extension/10-docs/context/02-workflow.nap.md` — reviewer workflow

## The feature

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.nap.md`
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.spec.md`
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.stories.md`

## The existing tests

Read all of these carefully — understand what each test actually verifies:

- `packages/extension/src/__tests__/nav-tree.test.ts` — vitest, nav tree parsing
- `packages/extension/src/__tests__/link-routing.test.ts` — vitest, link URL construction
- `packages/extension/src/__tests__/theme.test.ts` — vitest, CSS variable generation
- `packages/extension/e2e/tests/happy-path-debug.spec.ts` — playwright, real side panel
- `packages/extension/e2e/tests/lifecycle.spec.ts` — playwright, fixture repos
- `packages/extension/e2e/tests/gap-tests.spec.ts` — playwright, seam coverage
- `packages/extension/e2e/tests/ux-e2e.spec.ts` — playwright, the real user journey (most important)
- `packages/extension/e2e/tests/fixtures.ts` — playwright fixture setup

Also read the current extension source to understand what the tests interact with:
- `packages/extension/src/side-panel.ts`
- `packages/extension/src/nav-tree.ts`
- `packages/extension/side-panel.html`

And read the design target:
- `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html`

## Your task

The extension UI is being replaced to match mock-e. The internals (Monaco, LightningFS, terminal, link routing) stay. The rendering layer around them changes entirely — new layout, new nav tree (card system), new tab bar, different DOM structure.

Analyze the existing 48 tests and produce a migration plan:

1. **Classify each test**: which are pure logic (untouched by UI change), which depend on DOM selectors (need updating), which test the wrong thing (need rethinking)
2. **Map selector changes**: for tests that depend on DOM, what selectors change from the old layout to mock-e's layout. Produce a concrete migration table.
3. **Identify gaps**: are there scenarios in the stories (S1-S6) that no existing test covers? If so, describe what new tests are needed — but keep it minimal. The goal is migration, not reinvention.

Write your analysis to `0300-design-impl.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0300-design-impl/agents/002-test-arch-design-impl/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
