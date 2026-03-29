# 0150 — model stress test: test cases

Hypothesis under test: **the model handles async I/O, filesystem watching, write-back, and the full lifecycle — while remaining testable with fakes. Small tests (model + fakes) and medium tests (real Electron + real fs) produce equivalent results.**

---

## Fixtures

All small tests use `MemoryFileSystem` — the 0150 version extends 0100's with async methods, `writeJSON`, `watch`, and `simulateChange`.

### F6: lifecycle fixture (extends F1 for write/watch testing)
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-ta", "role": "test-arch", "name": "001-test-arch", "created_at": 1711700000000 }
20-architects/001-architect/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect", "created_at": 1711600000000 }
```
Same as F1. The difference is what we DO with it — create agents, change status, watch for changes, write markers.

### F7: multi-napkin lifecycle (for concurrent operations + debounce)
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-1", "role": "test-arch", "name": "001-test-arch", "created_at": 1711700000000 }

30-napkins/0200-build/.napkin.nap.json          → { "status": "backlog" }
```
Two napkins — one with agents, one empty. Used for testing rapid changes across napkins and debounce behavior.

---

## Small tests — async migration (vitest)

Proves: async doesn't break testability. Tests stay fast, fakes stay simple.

### T-0150-01: all 0100 model tests pass after async migration
- **Flow**: run the existing T-0100-01 through T-0100-08 tests with `await` on `loadFromFilesystem`
- **Subsystems**: NapModel (now async), MemoryFileSystem (now async)
- **Expected**: all 8 tests pass unchanged (except adding `await`). Same assertions, same fixtures, same results.
- **Breaks if**: async migration changes return types or ordering of results
- **Size**: small
- **Verification**: existing model.test.ts passes after adding `async/await`. This is not a new test file — it's the existing tests modified to handle promises. If any fail, the async migration broke something.

### T-0150-02: loadFromFilesystem returns a Promise
- **Flow**: call `model.loadFromFilesystem(nepicDir)` → verify it returns a Promise
- **Subsystems**: NapModel
- **Expected**: return value is a Promise. Calling without `await` doesn't populate state (state populated only after promise resolves).
- **Breaks if**: model still synchronous, or promise resolves before return
- **Size**: small
- **Verification**:
  ```
  const result = model.loadFromFilesystem(NEPIC_DIR)
  expect(result).toBeInstanceOf(Promise)
  // state not yet populated
  expect(model.getNapkins()).toEqual([])
  await result
  expect(model.getNapkins()).toHaveLength(1)
  ```

### T-0150-03: MemoryFileSystem async methods return resolved promises
- **Flow**: call readdir, readJSON, isDirectory on MemoryFileSystem → verify they return Promises that resolve to the same values as 0100's sync version
- **Subsystems**: MemoryFileSystem
- **Expected**: all methods return Promises. Values match what 0100's sync version returned.
- **Breaks if**: MemoryFileSystem doesn't implement the new async interface
- **Size**: small
- **Verification**:
  ```
  const fs = createMinimalFixture()
  expect(fs.readdir(napkinsDir)).toBeInstanceOf(Promise)
  const dirs = await fs.readdir(napkinsDir)
  expect(dirs).toContain('0100-explore')
  ```

---

## Small tests — filesystem watching (vitest)

Proves: watcher integration is testable with fakes. Debounce works.

### T-0150-10: watch callback fires on simulateChange
- **Flow**: `fs.watch(dir, callback)` → `fs.simulateChange(path)` → callback fires
- **Subsystems**: MemoryFileSystem watch + simulateChange
- **Expected**: callback receives the event type and filename of the simulated change
- **Breaks if**: watch registration doesn't store callback, or simulateChange doesn't dispatch
- **Size**: small
- **Verification**:
  ```
  const spy = vi.fn()
  fs.watch(napkinsDir, spy)
  fs.simulateChange(napkinsDir + '/0100-explore/.napkin.nap.json')
  expect(spy).toHaveBeenCalledWith('change', '0100-explore/.napkin.nap.json')
  ```

