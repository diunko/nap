You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 0700-clean-quit.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/agents/002-fs-eng-quit/response.md`

Rules: native modules = Playwright. Each suite gets own temp dir.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/agents/003-test-eng-quit/response.md`, then run `nap done` (no message).
