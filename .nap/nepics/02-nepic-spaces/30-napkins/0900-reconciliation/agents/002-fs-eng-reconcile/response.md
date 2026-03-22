## What was built

### New module: `src/main/reconcile.ts`

`reconcile(nepicDir, db)` — runs once per nepic on startup. Walks `30-napkins/` and each `agents/` subdir, matches against SQLite by key (`napkin_slug + agent_dir_name`).

Three outcomes:
- **Match**: keep existing row; clear `hidden` flag if previously orphaned (branch switch round-trip)
- **New dir, no SQLite**: INSERT with defaults — napkins get `status=backlog`, agents get `status=new`, no `cc_session_uuid`
- **SQLite exists, no dir**: set `hidden=1` — never deletes rows

All writes run in a single SQLite transaction for atomicity and performance.

### Schema changes: `src/main/database.ts`

Added `hidden INTEGER NOT NULL DEFAULT 0` to both `napkins` and `sessions` tables. Existing rows default to visible.

### Startup integration: `src/main/main.ts`

Reconciliation runs after `initNapkinStore`, before architect auto-resume, before window creation. Walks all nepic dirs under `.nap/nepics/`.

### Test surface: `globalThis.__napTest`

Exposed `reconcile` function. Updated `src/types/nap-test.d.ts` with the type.

### Edge cases handled
- `30-napkins/` doesn't exist (ENOENT caught, all existing napkins orphaned)
- `30-napkins/` empty (no crash, no new rows)
- Agent dir with no `prompt.md` (dir existence is what matters, not contents)
- Orphaned rows preserve all metadata (IDs, statuses, timestamps, UUIDs)
- Branch switch round-trip: orphan → reconnect restores all metadata, clears hidden flag

### Decisions
- Used `hidden` column (not status flag) — orthogonal to napkin/session status, survives status changes
- Agent sessions inserted with `status='new'` — distinguishes from runtime-created sessions
- No `cc_session_uuid` for reconciled agents — assigned only when actually launched
- Hash map matching (O(n)) — not nested loops — handles the 40×3 performance target easily
- Architect sessions (napkin_slug IS NULL) excluded from reconciliation — they're not filesystem-defined

### Typecheck
`tsc --noEmit` — zero errors.
