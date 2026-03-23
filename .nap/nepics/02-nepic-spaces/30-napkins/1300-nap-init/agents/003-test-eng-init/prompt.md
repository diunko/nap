You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 1300-nap-init.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.test.md` — 5 test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/agents/002-fs-eng-init/response.md`

Read the code:
- `src/cli/nap.ts` — the init command
- `src/templates/` — the templates being copied

All 5 tests are vitest (small) — no Electron needed. Use temp directories. Spawn `nap init` as child process. Query SQLite via system `sqlite3` CLI.

For T-1300-04 (skills --user flag), override HOME env var to a temp dir.

Run `npm run test:small` — all pass.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/agents/003-test-eng-init/response.md`, then run `nap done` (no message).
