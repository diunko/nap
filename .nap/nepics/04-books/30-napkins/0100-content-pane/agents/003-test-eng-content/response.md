# 003-test-eng-content — response

## Results

**42 tests, all passing** — 23 small (vitest) + 19 medium (Playwright).

### Small tests (23 passing)

| File | Cases | Status |
|---|---|---|
| `tests/routing-rules.test.ts` | R01-R04 (12 assertions) | pass |
| `tests/content-store.test.ts` | S01-S07 (8 tests) | pass |
| `tests/content-watching.test.ts` | W01-W03 (3 tests) | pass |

### Medium tests (19 passing)

| File | Cases | Status |
|---|---|---|
| `tests/content-monaco.spec.ts` | M01-M06 (6 tests) | pass |
| `tests/content-layout.spec.ts` | L01-L06 (6 tests) | pass |
| `tests/content-watching.spec.ts` | W04 (1 test) | pass |
| `tests/content-nav.spec.ts` | N01-N06 (6 tests) | pass |

## Bugs found and fixed

### BUG 1: ContentPane — Monaco editor never initializes (critical)

**What:** Monaco editor never mounted. The content pane showed breadcrumb + empty container but no editor.

**Root cause:** ContentPane had two separate return paths — placeholder JSX (no file) vs editor JSX (file open). The `useEffect([], [])` that creates the editor runs once on first mount. On first mount, `activeFilePath` is null, so the placeholder renders — `containerRef.current` is null, the effect returns early. When `activeFilePath` changes, the editor branch renders, but the effect doesn't re-run (deps are `[]`).

**Fix:** Unified into a single DOM tree. Container div is always mounted (display toggled via CSS). Placeholder and breadcrumb are conditionally rendered inside the same parent. The `useEffect` now finds `containerRef.current` on mount and creates the editor.

**File:** `src/renderer/ContentPane.tsx`

### BUG 2: Medium tests fail with "Another instance of Nap is already running"

**What:** All Playwright tests fail with `firstWindow()` timeout. Electron process starts but never creates a BrowserWindow.

**Root cause:** Two issues compounding:
1. `NAP_SOCKET` env var inherited from the running dev instance (`electron-vite dev`). `getServerSocketPath()` checks `NAP_SOCKET` before `NAP_CWD`, so test instances always hit the dev socket.
2. Electron instances share the same `--user-data-dir`, causing lock conflicts.

**Fix:** Updated `launchApp()` in `tests/helpers.ts`:
- Strip `NAP_SOCKET` from inherited env
- Pass unique `--user-data-dir` per test run
- Clean up user data dir in `cleanupApp()`

**File:** `tests/helpers.ts`

## Findings

### FINDING 1: W01-W03 can't use MemoryFileSystem as designed

The test architecture designed W01-W03 to use `MemoryFileSystem.simulateChange`, but the content file watcher is implemented inline in `main.ts` using `nodeFs.watch` — completely separate from the model's `MemoryFileSystem` which watches directories for structural changes. The content watcher has no injectable filesystem abstraction.

**Impact:** Small tests for W01-W03 use real tmp files + `fs.watch` instead of `MemoryFileSystem`. They're fast (~1.2s total) but hit real filesystem. To enable true small tests, the fullstack engineer should extract the content watcher into a testable module with injectable fs.

### FINDING 2: N05 — can't spy on contextBridge API

`contextBridge.exposeInMainWorld` creates a frozen proxy object. Properties can't be reassigned, so renderer-side spies on `window.electronAPI.openFilePath` silently fail. The test verifies routing bypass by checking that `activeFilePath` stays null (proving the click doesn't route to left pane) rather than spying on IPC.

### FINDING 3: M06 — Monaco normalizes quickSuggestions

Monaco normalizes `quickSuggestions: false` to `{comments: "off", other: "off", strings: "off"}` internally. The test accounts for this.

## BUG 3: File watcher ignores atomic writes (fixed, commit 31223d8)

**What:** When an agent (Claude Code) edits a file open in Monaco, the editor doesn't update. VS Code edits work fine.

**Root cause:** `main.ts` file watcher filtered `eventType !== 'change'`. Claude Code uses atomic writes (write temp file → rename over original), which produce `'rename'` events — silently ignored by the filter.

**Fix:** Dropped the `eventType` filter. Watcher now reacts to any fs event. W05 test added to reproduce: simulates temp+rename write, asserts watcher fires.

**Test:** W05 in `content-watching.test.ts` — confirmed failing before fix, passing after.

## Files created

- `tests/routing-rules.test.ts` — R01-R04
- `tests/content-store.test.ts` — S01-S07
- `tests/content-watching.test.ts` — W01-W03, W05
- `tests/content-watching.spec.ts` — W04
- `tests/content-monaco.spec.ts` — M01-M06
- `tests/content-layout.spec.ts` — L01-L06
- `tests/content-nav.spec.ts` — N01-N06

## Files modified

- `src/renderer/ContentPane.tsx` — fixed editor mount bug (single DOM tree), added `__monaco__` test hook
- `src/main/main.ts` — fixed file watcher ignoring atomic writes
- `tests/helpers.ts` — fixed NAP_SOCKET inheritance + user-data-dir isolation

## Scaling notes

### Current approach (ephemeral, one file per pane)

Scales fine to large repos. The content pane watches one file at a time (`fs.watch` swaps on file switch), so watcher count is always 1. Monaco has one model alive at a time. The bottleneck is elsewhere — sidebar entry tree rendering (no virtualization), `loadFromFilesystem` walking deep directories, and full `AppSnapshot` serialization on every model change.

### If tabs are added (multiple open files per pane)

**What scales fine:**
- Monaco handles dozens of open models — designed for this (VS Code does it)
- Store state is just an array of paths, cheap
- Routing rules unchanged — still pure function per click

**What gets tricky:**
- **Memory** — each model holds content + undo history + tokenization. 50 tabs fine, 500 would hurt
- **File watchers** — need one per open file, or a directory watcher that multiplexes. Hundreds of `fs.watch` handles is wasteful
- **Auto-save fan-out** — each tab needs its own debounce timer + echo suppression. Current single-ref approach (`saveTimerRef`, `suppressExternalRef`) doesn't generalize
- **Tab state per nepic** — `nepicFilePathMemory` stores one path. With tabs: array of paths, scroll positions, cursor positions, dirty flags — per tab per nepic. Save/restore in `applySnapshot` gets heavier
- **Right pane mixing terminals + code** — xterm instances are expensive, can't be cheaply suspended like Monaco models. Terminal registry already keeps instances alive but hidden — tab bar would need to manage two resource types

**Architectural decision:** LRU eviction for models (keep N most recent, dispose the rest but remember the tab) vs keep all alive (simpler, memory ceiling). VS Code does LRU.
