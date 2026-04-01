## FS Engineer response — 0610 nepic creation debug

### What I fixed

7 commits, one per bug/fix. All 139 small tests + 29 medium tests pass. Zero type errors.

#### Bug 7: createNepic missing prompt.md
- **Root cause**: `createNepicFn` in model.ts only wrote `.agent.nap.json`, never `prompt.md`
- **Fix**: Added `ARCHITECT_PROMPT` constant with the template content. Added `writeFile(path, content)` to the `FileSystem` interface (both `NodeFileSystem` and `MemoryFileSystem`). `createNepicFn` now writes `prompt.md` alongside the marker.
- **Files**: `model.ts`, `filesystem.ts`

#### Bug 5: watcher only watches 30-napkins/
- **Root cause**: `startWatching` called `fs.watch` on `dir + '/30-napkins'` only
- **Fix**: Extracted a `watchDir` helper, call it for both `30-napkins` and `20-architects`
- **Files**: `model.ts`

#### Bug 2: ENOTDIR on watcher after nepic creation
- **Root cause**: `switchNepic` didn't validate the slug. If a stale slug like `ui-state.json` reached `startWatching`, it would crash with ENOTDIR.
- **Fix**: `switchNepicFn` now checks `fs.isDirectory(newDir)` before proceeding. Throws a clear error for non-directory slugs.
- **Files**: `model.ts`

#### Bug 1: cross-nepic state corruption
- **Root cause**: `hasPendingWrite` set during `createNepicFn` persisted into the switched nepic. If a watcher event fired right after switch, the debounced reload was skipped, causing stale ephemeral state to persist.
- **Fix**: Reset `hasPendingWrite = false` at the start of `switchNepicFn`. The ui-state.json write at the end doesn't need the guard because it's outside the watched directories.
- **Files**: `model.ts`

#### Bug 6: architect not auto-started on app open / after nepic create
- **Root cause**: `startAgents` was only called once at app startup in `main.ts`. After `nepic:create` or `nepic:switch`, Case C agents (fresh architects) never got ptys.
- **Fix**: Added `startAgents` calls after both `nepic:switch` and `nepic:create` IPC handlers. Added `ptySpawner.isRunning(id)` guard in `startAgents` to skip agents whose ptys are already alive (prevents double-spawn when switching back to an old nepic).
- **Files**: `coordinators.ts`, `main.ts`

#### Fix: "acting" → "lead"
- One-line change in `Sidebar.tsx` ArchitectCard label
- **Files**: `Sidebar.tsx`

#### Improvement: debug panel overlay
- **Root cause**: DebugPanel was a flex sibling of the terminal container. Toggling it changed terminal width, triggering resize events.
- **Fix**: Moved DebugPanel inside the terminal container div. Both collapsed and expanded states now use `position: absolute; right: 0; top: 0; bottom: 0; z-index: 10`. Terminal width stays constant.
- **Files**: `index.tsx`, `DebugPanel.tsx`

### Bugs 3/4: terminal activation + previous nepic workable
These are effectively fixed by Bug 6's fix. `startAgents` is now called after `nepic:switch`, which means:
- Switching back to an old nepic → `startAgents` runs → ptys still alive → `isRunning` guard skips them → no double-spawn
- If old ptys died while on different nepic → `startAgents` respawns them
- New nepic creation → `startAgents` → Case C fresh architect gets pty

The renderer's existing logic (create xterm on demand, `pty:ready` flushes buffer) handles the terminal side correctly. No renderer changes needed.

### What the architect should review
1. The `ARCHITECT_PROMPT` constant is duplicated from the template file. If the template changes, both need updating. Could be read from disk at init time instead, but that would require the model to know the template path.
2. `startAgents` after every nepic switch adds latency (iterates all agents, checks isRunning). Negligible for small agent counts but worth noting.
3. The `hasPendingWrite` reset in switchNepic is the right fix but doesn't address the deeper design question of whether hasPendingWrite should be per-watched-directory rather than global.
