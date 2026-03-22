You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0900-reconciliation — filesystem walk vs SQLite on app launch.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/41-persistence-model.nap.md` — persistence model design

Read the existing code:
- `src/main/main.ts` — startup sequence
- `src/main/session-store.ts` — SQLite operations
- `src/main/database.ts` — schema
- `tests/helpers.ts`

Seams:
- Does reconciliation run on startup and match dirs to SQLite entries?
- Three outcomes: match (reconnect), new dir (create entry), orphaned SQLite (hide)?
- Does it handle empty 30-napkins/, missing dirs, agent dirs with no prompt.md?
- Does it NOT delete SQLite rows for missing dirs (branch switch scenario)?
- Performance: is it fast enough for 40 napkins?

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0900-reconciliation/0900-reconciliation.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
