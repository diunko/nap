# Fullstack engineer response — 0320-session-and-render

## What I built

All 5 features from the spec. Zero type errors (`tsc --noEmit` clean).

### Files created
- `packages/v3/src/main/ghost-watcher.ts` — GhostWatcher class. Watches parent directories for missing files. Groups by dir (multiple ghosts in same dir share one `@parcel/watcher` subscription). Fires `onAppear(filePath, content)` when ghost file reappears.
- `packages/v3/src/renderer/scroll-sync.ts` — Exported functions for scroll sync between edit and rendered views. `findClosestSourceLine`, `findTopmostVisibleSourceLine`, `syncEditToRendered`, `syncRenderedToEdit`. Algorithm prefers `data-source-line ≤ targetLine` (the block that *contains* the line, not the nearest by absolute distance).

### Files modified
- **store.ts** — `Tab.ghost?: boolean`. New action `promoteGhostTab(path)`. New state `_fileReloadVersion` (triggers file reload on ghost promotion). Exported `persistFullUiState()` for quit save. Extended `loadPersistedUiState()` with tab restore, ghost detection, terminal/card restore. Model's `saveUiState` now merges with existing state (partial saves don't destroy other fields).
- **TabBar.tsx** — Ghost tabs render with `opacity: 0.4` and italic title.
- **ContentPane.tsx** — Ghost tab "file not found" placeholder. File load effect handles null content (marks tab as ghost, starts ghost watcher). Rendered mode refresh: HTML re-rendered inside the file load effect *after* `model.setValue()` completes (fixes stale content on tab switch). `onDidChangeContent` listener attached to the *new* model (not the old one). Scroll sync on mode toggle via `prevModeRef`. Rendered div always mounted (hidden via `display: none` in edit mode) so scroll sync can read/write `scrollTop`.
- **index.tsx** — `beforeunload` listener calls `persistFullUiState()`. Ghost-appeared IPC listener promotes ghost tabs and unwatches. `electronAPI` type extended with `watchGhost`, `unwatchGhost`, `onGhostAppeared`.
- **main.ts** — Ghost watcher IPC handlers (`file:watch-ghost`, `file:unwatch-ghost`). Ghost-appeared event sent to renderer (`file:ghost-appeared`).
- **preload.ts** — New IPC channels: `watchGhost`, `unwatchGhost`, `onGhostAppeared`.
- **model.ts** — `saveUiState` reads existing state and merges before writing (fixes existing bug where partial saves overwrote each other).

## Decisions

1. **Rendered div always mounted** — Changed from conditional rendering (`{mode === 'rendered' && <div>}`) to always-mounted with `display: none`. This allows scroll sync to read `scrollTop` and element positions when toggling rendered→edit (the div would otherwise be unmounted by the time the effect runs).

2. **`_fileReloadVersion` for ghost promotion** — When a ghost tab is promoted (file reappears) and it's the active tab, `activeFilePath` hasn't changed so the file load effect wouldn't re-trigger. The `_fileReloadVersion` counter in the effect deps forces a reload.

3. **Runtime ghost detection** — The file load effect also handles runtime file deletion (e.g., branch switch). If `fileRead` returns null for an existing tab, it marks it as ghost and starts the ghost watcher. This covers both restore-time and runtime ghost scenarios.

4. **Scroll sync timing** — Edit→rendered sync uses `queueMicrotask` to run after the rendered HTML effect populates innerHTML. Rendered→edit sync reads the rendered div *before* it's hidden (effects run in declaration order, and the rendered div is always mounted now).

5. **Tab save by path, not ID** — Saved state uses `activeLeftTabPath`/`activeRightTabPath` (paths). On restore, fresh tab IDs are generated via `nextTabId()`, and the active tab is found by path match. Ghost tabs are skipped when selecting the active tab.

6. **Terminal tab not saved** — `__terminal__` sentinel excluded from `rightTabs` save. Reconstructed from `activeTerminalId` via `setActiveTerminal()` on restore.

7. **`saveUiState` merge** — Changed model's `saveUiState` from overwrite to read-merge-write. This fixes an existing bug where `persistUiState({ theme })` would destroy `debugPanelCollapsed`. The quit save (`persistFullUiState`) sends all fields at once, so the merge is redundant for quit — but it fixes crash recovery (partial save + crash → next start reads the merged state).

## Things to review

- The `shikiTheme` variable is captured by the file load effect's async closure. If the theme changes while a file is loading, the rendered HTML might use a stale theme. This is extremely unlikely in practice and self-corrects on the next render.
- The ghost watcher doesn't handle the case where a file appears and disappears rapidly. The spec says "ghost should only un-ghost when read succeeds" — the GhostWatcher tries `readFile` before firing `onAppear`, so this is handled.