### T-0150-11: watch unsubscribe stops callbacks
- **Flow**: `const unsub = fs.watch(dir, callback)` → `unsub()` → `fs.simulateChange(path)` → callback does NOT fire
- **Subsystems**: MemoryFileSystem watch lifecycle
- **Expected**: after unsubscribe, simulateChange no longer reaches the callback
- **Breaks if**: unsubscribe returns wrong function or watch map not cleaned
- **Size**: small
- **Verification**:
  ```
  const spy = vi.fn()
  const unsub = fs.watch(dir, spy)
  unsub()
  fs.simulateChange(path)
  expect(spy).not.toHaveBeenCalled()
  ```

### T-0150-12: debounce — rapid changes produce single model update
- **Flow**: model.startWatching() → fire 10 simulateChange events within 50ms → wait for debounce (200ms) → model fires onChange once
- **Subsystems**: NapModel watch + debounce logic
- **Expected**: onChange fires exactly once after debounce settles, not 10 times
- **Breaks if**: no debounce, or debounce timer resets incorrectly
- **Size**: small
- **Verification**: use `vi.useFakeTimers()`:
  ```
  vi.useFakeTimers()
  const changeSpy = vi.fn()
  model.onChange(changeSpy)
  await model.loadFromFilesystem(NEPIC_DIR)
  changeSpy.mockClear()  // clear the load notification

  model.startWatching(NEPIC_DIR)
  for (let i = 0; i < 10; i++) {
    fs.simulateChange(markerPath)
  }

  await vi.advanceTimersByTimeAsync(200)
  expect(changeSpy).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
  ```

### T-0150-13: watch detects marker file change → model re-reads → onChange fires
- **Flow**: model loads → external change to `.napkin.nap.json` (status doing → done) via `fs.simulateChange` → model re-reads → onChange fires with updated state
- **Subsystems**: NapModel watch → re-read → notify
- **Expected**: after the watch event processes (debounce settles), `model.getNapkins()[0].status` reflects the new value
- **Breaks if**: model doesn't re-read on watch, or re-read doesn't update internal state
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)
  expect(model.getNapkins()[0].status).toBe('doing')

  // External process changes the marker
  fs.updateFile(markerPath, { status: 'done' })
  fs.simulateChange(markerPath)
  await vi.advanceTimersByTimeAsync(200)

  expect(model.getNapkins()[0].status).toBe('done')
  ```

### T-0150-14: watch detects new agent dir → model shows new agent
- **Flow**: model loads (1 agent) → external process creates agent dir + marker → `fs.simulateChange` → debounce → model re-reads → shows 2 agents
- **Subsystems**: NapModel watch for new entries
- **Expected**: after watch event, `getNapkins()[0].agents` has 2 entries
- **Breaks if**: model only re-reads changed files, not re-scans the directory
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  expect(model.getNapkins()[0].agents).toHaveLength(1)

  // External process creates a new agent
  fs.addFile(agentMarkerPath, { role: 'fs-eng', name: '002-fs-eng', created_at: Date.now() })
  fs.simulateChange(agentsDir)
  await vi.advanceTimersByTimeAsync(200)

  expect(model.getNapkins()[0].agents).toHaveLength(2)
  ```

---

## Small tests — write-back (vitest)

Proves: model writes markers. FakeFileSystem records writes, tests assert on them.

