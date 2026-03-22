You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 0900-reconciliation.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/agents/002-fs-eng-reconcile/response.md`

Read the code:
- `src/main/reconcile.ts` — the function under test
- `tests/helpers.ts`

Rules: native modules = Playwright. Each suite gets own temp dir. Run commands one at a time. When a test fails, run only that test until it passes, not the full suite.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/agents/003-test-eng-reconcile/response.md`, then run `nap done` (no message).
