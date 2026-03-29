# 0100 — model layer: test cases

Hypothesis under test: **a model with injectable filesystem + typed bridge = testable architecture where full journeys run in vitest with fakes, no Electron, in milliseconds.**

---

## Fixtures

All small tests use `MemoryFileSystem` — a plain object mapping paths to JSON content. The fixture IS the test setup.

### F1: minimal project
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-ta", "role": "test-arch", "name": "001-test-arch", "created_at": 1711700000000 }
20-architects/001-architect/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect", "created_at": 1711600000000 }
```

### F2: rich project (3 napkins × mixed agents + statuses)
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "done" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-1", "role": "test-arch", "name": "001-test-arch", "created_at": 1711700000000 }
30-napkins/0100-explore/agents/002-fs-eng/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-2", "role": "fs-eng", "name": "002-fs-eng", "created_at": 1711700100000 }

30-napkins/0200-build/.napkin.nap.json          → { "status": "doing" }
30-napkins/0200-build/agents/001-fs-eng/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-3", "role": "fs-eng", "name": "001-fs-eng", "created_at": 1711800000000 }

30-napkins/0300-polish/.napkin.nap.json         → { "status": "backlog" }
  (no agents dir)

20-architects/001-architect/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect", "created_at": 1711600000000 }
```

### F3: empty project (dirs exist, no markers)
```
30-napkins/0100-explore/                         (dir only, no .napkin.nap.json)
30-napkins/0100-explore/agents/001-test-arch/    (dir only, no .agent.nap.json)
20-architects/                                   (dir only, empty)
```

### F4: exited agent
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-exited", "role": "test-arch", "name": "001-test-arch", "created_at": 1711700000000, "exited": true }
```

### F5: no architects
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing" }
30-napkins/0100-explore/agents/001-fs-eng/
  .agent.nap.json                               → { "cc_session_uuid": "uuid-1", "role": "fs-eng", "name": "001-fs-eng", "created_at": 1711700000000 }
```

---

## Small tests — model (vitest, MemoryFileSystem)

### T-0100-01: model loads minimal project correctly
- **Flow**: loadFromFilesystem → getNapkins + getArchitects
- **Subsystems**: NapModel, FileSystemReader (memory)
- **Expected**: getNapkins returns 1 napkin (slug "0100-explore", status "doing", 1 agent). getArchitects returns 1 architect (name "001-architect", uuid "uuid-arch").
- **Breaks if**: dir walking misses nested agents/ path, or JSON parsing drops fields
- **Size**: small
- **Verification**: `expect(model.getNapkins()).toEqual([...])` — exact shape match on NapkinState[] and AgentState[]

### T-0100-02: model loads rich project — multiple napkins, mixed statuses, multiple agents
- **Flow**: loadFromFilesystem on F2 → getNapkins
- **Subsystems**: NapModel, FileSystemReader (memory)
- **Expected**: 3 napkins returned. 0100-explore: status "done", 2 agents. 0200-build: status "doing", 1 agent. 0300-polish: status "backlog", 0 agents (no agents dir). Agents sorted by createdAt within each napkin.
- **Breaks if**: napkins without agents/ subdir cause crash, or agent count is wrong when multiple exist
- **Size**: small
- **Verification**: assert napkin count, per-napkin agent count, status values, agent ordering by createdAt

### T-0100-03: model handles missing marker files — dirs exist, no JSON
- **Flow**: loadFromFilesystem on F3 → getNapkins + getArchitects
- **Subsystems**: NapModel, FileSystemReader (memory)
- **Expected**: napkin "0100-explore" exists with default status (e.g. "backlog" or whatever the spec says for missing markers). Agent dir exists but no .agent.nap.json → agent appears with defaults (no uuid, no role). getArchitects returns empty array (20-architects/ empty).
- **Breaks if**: readJSON returning null causes crash instead of defaults, or empty dirs are silently skipped
- **Size**: small
- **Verification**: assert napkin exists with default status, agent exists with undefined/null fields, architects array is empty

### T-0100-04: model handles exited agent
- **Flow**: loadFromFilesystem on F4 → getNapkins
- **Subsystems**: NapModel, FileSystemReader (memory)
- **Expected**: napkin has 1 agent with `exited: true`. UUID present but agent marked as exited.
- **Breaks if**: `exited` field not parsed or not surfaced in AgentState
- **Size**: small
- **Verification**: `expect(napkins[0].agents[0].exited).toBe(true)` and `expect(napkins[0].agents[0].ccSessionUuid).toBe("uuid-exited")`

### T-0100-05: model with no architects
- **Flow**: loadFromFilesystem on F5 → getArchitects
- **Subsystems**: NapModel, FileSystemReader (memory)
- **Expected**: getArchitects returns empty array. getNapkins still returns napkins correctly.
- **Breaks if**: missing 20-architects/ dir or empty dir causes crash
- **Size**: small
- **Verification**: `expect(model.getArchitects()).toEqual([])` and `expect(model.getNapkins()).toHaveLength(1)`

