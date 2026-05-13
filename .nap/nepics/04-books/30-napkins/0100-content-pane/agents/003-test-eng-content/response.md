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

## Files created

- `tests/routing-rules.test.ts` — R01-R04
- `tests/content-store.test.ts` — S01-S07
- `tests/content-watching.test.ts` — W01-W03
- `tests/content-watching.spec.ts` — W04
- `tests/content-monaco.spec.ts` — M01-M06
- `tests/content-layout.spec.ts` — L01-L06
- `tests/content-nav.spec.ts` — N01-N06

## Files modified

- `src/renderer/ContentPane.tsx` — fixed editor mount bug (single DOM tree), added `__monaco__` test hook
- `tests/helpers.ts` — fixed NAP_SOCKET inheritance + user-data-dir isolation
