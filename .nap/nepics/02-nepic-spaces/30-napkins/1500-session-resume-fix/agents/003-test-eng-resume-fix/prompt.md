You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement the 5 new test cases and verify the T-0800-07 amendment for 1500-session-resume-fix.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.test.md` — full audit + 5 test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/agents/002-fs-eng-resume-fix/response.md` — what was implemented

Read the code:
- `src/main/main.ts` — appIsClosing flag, onExit handler
- `src/main/session-store.ts` — broadened queries
- `tests/architect-resume/architect-resume.spec.ts` — T-0800-07 was amended by fs-eng, verify it passes
- `tests/helpers.ts`

Implement:
- All 5 test cases (T-1500-01 through T-1500-05) as Playwright medium tests
- T-1500-01 and T-1500-05 involve quit + relaunch — use `app.close()` then relaunch with same tmpDir
- For DB verification after quit, use system `sqlite3` CLI (not better-sqlite3)

Run:
- `npm run test:small` — all pass
- `npm run test:medium` — all pass

If tests fail due to implementation issues, document them in response.md with specifics. Do NOT fix the implementation — the fs-eng will handle that.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;. When a test fails, run only that test until it passes.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/agents/003-test-eng-resume-fix/response.md`, then run `nap done` (no message).
