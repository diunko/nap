You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement clean quit — save UI state to SQLite on app close, restore on launch.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/0700-clean-quit.test.md`

Read existing code:
- `src/main/main.ts` — quit handlers, startup
- `src/main/session-store.ts` — add saveUiState/loadUiState
- `src/main/database.ts` — ui_state table exists
- `src/renderer/store.ts` — state to save/restore

What to build:
1. `saveUiState(state)` and `loadUiState()` in session-store.ts
2. On before-quit: save active nepic, active terminal, sidebar visible to SQLite
3. On startup: read ui_state, send to renderer via IPC, apply before first render
4. Handle first launch (no row), invalid terminal IDs (fallback to first terminal)
5. Run `npm run typecheck` — zero errors

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0700-clean-quit/agents/002-fs-eng-quit/response.md`, then run `nap done` (no message).
