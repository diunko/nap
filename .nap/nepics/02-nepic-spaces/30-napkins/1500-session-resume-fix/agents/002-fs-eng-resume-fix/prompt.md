You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: fix session resume so everything resumes by default on app relaunch.

Read these in order:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.test.md` — test audit with exact changes needed

Read the code:
- `src/main/main.ts` — pty onExit handler, window-all-closed, architect resume logic
- `src/main/session-store.ts` — getArchitectForNepic, getAllSessions

What to implement:
1. `appIsClosing` flag in main.ts
   - Set to `true` in `window-all-closed` BEFORE calling killAllPtys
   - In onExit handler: if `appIsClosing` → skip setSessionStatus (leave status as-is)
   - If NOT appIsClosing → mark 'exited' (agent died on its own)
2. `getArchitectForNepic()` — change query from `status = 'running'` to `status != 'exited'`
3. `get-resume-data` handler — change orphaned filter from `s.status === 'running'` to `s.status !== 'exited'`
4. Amend T-0800-07 seed data: offset `created_at` so 'running' architect has later timestamp than 'done' architect

**DO NOT run tests.** Only run `npm run typecheck`. The test engineer will handle tests separately.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/agents/002-fs-eng-resume-fix/response.md`, then run `nap done` (no message).