### T-0100-06: model emits change notification on load
- **Flow**: register onChange → loadFromFilesystem → listener fires
- **Subsystems**: NapModel change events
- **Expected**: onChange listener called at least once after loadFromFilesystem completes
- **Breaks if**: load doesn't trigger change notification, or events fire before state is ready
- **Size**: small
- **Verification**: `const spy = vi.fn(); model.onChange(spy); model.loadFromFilesystem(...); expect(spy).toHaveBeenCalled()`

### T-0100-07: onChange unsubscribe works
- **Flow**: subscribe → unsubscribe → loadFromFilesystem → listener does NOT fire
- **Subsystems**: NapModel change events
- **Expected**: after unsubscribe, listener is not called on subsequent state changes
- **Breaks if**: unsubscribe returns wrong function or listener map not cleaned up
- **Size**: small
- **Verification**: `const unsub = model.onChange(spy); unsub(); model.loadFromFilesystem(...); expect(spy).not.toHaveBeenCalled()`

### T-0100-08: napkin slug derived from directory name
- **Flow**: loadFromFilesystem → getNapkins → check slug values
- **Subsystems**: NapModel, dir name parsing
- **Expected**: slug is the directory name itself (e.g. "0100-explore", not a parsed/modified version). This is the identity — it must match filesystem exactly.
- **Breaks if**: slug extraction strips prefix numbers or modifies the dir name
- **Size**: small
- **Verification**: `expect(napkins[0].slug).toBe("0100-explore")`

---

## Small tests — bridge (vitest, FakeBridge)

### T-0100-10: bridge delivers snapshot on model change
- **Flow**: model loads → onChange fires → bridge pushes AppSnapshot to renderer side
- **Subsystems**: NapModel, Bridge (FakeBridge — two EventEmitters)
- **Expected**: renderer-side listener receives AppSnapshot with correct napkins array and architects array matching model state
- **Breaks if**: bridge not wired to model.onChange, or snapshot shape doesn't match AppSnapshot type
- **Size**: small
- **Verification**: `fakeBridge.onSnapshot(snapshot => { expect(snapshot.napkins).toEqual(model.getNapkins()); expect(snapshot.architects).toEqual(model.getArchitects()); })`

### T-0100-11: bridge snapshot contains full state, not delta
- **Flow**: load F2 → bridge pushes snapshot → verify snapshot has ALL 3 napkins and the architect
- **Subsystems**: NapModel, Bridge
- **Expected**: single snapshot contains complete state — not an incremental diff
- **Breaks if**: bridge sends partial updates or only changed items
- **Size**: small
- **Verification**: assert snapshot.napkins.length === 3, snapshot.architects.length === 1

### T-0100-12: bridge round-trip — intent from renderer reaches main
- **Flow**: renderer sends setActiveTerminal intent → main-side handler receives it
- **Subsystems**: Bridge (both directions)
- **Expected**: intent arrives with correct type and id payload
- **Breaks if**: intent channel not wired, or intent type/payload mangled
- **Size**: small
- **Verification**: `fakeBridge.onIntent(intent => { expect(intent).toEqual({ type: 'setActiveTerminal', id: 'uuid-1' }) })`

### T-0100-13: bridge delivers snapshot to multiple listeners
- **Flow**: register 2 renderer-side listeners → model change → both receive snapshot
- **Subsystems**: Bridge fan-out
- **Expected**: both listeners called with identical snapshot
- **Breaks if**: EventEmitter only notifies first listener
- **Size**: small
- **Verification**: two spies, both called with same snapshot

---

## Small tests — journey: full round-trip in vitest

### T-0100-20: journey — model loads, bridge delivers, renderer store populated
- **Flow**: create model with MemoryFileSystem(F1) → wire to FakeBridge → simulate renderer store receiving snapshot → assert store state
- **Subsystems**: NapModel + Bridge + simulated zustand store
- **Expected**: store.napkins has 1 napkin with 1 agent, store.architects has 1 architect. This is the CORE HYPOTHESIS TEST — proving the full data path works without Electron.
- **Breaks if**: any seam between model→bridge→store fails
- **Size**: small
- **Verification**:
  ```
  store receives snapshot
  expect(store.napkins[0].slug).toBe("0100-explore")
  expect(store.napkins[0].agents[0].role).toBe("test-arch")
  expect(store.architects[0].name).toBe("001-architect")
  ```

### T-0100-21: journey — rich project state arrives at renderer correctly
- **Flow**: model loads F2 → bridge → renderer store → verify all 3 napkins with correct agents and statuses
- **Subsystems**: full stack (model + bridge + store)
- **Expected**: store has 3 napkins with correct agent counts (2, 1, 0), correct statuses ("done", "doing", "backlog"), 1 architect
- **Breaks if**: agent-to-napkin association lost in transit, or status values mangled
- **Size**: small
- **Verification**: assert on complete store shape — napkin count, per-napkin agent count, status values