### T-0150-20: createAgent writes .agent.nap.json
- **Flow**: `await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' })` → check MemoryFileSystem for written file
- **Subsystems**: NapModel write-back, MemoryFileSystem writeJSON
- **Expected**: MemoryFileSystem contains `.agent.nap.json` at the correct path with the agent data. Model state updated — getNapkins shows the new agent.
- **Breaks if**: writeJSON not called, or path constructed wrong, or model state not updated after write
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' })

  // Assert on filesystem
  const written = await fs.readJSON('nepic/30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json')
  expect(written).toMatchObject({ name: '002-fs-eng', role: 'fs-eng' })

  // Assert on model state
  const agents = model.getNapkins()[0].agents
  expect(agents).toHaveLength(2)
  expect(agents.find(a => a.name === '002-fs-eng')).toBeDefined()
  ```

### T-0150-21: setAgentExited updates marker with exited: true
- **Flow**: load → `await model.setAgentExited('0100-explore', '001-test-arch')` → check marker + model
- **Subsystems**: NapModel write-back
- **Expected**: marker file updated with `exited: true`. Model state shows agent with `exited: true`.
- **Breaks if**: writes new file instead of updating existing, or doesn't preserve other fields
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.setAgentExited('0100-explore', '001-test-arch')

  const marker = await fs.readJSON(agentMarkerPath)
  expect(marker.exited).toBe(true)
  expect(marker.cc_session_uuid).toBe('uuid-ta')  // preserved

  expect(model.getNapkins()[0].agents[0].exited).toBe(true)
  ```

