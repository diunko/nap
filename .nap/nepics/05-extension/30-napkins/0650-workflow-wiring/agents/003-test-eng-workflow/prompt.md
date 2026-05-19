Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — package architecture
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.nap.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.spec.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.stories.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.test.md` — TA test plan (WW-P01..P07)

## What the fs-eng built

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/agents/002-fs-eng-workflow/response.md`

The fs-eng reports 97 vitest + 6 Playwright = 103 tests passing. They implemented WW-P01, P02, P03 + regression tests. WW-P04 through P07 are not yet implemented.

## Fixture PR now exists

The fixture PR has been synced to GitHub:
- `github.com/diunko/nap-test-main/pull/1` — "Delivery v2: express priority routing + capacity warnings"
- Branch: `feature/delivery-v2`
- Changed files: `order-router.ts` (express gates), `warp-queue.ts` (capacity warnings)
- Unchanged: `crust-validator.ts`

This means WW-P05 and P06 (diff URL vs blob URL routing) can now be fully tested.

## Read the code

Before writing tests, read the new code:

- `packages/ext-react/src/url-config.ts` — hash parsing, key derivation
- `packages/ext-react/src/pr-diff.ts` — PR diff fetching, hunk parsing, SHA256
- `packages/ext-react/src/content.ts` — hash parsing, config messaging, SPA detection
- `packages/ext-react/src/model.ts` — auto-clone, fetch latest, diff range checking
- `packages/ext-react/src/link-routing.ts` — diff-aware routing decisions
- `packages/ext-react/e2e/tests/ww-workflow-wiring.test.ts` — existing Playwright tests

Read the fixture content to understand what links point where:
- `fixtures/.nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md`
- `fixtures/README.md`

## Your task

1. **Run everything.** Confirm 97 vitest + 6 Playwright all pass.

2. **Implement WW-P04 through WW-P07** from the test.md:
   - WW-P04: return visit — IDB has repo, nav populates without clone, diff ranges cached
   - WW-P05: diff-aware link routing — Cmd+click on order-router.ts:54 → lands on PR diff view (`pull/1/files#diff-{hash}R54`)
   - WW-P06: blob fallback — Cmd+click on crust-validator.ts:40 → lands on blob view (file not in PR)
   - WW-P07: fetch latest — click button → repo updates → diff ranges re-fetched

3. **Fix bugs you find.** The fs-eng flagged: diff URL async resolution uses a placeholder pattern, PAT not persisted. Fix what you can.

4. **Check DOM, not just model.** The lesson from 0600: tests that read model state pass while the product is broken. For link routing tests, verify the GitHub tab actually navigated to the right URL — don't just check the store.

5. **Report:** total pass/fail, bugs found and fixed, story coverage.

Write response.md, then `nap3 done`.
