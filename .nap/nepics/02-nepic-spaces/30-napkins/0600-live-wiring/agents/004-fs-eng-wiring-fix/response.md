# 0600-live-wiring fix — Engineering Response

## Bug

Timing race on startup: main process sends `napkin:update` IPC before the renderer has registered its listener. The message is lost, so `store.napkins` stays empty.

**Chain**: `createWindow()` starts loading page → `startNapkinWatcher()` runs `fullScan()` → `sendUpdate()` fires `napkin:update` → renderer hasn't mounted yet → message lost.

Same issue for initial `napkin:status-changed` messages sent from SQLite.

## Fix

Added pull-based IPC so the renderer requests initial data after its listener is ready.

### Changes

1. **`src/main/napkin-watcher.ts`** — exported `getActiveNapkinData()`: returns `fullScan()` results for the active nepic dir
2. **`src/main/main.ts`** — added `ipcMain.handle('get-napkin-data')` returning `{ napkins, statuses }` (filesystem data + SQLite statuses)
3. **`src/main/preload.ts`** — added `getInitialNapkins()` bridge
4. **`src/types/electron-api.d.ts`** — added type declaration
5. **`src/renderer/index.tsx`** — calls `getInitialNapkins()` after listener setup, feeds data into `setNapkinData` + `mergeNapkinStatus`

### Why this works

The renderer's `useEffect` first registers IPC listeners (synchronous), then calls `getInitialNapkins()` (async IPC invoke). By the time the response arrives, the listener is guaranteed to be active. Future incremental updates from the watcher flow through the existing push-based `napkin:update` channel as before.

## Additional fixes

- **Kanban toggle** — Cmd+` wasn't firing on macOS (system shortcut conflict). Added renderer-side keydown fallback.
- **Extended view** — Agent dirs now show actual files from filesystem, not hardcoded entries. `agents` type changed from `string[]` to `{ name: string; files: string[] }[]`.
- **Napkin styling** — Agent lines use status dot as bullet (not `*`), agent files have `*` bullets, artifact controls hover-only, stable indentation between focused/unfocused states.
- **Startup nepic** — Watcher now starts for saved active nepic (not always first). Statuses scoped to active nepic only.
- **Typecheck coverage** — `npm run typecheck` now also checks test files (`tests/tsconfig.json`).

## Proposal: napkin store redesign

See **[proposal-napkin-store-redesign.md](proposal-napkin-store-redesign.md)** — the current architecture only tracks known artifact extensions and reconstructs paths in the renderer. The proposal replaces this with a full filesystem snapshot model where the watcher produces complete entries with absolute paths, the store is the single source of truth, and the renderer does zero path logic.

Key insight: the napkin directory can contain arbitrary files (research notes, feedback, scratch) and non-agent subdirectories. The renderer should show everything the filesystem has, not just a hardcoded list of known extensions.

## Verification

- `tsc --noEmit`: zero errors (src + tests)
- `vitest run`: 123 passed, 1 skipped
