## 0150 — model stress test: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study what 0100 built — read every file in `packages/v3/src/` and `packages/v3/tests/`. Understand the model, bridge, filesystem abstraction, and fixture patterns. This napkin extends that foundation.

### Context

0100 proved the basic read path: model loads marker files, bridge delivers snapshot, renderer shows sidebar. But 0100's model is sync and read-only. This napkin pushes the architecture with everything that broke v2: async I/O, filesystem watching, write-back, and the full lifecycle. If the model handles all of this while remaining testable with fakes, the architecture is proven.

### Async migration

0100's `FileSystemReader` is sync. Migrate to async:

```ts
interface FileSystem {
  readdir(dir: string): Promise<string[]>
  readJSON(filePath: string): Promise<unknown | null>
  isDirectory(filePath: string): Promise<boolean>
  writeJSON(filePath: string, data: unknown): Promise<void>
  watch(dir: string, callback: (event: string, filename: string) => void): () => void
}
```

- `MemoryFileSystem` returns resolved promises — tests stay synchronous in practice (just add `await`)
- `NodeFileSystem` wraps real `fs/promises`
- `model.loadFromFilesystem()` becomes async
- All existing 0100 tests must still pass after the migration

### Filesystem watching

The model must react to live changes. The `watch()` method on `FileSystem`:
- Production: wraps `fs.watch` with debounce (200ms — same as v2's watcher)
- Tests: `MemoryFileSystem` exposes a `simulateChange(path)` method that triggers the watch callback
- When a watched marker file changes, model re-reads it and fires `onChange`

Study v2's `packages/v2/src/main/napkin-watcher.ts` for reference — particularly the debounce pattern. But v3 watches marker files specifically, not all file content.

### Write-back

Model writes marker files when state changes:
- `createAgent(napkinSlug, agentData)` → writes `.agent.nap.json` to the agent dir
- `setAgentExited(napkinSlug, agentName)` → updates `.agent.nap.json` with `exited: true`
- `setNapkinStatus(slug, status)` → writes `.napkin.nap.json`
- `saveUiState(state)` → writes `ui-state.json`

**The write-then-watch problem:** model writes a marker → watcher fires → model must NOT re-process its own write. Solution: model tracks "pending writes" and ignores watch events for paths it just wrote. The ignore window should be short (e.g. clear after debounce settles).

In `MemoryFileSystem`: `writeJSON` updates the internal store AND triggers any active watch callbacks (simulating what the real fs would do). This means tests exercise the write-then-watch path automatically.

### The full lifecycle (testable in vitest)

These state transitions must work entirely on the model with fakes:

1. **s→r (start):** `await model.loadFromFilesystem(nepicDir)` → model populated → onChange fires
2. **Runtime — agent created:** `await model.createAgent(...)` → marker written → model updated → onChange fires
3. **Runtime — agent exits:** `await model.setAgentExited(...)` → marker updated → model updated → onChange fires
4. **Runtime — status change:** `await model.setNapkinStatus(...)` → marker updated → model updated → onChange fires
5. **Runtime — external change:** something outside model writes a marker file → watcher fires → model re-reads → onChange fires
6. **r→s (stop):** `model.saveUiState(...)` → written to disk → model can be discarded
7. **s→r again:** new model instance, `loadFromFilesystem` → same persistent state as before step 6

### Medium tests — equivalence with small tests

For each key journey, write BOTH a small test (model + fakes) and a medium test (real Electron + real fs). Both must assert the same outcomes. This proves the fake-based testing approach is trustworthy.

The medium tests use real filesystem, real IPC, real Electron process split. Set up a tmpDir with marker files, launch the app with `--cwd`, perform actions, assert on renderer store state via `page.evaluate`.

The equivalence pattern establishes the testing contract for all future napkins:
- Business logic → small tests (fast, many)
- IPC seam verification → medium tests (few, targeted)

### Bridge changes

0100's bridge pushes snapshots on model change. This still works — but now model changes happen from writes AND from watcher events. The bridge doesn't change; it just pushes whenever `onChange` fires. Verify that watcher-triggered changes also flow through the bridge to the renderer.

### What NOT to do

- Don't add real ptys — use fakes for the pty spawner interface
- Don't change the renderer UI — 0100's sidebar is sufficient
- Don't add CLI/socket integration — that's 0300
- Don't break 0100's existing tests — they must all still pass after async migration
