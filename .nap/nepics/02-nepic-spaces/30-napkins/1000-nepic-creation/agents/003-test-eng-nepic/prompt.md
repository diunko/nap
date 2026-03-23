You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 1000-nepic-creation.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/agents/002-fs-eng-nepic/response.md`

Rules: native modules = Playwright. Each suite gets own temp dir. Run commands one at a time. When a test fails, run only that test until it passes.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/agents/003-test-eng-nepic/response.md`, then run `nap done` (no message).
