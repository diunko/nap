You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0300-status-api — a single API for napkin status changes that keeps SQLite and board symlinks in sync.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin for full context

Read the existing code to understand the seams:
- `src/main/session-store.ts` — existing SQLite operations pattern
- `src/main/main.ts` — socket request handlers, where new handler goes
- `src/shared/protocol.ts` — request/response types
- `src/cli/nap.ts` — CLI command structure
- `src/main/database.ts` — schema (napkins table exists)

Think about seams:
- changeNapkinStatus function — does it update SQLite AND move symlink atomically?
- New socket `status` command — round-trip from CLI to main process
- New CLI `nap status` command — argument parsing, error handling
- Symlink edge cases — old symlink doesn't exist, target dir missing, napkin not in SQLite yet
- IPC notification to renderer — does the sidebar/kanban update?
- Creating napkin row on first status set (napkin dir exists but no SQLite entry yet)

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0300-status-api/0300-status-api.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal. The architect is blocked waiting — without this, the pipeline stalls.
