# 003-test-eng-resume-fix — response

## implemented

All 5 test cases (T-1500-01 through T-1500-05) implemented as Playwright medium tests in `tests/session-resume-fix/session-resume-fix.spec.ts`.

### T-1500-01: clean quit does NOT mark sessions 'exited'
- Creates two sessions via socket (one running, one done via `nap done`)
- Uses `teardownPtys()` to prevent race conditions, then quits
- Verifies via `sqlite3` CLI that 'running' stays 'running' and 'done' stays 'done'

### T-1500-02: agent exits while app running → marked 'exited'
- Creates session with `exit 0` command via socket
- Waits for renderer store to show `status === 'exited'`
- Confirms via `app.evaluate` on session-store

### T-1500-03: resume finds 'running' and 'done', skips 'exited'
- Seeds DB with three non-architect sessions: running, done, exited
- Launches app, checks `getResumeData().orphanedSessions`
- Running and done IDs present, exited ID absent

### T-1500-04: 'done' architect resumes on next launch
- Seeds DB with architect session status='done' + valid ccSessionUuid
- Launches app, verifies architect is in live ptys
- Confirms `getResumeData().architectSession` matches

### T-1500-05: quit → relaunch round-trip
- Phase 1: launch, create session via socket, verify running, teardown + quit
- Verify via `sqlite3` CLI that status is still 'running' after quit
- Phase 2: relaunch with same tmpDir, session appears in orphaned list

## T-0800-07 amendment verification

T-0800-07 passes with the `createdAt` offset fix (done architect at `now - 1000`, running architect at `now`). The `ORDER BY created_at DESC LIMIT 1` query is now deterministic.

## test results

- `npm run test:small` — **140 passed**, 1 skipped
- `npm run test:medium` — **223 passed**, 4 skipped, 0 failures

No implementation issues found. All behaviors match the spec.
