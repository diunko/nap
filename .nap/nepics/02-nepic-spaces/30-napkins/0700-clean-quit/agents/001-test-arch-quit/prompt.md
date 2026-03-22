You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0700-clean-quit — saving UI state to SQLite on quit and restoring on launch.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read the existing code:
- `src/main/main.ts` — quit handlers, startup sequence
- `src/main/session-store.ts` — SQLite operations
- `src/main/database.ts` — ui_state table
- `src/renderer/store.ts` — state to save/restore
- `tests/helpers.ts` — Playwright helpers

Seams:
- Does UI state save on clean quit (before-quit event)?
- Does UI state restore on launch (correct nepic, terminal, sidebar)?
- Does it handle: first launch (no ui_state row), corrupted state, missing terminal ID?
- Does save not block pty shutdown?
- Does quit sequence still work (ptys killed, socket cleaned, db closed)?

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
