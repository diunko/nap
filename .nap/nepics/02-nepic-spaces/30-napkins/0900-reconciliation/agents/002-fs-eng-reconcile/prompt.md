You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement reconciliation — on app startup, walk the filesystem and match against SQLite to detect new, existing, and orphaned napkins/agents.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.test.md`
5. `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/41-persistence-model.nap.md` — persistence model design

Read existing code:
- `src/main/main.ts` — startup sequence
- `src/main/session-store.ts` — SQLite operations
- `src/main/napkin-store.ts` — napkin operations
- `src/main/database.ts` — schema

What to build:
1. `reconcile(nepicDir, db)` function — runs once on startup
   - Walk `30-napkins/` → list napkin dirs
   - Walk each `agents/` → list agent dirs
   - Match against SQLite by key (napkin_slug + agent_dir_name)
   - Three outcomes:
     - Match: keep existing row, no changes
     - Dir exists, no SQLite: INSERT with defaults (napkin: status=backlog, agent: status=new)
     - SQLite exists, no dir: mark hidden=true (or equivalent), don't DELETE
   - Handle: empty 30-napkins/, missing dir, no agents/ subdir
2. Call reconcile in main.ts startup, after database init, before UI renders
3. Expose for testing via `globalThis.__napTest`
4. Run `npm run typecheck` — zero errors

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/agents/002-fs-eng-reconcile/response.md`, then run `nap done` (no message).