### T-0100-22: journey — edge case project (missing markers + exited) arrives at renderer
- **Flow**: model loads a fixture combining F3 patterns (missing markers) with F4 (exited agent) → bridge → store
- **Subsystems**: full stack
- **Expected**: store has napkins with default statuses where markers are missing, exited agent has exited flag, nothing crashes
- **Breaks if**: defaults not applied before bridge serialization, or exited flag lost in snapshot
- **Size**: small
- **Verification**: assert napkins exist with defaults, exited flag preserved in store

---

## Medium tests — Playwright + real Electron

### T-0100-30: app boots and sidebar renders napkins from marker files
- **Flow**: create test fixture on real filesystem (tmpDir with nepic dirs + marker files) → launch Electron app pointing at fixture → sidebar shows napkin cards
- **Subsystems**: real Electron, real main.ts, real model, real IPC bridge, real renderer, real zustand store, real React components
- **Expected**: sidebar shows napkin card(s) with correct slug text. Agent dots visible under the napkin card (colored by role). Architect card pinned at top.
- **Breaks if**: model fails to load from real fs, IPC bridge not wired in main.ts, renderer not subscribed to bridge, React component not rendering from store
- **Size**: medium
- **Verification**:
  ```
  page.waitForFunction(() => {
    const store = window.__napStore__?.getState()
    return store?.napkins?.length > 0
  })
  // then verify:
  page.evaluate(() => {
    const s = window.__napStore__.getState()
    return { napkinCount: s.napkins.length, firstSlug: s.napkins[0]?.slug }
  })
  // expect napkinCount > 0, firstSlug matches fixture
  ```

### T-0100-31: bridge delivers real IPC — snapshot arrives at renderer store
- **Flow**: launch Electron → wait for app ready → read renderer store state
- **Subsystems**: real IPC (webContents.send / ipcRenderer.on), real zustand store
- **Expected**: renderer store has napkins populated from main-process model (not hardcoded, not empty)
- **Breaks if**: IPC channel name mismatch, preload script doesn't expose bridge, or store subscription not wired
- **Size**: medium
- **Verification**:
  ```
  const state = await page.evaluate(() => window.__napStore__.getState())
  expect(state.napkins.length).toBeGreaterThan(0)
  expect(state.architects.length).toBeGreaterThanOrEqual(0)
  ```
  This test is DIFFERENT from T-0100-30 because it focuses on the IPC seam specifically — the data path from main process through real Electron IPC to renderer. T-0100-30 also checks that the React component renders.

### T-0100-32: sidebar renders agent dots under napkin cards
- **Flow**: fixture with napkin that has 2 agents → launch → verify DOM shows 2 dot elements under that napkin card
- **Subsystems**: React rendering from store state
- **Expected**: napkin card in DOM contains agent status indicators (dots). Count matches fixture agent count.
- **Breaks if**: component doesn't iterate agents array, or agents not passed through from store
- **Size**: medium
- **Verification**:
  ```
  page.waitForFunction(() => document.querySelectorAll('[data-testid="agent-dot"]').length >= 2)
  // or:
  page.evaluate(() => {
    const s = window.__napStore__.getState()
    return s.napkins[0]?.agents?.length
  })
  // expect 2
  ```
  Prefer store assertion (programmatic) over DOM query. DOM query is backup if store doesn't expose enough.

---

## What's NOT tested here (and why)

- **Real ptys** — 0100 has no pty wiring. Model has a placeholder, not real node-pty.
- **Marker file writing** — 0100 is read-only. Writing is 0200.
- **CLI integration** — 0300.
- **Sidebar zoom levels / focused / extended views** — 0400.
- **SQLite** — 0100 uses no database. Model reads marker files directly.
- **Filesystem watcher** — 0100 loads once on startup. Live watching is a later concern.
- **Performance** — 120 marker files in milliseconds is trivially fast. Not worth a test case.

---

## Test infrastructure the fs-eng must build

These test cases depend on infrastructure that doesn't exist yet. The fs-eng builds these as part of the deliverable:

1. **MemoryFileSystem** — implements FileSystemReader. Constructor takes `Record<string, object | null>` (path → JSON content). `readdir` derives directory listings from keys. `readJSON` returns the object at path. `isDirectory` checks if any key starts with `path/`.

2. **FakeBridge** — two EventEmitters. `pushSnapshot(snapshot)` emits on renderer channel. `sendIntent(intent)` emits on main channel. Same interface as real IPC bridge.

3. **Fixture helpers** — `createMinimalFixture()`, `createRichFixture()`, etc. that return MemoryFileSystem instances pre-loaded with the fixtures defined above.

4. **Playwright fixture helper** — `createTestNepicDir(tmpDir, fixture)` that writes the fixture to real filesystem for medium tests.
