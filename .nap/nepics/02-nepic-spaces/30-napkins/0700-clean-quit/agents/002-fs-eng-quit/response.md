# 002-fs-eng-quit — Response

## What was built

Clean quit: save UI state to SQLite on app close, restore on launch.

### Files changed

1. **`src/main/session-store.ts`** — Added `saveUiState(state)` and `loadUiState()`.
   - `saveUiState`: INSERT OR REPLACE into ui_state (id=1, single row, upsert). Converts boolean `sidebarVisible` to integer 0/1.
   - `loadUiState`: SELECT from ui_state. Validates `active_terminal_id` against sessions table — returns null for that field if session no longer exists. Converts integer sidebar_visible back to boolean. Returns null when no row exists (first launch).

2. **`src/main/main.ts`** — Three additions:
   - `trackedUiState` in-memory variable, updated via `ui-state:update` IPC from renderer on every store change.
   - `app.on('before-quit', ...)` — saves `trackedUiState` to SQLite synchronously. Fires before `will-quit` (which closes stores/db), so db is guaranteed open.
   - `ipcMain.handle('get-ui-state', ...)` — renderer requests saved state on launch.
   - Exposed `saveUiState` and `loadUiState` in `__napTest` for Playwright tests.

3. **`src/main/preload.ts`** — Added two IPC methods:
   - `sendUiState(state)` — renderer → main (fire-and-forget, every store change)
   - `getUiState()` — renderer → main invoke (request saved state on launch)

4. **`src/types/electron-api.d.ts`** — Added type declarations for the two new IPC methods.

5. **`src/types/nap-test.d.ts`** — Added `saveUiState` and `loadUiState` to test helpers.

6. **`src/renderer/index.tsx`** — Two changes:
   - **Hydration on mount**: calls `getUiState()` before creating the first terminal. Applies `sidebarVisible` and `activeNepicId` immediately. After first terminal creation, restores `activeTerminalId` only if it exists in the renderer's terminal list.
   - **State push**: zustand `subscribe` sends `{ activeNepicId, activeTerminalId, sidebarVisible }` to main on every state change.

## Design decisions

- **Renderer pushes state, main saves.** The renderer zustand store is the source of truth for UI state. Rather than main asking renderer at quit time (async IPC race risk) or main tracking state independently (would miss `setActive`), the renderer pushes on every change. IPC overhead is negligible for 3 scalar fields.

- **`before-quit` not `will-quit`.** The `will-quit` handler already calls `closeSessionStore()` and `closeDatabase()`. Save must happen before both. `before-quit` fires first in Electron's quit sequence.

- **No `event.preventDefault()` in before-quit.** Save is synchronous (better-sqlite3), sub-millisecond for a single-row upsert. No need to hold up quit.

- **Terminal ID validation in `loadUiState`.** Checks sessions table. If the saved terminal ID no longer exists, returns null — renderer falls back to architect (first terminal created).

- **Sidebar restore via `toggleSidebar()`.** The store default is `true`. If saved state is `false`, we toggle once. This keeps the restore logic simple and aligned with how the store works.

## Typecheck

`npm run typecheck` — zero errors.

## Notes for test engineer

- `saveUiState` and `loadUiState` are exposed in `__napTest` — call via `app.evaluate`.
- The zustand subscribe fires on any state change, so setting store state in a test will push to main immediately (IPC is async but fast).
- For T-0700-05 (two-launch test): the saved `activeTerminalId` from Phase 1 won't exist in the renderer's terminal list in Phase 2 (it's a new pty, new ID). The test should assert `sidebarVisible` round-trips correctly and `activeTerminalId` falls back to the new first terminal.
- `getUiState` IPC handle returns `null` on first launch (no ui_state row).
