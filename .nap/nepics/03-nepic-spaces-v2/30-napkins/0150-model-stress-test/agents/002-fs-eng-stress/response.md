## What was built

### Async migration
- `FileSystem` interface replaces `FileSystemReader` — all methods return Promises, plus `writeJSON` and `watch`
- `MemoryFileSystem` returns resolved promises (tests stay fast, just add `await`)
- `NodeFileSystem` wraps `fs/promises` for async I/O
- `NapModel.loadFromFilesystem` returns `Promise<void>`
- All 16 existing 0100 tests pass after adding `async/await`

### Filesystem watching
- `MemoryFileSystem.watch(dir, callback)` → unsubscribe function, stores watchers by dir
- `MemoryFileSystem.simulateChange(path)` triggers watch callbacks (for external-change tests)
- `MemoryFileSystem.updateFile(path, data)` updates store WITHOUT triggering watch
- `MemoryFileSystem.addFile(path, data)` adds file WITHOUT triggering watch
- `MemoryFileSystem.writeJSON` both stores AND triggers watch (production-like)
- Model debounces watch events at 200ms (matches v2 pattern)

### Write-back
- `model.createAgent(slug, data)` — writes `.agent.nap.json`, updates internal state, notifies
- `model.setAgentExited(slug, name)` — reads existing marker, adds `exited: true`, writes back (preserves all fields)
- `model.setNapkinStatus(slug, status)` — writes `.napkin.nap.json`, updates state
- `model.saveUiState(state)` — writes `ui-state.json`
- All write methods fire `onChange`

### Write-then-watch loop prevention
- `hasPendingWrite` flag set before each model write
- When debounce fires: if flag set → clear flag, skip re-read; if not set → external change, full re-read
- Flag clears after debounce settles, so subsequent external writes to same path are processed

### Test hook
- `global.__napModel__` exposed when `NAP_TEST=1` for medium test access via `app.evaluate`

### Tests
- **37 small tests** (vitest): 16 existing (async-migrated) + 21 new (T-0150-02/03, T-0150-10–14, T-0150-20–24, T-0150-30–32, T-0150-40–45)
- **8 medium tests** (Playwright): 4 existing + 4 new (T-0150-60–63)
- Small/medium equivalence proven: create agent, agent exits, status change, full cycle — same assertions, same outcomes
- `tsc --noEmit` — zero errors

### Decisions
- Watch is on `nepicDir + '/30-napkins'` only (architects not watched — not in test scope)
- Debounce re-reads entire model from filesystem (simple, correct, matches all test expectations)
- `hasPendingWrite` is a boolean, not per-path — acceptable because model writes always update internal state first, so re-read of own writes would be a no-op anyway
- `FileSystemReader` kept as type alias for backward compat (only used in one import)
