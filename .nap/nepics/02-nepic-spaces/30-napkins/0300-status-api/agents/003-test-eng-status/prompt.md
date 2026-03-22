You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run the test cases for 0300-status-api.

Read these:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.test.md` — 15 test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.spec.md` — the spec
3. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/agents/002-fs-eng-status/response.md` — what was built

Read the code:
- `src/main/napkin-store.ts` — the function under test
- `src/shared/protocol.ts` — NapkinStatusRequest type
- `src/cli/nap.ts` — CLI status command
- `tests/helpers.ts` — existing Playwright helpers

Important rules from test architect role doc:
- **All tests touching native modules (SQLite, fs operations via Electron) must be Playwright medium tests.** Never import better-sqlite3 in vitest.
- T1 (statusToDir mapping) can be a vitest small test — it's a pure function.
- T13, T14 (CLI arg parsing) can be small if extracted as pure logic.
- Everything else is medium (Playwright).
- Each test suite gets its own temp dir via `--cwd` for DB isolation.

Implement:
- Small tests in `tests/status-api.test.ts` (T1, pure function tests)
- Medium tests in `tests/status-api.spec.ts` (T2-T12, T15)

Run:
- `npm run test:small` — all pass
- `npm run test:medium` — all pass

Report: which pass, which fail, with specifics.

Write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/agents/003-test-eng-status/response.md`, then run `nap done` in your terminal (no message argument).

CRITICAL: run `nap done` with NO message — just `nap done`. Do not pass any text after `nap done`. The architect is blocked waiting.
