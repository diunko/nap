# 002-fs-eng-resume-fix — response

## what was built

Four changes across three files:

### src/main/main.ts
1. **`appIsClosing` flag** — module-level `let appIsClosing = false`
2. **`window-all-closed`** — sets `appIsClosing = true` BEFORE `killAllPtys()` (prevents race)
3. **onExit handler** — wraps the `setSessionStatus('exited')` call in `if (!appIsClosing)` guard. When app is closing, statuses are left as-is. When agent dies on its own, still marks 'exited'.
4. **`get-resume-data` handler** — orphaned filter changed from `s.status === 'running'` to `s.status !== 'exited'`. Now surfaces 'running', 'done', and any other non-exited sessions as resumable.

### src/main/session-store.ts
5. **`getArchitectForNepic()`** — SQL query changed from `status = 'running'` to `status != 'exited'`. A 'done' architect now gets found and resumed.

### tests/architect-resume/architect-resume.spec.ts
6. **T-0800-07 seed data** — added optional `createdAt` field to seedDb session interface. T-0800-07 now seeds 'done' architect with `Date.now() - 1000` and 'running' architect with `Date.now()`, ensuring deterministic `ORDER BY created_at DESC LIMIT 1` after query broadening.

## decisions

- The `appIsClosing` flag is a simple module-level boolean — no need for anything fancier since it's only read in the synchronous onExit callback.
- The flag is set before `killAllPtys()` to prevent any timing gap where a pty could exit and mark itself 'exited' before the flag is set.
- The `createdAt` field in seedDb is optional with `?? Date.now()` fallback — no impact on any other test that doesn't use it.

## typecheck

`npm run typecheck` passes with zero errors.
