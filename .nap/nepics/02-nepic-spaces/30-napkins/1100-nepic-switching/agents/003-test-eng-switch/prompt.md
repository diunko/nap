You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 1100-nepic-switching.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/agents/002-fs-eng-switch/response.md`

Rules: native modules = Playwright. Each suite gets own temp dir. Run commands one at a time, no && chaining. When a test fails, run only that test until it passes.

DO NOT run pkill or kill any processes outside your test scope.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/agents/003-test-eng-switch/response.md`, then run `nap done` (no message).
