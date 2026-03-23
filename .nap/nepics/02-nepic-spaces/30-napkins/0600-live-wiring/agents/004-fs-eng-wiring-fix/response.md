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

## Verification

- `tsc --noEmit`: zero errors
