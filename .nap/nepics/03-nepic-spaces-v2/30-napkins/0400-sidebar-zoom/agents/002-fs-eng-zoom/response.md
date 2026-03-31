## 0400 — sidebar zoom + filesystem watcher + debug panel tabs: implementation summary

### What was built

**Three zoom levels** — collapsed → focused (click) → extended (Cmd+E):

1. **Collapsed** (refined): one line per card with role-colored dots, phase label. Click card → focused. Click dot → switch terminal.

2. **Focused** (new):
   - Napkin: file entries (detects `<slug>.nap.md` as main, renders first/bold) + agent entries with dots/role/status. Dirs shown as collapsed entries (one level deep). Click file → open in editor. Click agent → terminal.
   - Architect: top-level home dir contents (prompt.md, onboarding/, scratch/). Same pattern as napkin — dirs collapsed in focused, expanded in extended. [terminal] entry if started.

3. **Extended** (new, Cmd+E toggle):
   - Full recursive file tree for both card types. All nesting levels.
   - Files with hover controls: ⎘ (copy path to clipboard) + ↗ (open in editor).
   - [terminal] virtual entry for agents with `started=true`. Click → switch terminal.
   - NO [diff] — cut from this version.

**Filter bar** — Cmd+K shows/focuses filter input. Typing filters napkin cards by slug. Escape dismisses.

**Keyboard shortcuts**:
- Cmd+E — toggle focused ↔ extended on focused card
- Cmd+K — show/hide filter bar
- Cmd+B — toggle sidebar visibility
- Cmd+D — toggle debug panel collapsed/expanded

**Debug panel** — extended, not redesigned:
- Three tabs: model (existing JSON view), filesystem (raw file tree from snapshot), events (live watcher event log, most recent at top)
- Collapse toggle (✕ button in header, or Cmd+D). Collapsed = 20px thin bar with "debug" label.
- Tab selection + collapsed state persisted across restarts via ui-state.json.

**Model/bridge changes**:
- `FileEntry`, `DirEntry`, `Entry` types in bridge-types.ts
- `WatcherEvent` type for debug panel events tab
- `NapkinState.entries` — napkin-level files/dirs (excluding agents/ dir, hidden files)
- `AgentState.entries` — agent home dir files/dirs (excluding hidden files)
- Model reads file entries recursively during `loadFromFilesystem()`
- Detects `<slug>.nap.md` and flags as `isMain: true`
- Watcher logs events (timestamp, event, filename) capped at 100
- Snapshot includes entries and watcher events

**Store changes**:
- `focusedCardSlug`, `cardViewMode` — zoom state
- `sidebarVisible` — Cmd+B toggle
- `browserFilterText`, `browserFilterVisible` — Cmd+K filter
- `debugPanelCollapsed`, `debugPanelTab` — debug panel state
- `applySnapshot` preserves renderer-only state (only updates model fields)
- Actions: `expandCard`, `extendCard`, `collapseCard`, `toggleSidebar`, `setBrowserFilter`, `setBrowserFilterVisible`, `toggleDebugPanel`, `setDebugPanelTab`

**Dot system** — kept as-is (role colors + status shapes):
- Pure `dotStyle()` function extracted to `shared/dot-style.ts` for testability
- Role colors: orange=test-arch, green=fs-eng, gray=test-eng, blue=architect+default
- Status shapes: filled=running, dashed-check=done, hollow-gray=exited
- Running dots pulse (2s ease-in-out)

**Test fixtures added** (F12, F13):
- F12: zoom fixture with agents in all lifecycle states + content files + architect with subdirs
- F13: dot color state matrix (one agent per lifecycle state)

### What was ported from v2

- `FileRow` component (hover controls, copy path, open in editor) — inline styles verbatim
- `NapkinCard` focused/extended body (file entries, agent entries, [terminal])
- `ArchitectCard` focused/extended body (home dir file tree)
- Filter bar with Cmd+K
- `StatusDot` rendering with hollow/pulsing states

### Decisions made

1. **DirEntry.children** instead of `DirEntry.files` — allows recursive nesting for deep file trees in extended view.
2. **readEntries as recursive** — model provides full tree depth, renderer limits display based on view mode (maxDepth=0 for focused, unlimited for extended).
3. **Watcher events in snapshot** rather than separate IPC channel — simpler, events capped at 100.
4. **UI state persisted via IPC** — `save-ui-state`/`load-ui-state` channels, loaded on mount.
5. **AgentState.entries required** (not optional) — defaulted to `[]` for newly created agents. Populated from filesystem for loaded agents.

### Files changed

- `src/shared/bridge-types.ts` — entry types, WatcherEvent, entries on NapkinState/AgentState
- `src/shared/dot-style.ts` — NEW: pure dotStyle() function
- `src/main/model.ts` — readEntries helper, populate entries during load, watcher event logging
- `src/main/bridge.ts` — include watcher events in snapshot
- `src/main/main.ts` — watcher events in all snapshot pushes, ui-state IPC handlers
- `src/main/preload.ts` — expose saveUiState/loadUiState
- `src/renderer/store.ts` — zoom/sidebar/debug state, persist, applySnapshot preserves renderer state
- `src/renderer/Sidebar.tsx` — complete rewrite with three zoom levels
- `src/renderer/DebugPanel.tsx` — three tabs + collapse toggle
- `src/renderer/index.tsx` — Cmd+B/D shortcuts, loadPersistedUiState
- `tests/fixtures.ts` — F12, F13 fixtures

### Test results

- 114 small tests: all pass
- 21 medium tests: all pass
- Zero type errors (tsc --noEmit clean)
