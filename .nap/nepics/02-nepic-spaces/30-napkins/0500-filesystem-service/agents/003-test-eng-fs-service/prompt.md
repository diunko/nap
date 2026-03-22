You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run the test cases for 0500-filesystem-service.

Read these:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.test.md` — test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/agents/002-fs-eng-fs-service/response.md` — what was built

Read the code:
- `src/main/napkin-watcher.ts` — the service under test
- `tests/helpers.ts` — Playwright helpers

Rules:
- Native modules = Playwright medium tests. Pure TS = vitest small.
- Each Playwright suite gets its own temp dir.
- fs.watch tests may need timing tolerance — use `waitForFunction` with reasonable timeouts.

Run:
- `npm run test:small` — all pass
- `npm run test:medium` — all pass

Write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/agents/003-test-eng-fs-service/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
