# 0500-filesystem-service — Response

## What was built

### `src/main/napkin-watcher.ts`
New module — the filesystem service. Exports:
- `startNapkinWatcher(nepicDir, mainWindow)` — starts watching `<nepicDir>/30-napkins/` with recursive fs.watch. Does initial full scan and sends all napkins as array via `napkin:update` IPC. On file changes, debounces per napkin dir (200ms) and sends single updated `NapkinData`.
- `stopNapkinWatcher()` — closes all watchers, clears debounce timers.
- `readNapkinDir(napkinsDir, slug)` — reads a single napkin dir: artifact extensions, agent dir names, top-level `*` bullets from `.nap.md`. Exported for test access.

### Data structure
```typescript
interface NapkinData {
  slug: string;
  artifacts: string[];     // e.g. ['.nap.md', '.spec.md']
  agents: string[];        // e.g. ['001-test-arch', '002-fs-eng']
  napkinBullets: string[];  // first-level * lines from .nap.md (text only, no bullet prefix)
}
```

### Changes to existing files

**`src/main/main.ts`**
- Imports `startNapkinWatcher`, `stopNapkinWatcher`, `readNapkinDir`
- After `createWindow()`: finds first nepic dir in `.nap/nepics/`, starts watcher with mainWindow
- `will-quit`: calls `stopNapkinWatcher()` before other cleanup
- `__napTest`: exposes `readNapkinDir`, `startNapkinWatcher`, `stopNapkinWatcher`

**`src/main/preload.ts`**
- Added `onNapkinUpdate` bridge — same pattern as `onNapkinStatusChanged`

**`src/types/electron-api.d.ts`**
- Added `onNapkinUpdate` to `ElectronAPI` interface

**`src/types/nap-test.d.ts`**
- Added `readNapkinDir`, `startNapkinWatcher`, `stopNapkinWatcher` to `NapTestHelpers`

## Design decisions

1. **Parent dir watcher for T-0500-13**: When `30-napkins/` doesn't exist yet, a parent watcher on `nepicDir` detects its creation and spins up the recursive watcher. Small delay (100ms) to let the dir settle before scanning.

2. **Async readdir/readFile**: Used `fs.promises` throughout for non-blocking reads. The debounce timer fires an async function.

3. **Bullet extraction**: Only lines matching `^\*\s` (no leading whitespace) are extracted. The `*` prefix is stripped from the returned strings.

4. **Artifact detection**: Scans for known extensions (`.nap.md`, `.spec.md`, `.test.md`, `.journeys.md`) only. Other files in the napkin dir are ignored.

5. **Initial payload vs incremental**: Startup sends `NapkinData[]` (array). Incremental updates send single `NapkinData`. Renderer distinguishes by checking `Array.isArray()`.

## Typecheck
`tsc --noEmit` — zero errors.
