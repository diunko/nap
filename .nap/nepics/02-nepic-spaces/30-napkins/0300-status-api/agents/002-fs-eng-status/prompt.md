You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: build the status change API — a single function that keeps SQLite and board symlinks in sync, exposed via socket protocol and CLI.

Read these in order:
1. `.nap/00-org/10-promise.nap.md` — what NAP is
2. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.nap.md` — the napkin
3. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.spec.md` — the spec
4. `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.test.md` — test architecture (shape your code so these tests are possible)

Read the existing code:
- `src/main/session-store.ts` — SQLite operations pattern, napkins table
- `src/main/database.ts` — schema
- `src/main/main.ts` — socket request handlers
- `src/shared/protocol.ts` — request/response types
- `src/cli/nap.ts` — CLI command structure

What to build:
1. `src/main/napkin-store.ts` — `changeNapkinStatus(slug, newStatus)` function
   - Updates SQLite napkins table (upsert: create row if missing)
   - Moves symlink in 40-board/ (rm old from any status dir, ln -s in new dir)
   - SQLite is authoritative: if symlink fails, log warning, don't rollback
   - Status validation: only backlog, todo, doing, review, done
   - Pure function for status-to-dir mapping: `statusToDir('doing') → '40-doing'`
2. Socket handler: type `napkin-status` (NOT `status` — that's already used for session runtime status)
   - Request: `{ type: 'napkin-status', napkinSlug: string, status: string }`
   - Validate napkin dir exists on disk before creating/updating
3. CLI command: `nap status <napkin-slug> <status>`
   - Sends `napkin-status` socket request
   - Error handling: missing args, invalid status, napkin not found
4. IPC notification to renderer after status change
5. Run `npm run typecheck` — zero errors
6. Run `npm run test:small` — all pass

Key constraint from test architecture: use `napkin-status` as socket type name to avoid colliding with existing `status` command for session queries.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/agents/002-fs-eng-status/response.md`, then run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