### T-0150-22: setNapkinStatus writes .napkin.nap.json
- **Flow**: load → `await model.setNapkinStatus('0100-explore', 'review')` → check marker + model
- **Subsystems**: NapModel write-back
- **Expected**: `.napkin.nap.json` updated with `status: 'review'`. Model state reflects new status.
- **Breaks if**: writes to wrong path, or model state not updated
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.setNapkinStatus('0100-explore', 'review')

  const marker = await fs.readJSON(napkinMarkerPath)
  expect(marker.status).toBe('review')

  expect(model.getNapkins()[0].status).toBe('review')
  ```

### T-0150-23: saveUiState writes ui-state.json
- **Flow**: `await model.saveUiState({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' })` → check filesystem
- **Subsystems**: NapModel write-back
- **Expected**: `ui-state.json` written to the correct path with the UI state data
- **Breaks if**: path wrong, or data not serialized correctly
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.saveUiState({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' })

  const written = await fs.readJSON('nepic/ui-state.json')
  expect(written).toMatchObject({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' })
  ```

### T-0150-24: createAgent fires onChange
- **Flow**: load → subscribe onChange → createAgent → listener fires
- **Subsystems**: NapModel change notifications on write
- **Expected**: onChange listener called after createAgent completes
- **Breaks if**: write-back doesn't trigger onChange, or fires before state is updated
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  const spy = vi.fn()
  model.onChange(spy)

  await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' })
  expect(spy).toHaveBeenCalled()
  ```

---

## Small tests — write-then-watch loop prevention (vitest)

Proves: model writes marker → watcher fires → model ignores its own write. External writes are still processed.

### T-0150-30: model write → watch fires → model does NOT re-process its own write
- **Flow**: load + startWatching → createAgent (model writes marker, MemoryFileSystem triggers watch callback) → model ignores the echo → onChange fires exactly once (from the write, not from the watch)
- **Subsystems**: NapModel pending-write tracking + watch filtering
- **Expected**: onChange fires once for the createAgent call. The watch callback fires (MemoryFileSystem simulates it), but model's pending-write filter suppresses re-processing. Model state has the new agent exactly once.
- **Breaks if**: no pending-write tracking → onChange fires twice, or agent appears twice, or model re-reads stale state overwriting the write
- **Size**: small
- **Verification**:
  ```
  vi.useFakeTimers()
  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)

  const spy = vi.fn()
  model.onChange(spy)

  await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' })
  await vi.advanceTimersByTimeAsync(200)  // let debounce settle

  // onChange from createAgent: 1 call. Watch echo: suppressed.
  expect(spy).toHaveBeenCalledTimes(1)
  expect(model.getNapkins()[0].agents).toHaveLength(2)
  vi.useRealTimers()
  ```

### T-0150-31: external write → watch fires → model DOES re-process
- **Flow**: load + startWatching → external process writes marker (via fs.updateFile + fs.simulateChange, NOT via model methods) → debounce → model re-reads → onChange fires
- **Subsystems**: NapModel watch processing (non-suppressed path)
- **Expected**: model detects the external change and updates its state
- **Breaks if**: pending-write filter is too aggressive and suppresses ALL watch events
- **Size**: small
- **Verification**:
  ```
  vi.useFakeTimers()
  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)
  const spy = vi.fn()
  model.onChange(spy)

  // External process changes status (not through model)
  fs.updateFile(napkinMarkerPath, { status: 'done' })
  fs.simulateChange(napkinMarkerPath)
  await vi.advanceTimersByTimeAsync(200)

  expect(spy).toHaveBeenCalled()
  expect(model.getNapkins()[0].status).toBe('done')
  vi.useRealTimers()
  ```

### T-0150-32: pending-write ignore window clears after debounce
- **Flow**: model writes marker → wait for debounce to settle → external process writes same path → model DOES process it
- **Subsystems**: NapModel pending-write expiry
- **Expected**: after debounce window passes, the same path is no longer suppressed
- **Breaks if**: pending-write set never clears, permanently suppressing a path
- **Size**: small
- **Verification**:
  ```
  vi.useFakeTimers()
  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)

  await model.setNapkinStatus('0100-explore', 'review')
  await vi.advanceTimersByTimeAsync(200)  // debounce settles, pending-write clears

  const spy = vi.fn()
  model.onChange(spy)

  // Now an external write to the same path
  fs.updateFile(napkinMarkerPath, { status: 'done' })
  fs.simulateChange(napkinMarkerPath)
  await vi.advanceTimersByTimeAsync(200)

  expect(spy).toHaveBeenCalled()
  expect(model.getNapkins()[0].status).toBe('done')
  vi.useRealTimers()
  ```

---

## Small tests — lifecycle journey tests (vitest, model + fakes)

The core of 0150. Proves the full lifecycle works on the model with fakes.

### T-0150-40: journey — load → create agent → marker written → model shows new agent
- **Flow**: model loads F6 → `model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng', cc_session_uuid: 'uuid-new' })` → verify marker on filesystem AND model state AND bridge snapshot
- **Subsystems**: full stack (model + MemoryFileSystem + FakeBridge)
- **Expected**: marker file written. Model shows 2 agents on the napkin. Bridge delivers snapshot with the new agent to renderer.
- **Breaks if**: any seam in write → state update → notification → bridge push fails
- **Size**: small
- **Verification**:
  ```
  let snapshot = null
  bridge.onSnapshot(s => snapshot = s)

  await model.loadFromFilesystem(NEPIC_DIR)
  await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng', cc_session_uuid: 'uuid-new' })

  // Filesystem
  const marker = await fs.readJSON(agentPath)
  expect(marker).toMatchObject({ name: '002-fs-eng', role: 'fs-eng' })

  // Model
  expect(model.getNapkins()[0].agents).toHaveLength(2)

  // Bridge → renderer
  expect(snapshot.napkins[0].agents).toHaveLength(2)
  expect(snapshot.napkins[0].agents.find(a => a.name === '002-fs-eng')).toBeDefined()
  ```

### T-0150-41: journey — load → agent exits → marker updated → model shows exited flag
- **Flow**: model loads F6 → `model.setAgentExited('0100-explore', '001-test-arch')` → verify marker + model + bridge
- **Subsystems**: full stack
- **Expected**: marker updated with `exited: true`. Model shows agent with exited flag. Bridge snapshot reflects it.
- **Breaks if**: exited flag not persisted, or bridge doesn't push updated snapshot
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.setAgentExited('0100-explore', '001-test-arch')

  expect(model.getNapkins()[0].agents[0].exited).toBe(true)
  expect(snapshot.napkins[0].agents[0].exited).toBe(true)

  const marker = await fs.readJSON(agentMarkerPath)
  expect(marker.exited).toBe(true)
  ```

### T-0150-42: journey — load → status change → marker updated → model reflects new status
- **Flow**: model loads F6 (status 'doing') → `model.setNapkinStatus('0100-explore', 'review')` → verify marker + model + bridge
- **Subsystems**: full stack
- **Expected**: marker shows 'review'. Model shows 'review'. Bridge snapshot shows 'review'.
- **Breaks if**: status not persisted, or model/bridge out of sync
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await model.setNapkinStatus('0100-explore', 'review')

  expect(model.getNapkins()[0].status).toBe('review')
  expect(snapshot.napkins[0].status).toBe('review')
  ```

### T-0150-43: journey — full cycle: load → create agent → save UI state → reload → same state
- **Flow**: model 1 loads F6 → creates agent → saves UI state → model 1 discarded → model 2 loads from same MemoryFileSystem → same persistent state
- **Subsystems**: NapModel lifecycle, MemoryFileSystem as persistent layer
- **Expected**: model 2 shows the agent created by model 1. UI state retrievable. Ephemeral state (which model instance, any in-memory flags) is gone — persistent state preserved.
- **Breaks if**: writes don't persist in MemoryFileSystem, or reload doesn't read newly written markers
- **Size**: small
- **Verification**:
  ```
  // Phase 1: populate
  const model1 = createModel(fs)
  await model1.loadFromFilesystem(NEPIC_DIR)
  await model1.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng', cc_session_uuid: 'uuid-new' })
  await model1.setNapkinStatus('0100-explore', 'review')
  await model1.saveUiState({ activeNepicId: 'nepic-01', activeTerminalId: 'uuid-ta' })

  // Phase 2: reload (new model instance, same filesystem)
  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)

  // Persistent state preserved
  expect(model2.getNapkins()[0].agents).toHaveLength(2)
  expect(model2.getNapkins()[0].agents.find(a => a.name === '002-fs-eng')).toBeDefined()
  expect(model2.getNapkins()[0].status).toBe('review')

  // UI state retrievable
  const uiState = await fs.readJSON('nepic/ui-state.json')
  expect(uiState).toMatchObject({ activeNepicId: 'nepic-01' })
  ```

### T-0150-44: journey — external change → watcher → model updates → bridge pushes
- **Flow**: model loads + starts watching → external process modifies a marker file → watcher fires → model re-reads → onChange → bridge pushes new snapshot
- **Subsystems**: full stack including watch path
- **Expected**: bridge delivers updated snapshot with the external change reflected
- **Breaks if**: watcher events don't flow through to bridge, or bridge not wired to model.onChange
- **Size**: small
- **Verification**:
  ```
  vi.useFakeTimers()
  let latestSnapshot = null
  bridge.onSnapshot(s => latestSnapshot = s)

  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)

  // External change
  fs.updateFile(napkinMarkerPath, { status: 'done' })
  fs.simulateChange(napkinMarkerPath)
  await vi.advanceTimersByTimeAsync(200)

  expect(latestSnapshot.napkins[0].status).toBe('done')
  vi.useRealTimers()
  ```

### T-0150-45: journey — write-then-watch full chain, no feedback loop
- **Flow**: model loads + starts watching → model.createAgent (writes marker, MemoryFileSystem triggers watch) → model ignores echo → model state correct, bridge receives exactly one update for the create
- **Subsystems**: full stack including write-then-watch suppression
- **Expected**: bridge receives one snapshot update for the createAgent. No duplicate. No feedback loop.
- **Breaks if**: write-then-watch not suppressed → double notification, or state corruption from re-read during write
- **Size**: small
- **Verification**:
  ```
  vi.useFakeTimers()
  await model.loadFromFilesystem(NEPIC_DIR)
  model.startWatching(NEPIC_DIR)

  const snapshots: AppSnapshot[] = []
  bridge.onSnapshot(s => snapshots.push(structuredClone(s)))

  await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng' })
  await vi.advanceTimersByTimeAsync(200)

  // Exactly one snapshot from the write, zero from the watch echo
  expect(snapshots).toHaveLength(1)
  expect(snapshots[0].napkins[0].agents).toHaveLength(2)
  vi.useRealTimers()
  ```

---

## Medium tests — equivalence with small tests (Playwright + real Electron)

For each key journey above, the medium test runs the same scenario through real Electron with real filesystem and real IPC. Both assert the same outcomes. This proves the fake-based approach is trustworthy.

Medium tests use: real tmpDir with marker files, `launchApp` with `NAP_CWD`, assertions via `page.evaluate(() => window.__napStore__.getState())`.

### T-0150-60: create agent → marker on real disk → renderer shows new agent
- **Flow**: write F6 fixture to tmpDir → launch app → wait for store populated → trigger createAgent via `app.evaluate` (call model method in main process) → wait for renderer store to reflect 2 agents
- **Subsystems**: real Electron, real fs, real IPC, real zustand store
- **Expected**: renderer store shows 2 agents on the napkin. Real `.agent.nap.json` file exists on disk.
- **Breaks if**: model write doesn't hit real fs, or IPC doesn't push updated snapshot, or renderer store doesn't receive it
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0150-40
  // Setup: F6 fixture on real disk, launch app

  // Trigger createAgent in main process
  await app.evaluate(async ({ ipcMain }) => {
    // Access model through the app's wiring (exposed for tests)
    const model = global.__napModel__
    await model.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng', cc_session_uuid: 'uuid-new' })
  })

  // Assert on renderer store
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.length === 2
  })

  const state = await page.evaluate(() => {
    const s = window.__napStore__.getState()
    return { agentCount: s.napkins[0].agents.length, names: s.napkins[0].agents.map(a => a.name) }
  })
  expect(state.agentCount).toBe(2)
  expect(state.names).toContain('002-fs-eng')

  // Verify real file on disk
  const markerPath = path.join(nepicDir, '30-napkins/0100-explore/agents/002-fs-eng/.agent.nap.json')
  expect(fs.existsSync(markerPath)).toBe(true)
  ```

### T-0150-61: agent exits → renderer shows exited state
- **Flow**: F6 fixture on disk → launch → trigger setAgentExited in main → renderer shows exited flag
- **Subsystems**: real Electron, real fs, real IPC
- **Expected**: renderer store shows agent with `exited: true`. Marker file on disk has `exited: true`.
- **Breaks if**: exited flag not persisted to real fs, or not pushed through IPC
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0150-41
  await app.evaluate(async () => {
    await global.__napModel__.setAgentExited('0100-explore', '001-test-arch')
  })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.[0]?.exited === true
  })

  const state = await page.evaluate(() => window.__napStore__.getState())
  expect(state.napkins[0].agents[0].exited).toBe(true)
  ```

### T-0150-62: status change → renderer reflects new status
- **Flow**: F6 fixture → launch → trigger setNapkinStatus in main → renderer shows new status
- **Subsystems**: real Electron, real fs, real IPC
- **Expected**: renderer store shows `status: 'review'`. Marker file on disk has `status: 'review'`.
- **Breaks if**: status not persisted, or IPC snapshot not updated
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0150-42
  await app.evaluate(async () => {
    await global.__napModel__.setNapkinStatus('0100-explore', 'review')
  })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.status === 'review'
  })

  const state = await page.evaluate(() => window.__napStore__.getState())
  expect(state.napkins[0].status).toBe('review')
  ```

### T-0150-63: load → quit → reopen → renderer shows same state
- **Flow**: F6 fixture → launch → createAgent + setNapkinStatus → quit app → relaunch from same tmpDir → renderer shows same persistent state
- **Subsystems**: real Electron lifecycle, real fs persistence, real s→r→s→r cycle
- **Expected**: after relaunch, renderer store has 2 agents and status 'review' — same as before quit. This is the r→s→r round-trip.
- **Breaks if**: marker files not written before quit, or reload doesn't read them, or quit corrupts state
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0150-43
  // Phase 1: mutate state
  await app.evaluate(async () => {
    await global.__napModel__.createAgent('0100-explore', { name: '002-fs-eng', role: 'fs-eng', cc_session_uuid: 'uuid-new' })
    await global.__napModel__.setNapkinStatus('0100-explore', 'review')
  })

  // Wait for writes to propagate
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.length === 2 && s?.napkins?.[0]?.status === 'review'
  })

  // Phase 2: quit
  await app.evaluate(({ app }) => app.quit())
  await app.close()

  // Phase 3: relaunch from same tmpDir
  app = await launchApp(tmpDir)
  page = await app.firstWindow()

  // Phase 4: verify persistent state survived
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.length === 2
  })

  const state = await page.evaluate(() => {
    const s = window.__napStore__.getState()
    return {
      agentCount: s.napkins[0].agents.length,
      status: s.napkins[0].status,
      hasNewAgent: s.napkins[0].agents.some(a => a.name === '002-fs-eng'),
    }
  })
  expect(state.agentCount).toBe(2)
  expect(state.status).toBe('review')
  expect(state.hasNewAgent).toBe(true)
  ```

---

## Equivalence map

| Journey | Small test | Medium test | Shared assertion |
|---------|-----------|-------------|------------------|
| Create agent | T-0150-40 | T-0150-60 | 2 agents on napkin, new agent name present |
| Agent exits | T-0150-41 | T-0150-61 | agent.exited === true |
| Status change | T-0150-42 | T-0150-62 | napkin.status === 'review' |
| Full cycle (load→mutate→save→reload) | T-0150-43 | T-0150-63 | 2 agents, status 'review' after reload |

This establishes the testing pattern: business logic tested with small tests (fast, many), IPC seam verified with medium tests (few, targeted). Future napkins focus on small tests; only add medium when testing a new process boundary.

---

## What's NOT tested here (and why)

- **Real ptys** — model has the interface, we use fakes. Real pty testing is 0300.
- **CLI integration** — 0300.
- **UI changes** — 0100's sidebar is sufficient. 0400.
- **Real fs.watch behavior** — medium tests verify the real Electron flow but don't exercise macOS fs.watch edge cases (those are framework-level, not our code). The small tests prove our debounce/suppression logic works via MemoryFileSystem.simulateChange.
- **Concurrent model instances** — single model per app. Not a concern.
- **Network/remote filesystem** — desktop app, local fs only.

---

## Test infrastructure the fs-eng must build

These test cases depend on extensions to the 0100 infrastructure:

1. **MemoryFileSystem v2** — extends 0100's with:
   - All methods return Promises (readdir, readJSON, isDirectory)
   - `writeJSON(path, data)` — updates internal store, triggers active watch callbacks
   - `watch(dir, callback)` → unsubscribe function
   - `simulateChange(path)` — manually triggers watch callbacks (for external-change tests)
   - `updateFile(path, data)` — updates internal store WITHOUT triggering watch (used to set up state before simulateChange)
   - `addFile(path, data)` — adds a new file to internal store

2. **Model v2** — extends 0100's with:
   - `loadFromFilesystem` returns Promise
   - `startWatching(nepicDir)` — registers watch on marker file directories
   - `stopWatching()` — unsubscribes all watches
   - `createAgent(napkinSlug, agentData)` → Promise — writes marker, updates state, notifies
   - `setAgentExited(napkinSlug, agentName)` → Promise — updates marker, updates state, notifies
   - `setNapkinStatus(slug, status)` → Promise — writes marker, updates state, notifies
   - `saveUiState(state)` → Promise — writes ui-state.json
   - Pending-write tracking — ignores watch events for paths it just wrote
   - Debounce on watch events (200ms)

3. **Main process test hook** — `global.__napModel__` exposed when `NAP_TEST=1` for medium test access to the model from `app.evaluate`

4. **Fixture factories** — `createLifecycleFixture()` (F6) and `createMultiNapkinLifecycleFixture()` (F7), plus real-disk versions for medium tests
