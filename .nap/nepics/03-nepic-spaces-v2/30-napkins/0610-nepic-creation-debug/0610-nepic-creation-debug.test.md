# 0610 — nepic creation debug: test cases

Tests designed to catch all 7 bugs + 2 fixes from manual testing, plus guard multi-nepic invariants going forward.

---

## Fixtures

### F16: multi-nepic with running agents
Two nepics. Old nepic has architect (started, running) + 1 napkin agent (started, running). New nepic created mid-session.
```
nepics/01-v1/20-architects/001-architect/.agent.nap.json
  { cc_session_uuid: "uuid-v1-arch", role: "architect", started: true, exited: false, done: false }
nepics/01-v1/20-architects/001-architect/prompt.md
  (template content)
nepics/01-v1/30-napkins/0100-explore/.napkin.nap.json
  { status: "doing" }
nepics/01-v1/30-napkins/0100-explore/agents/001-fs-eng/.agent.nap.json
  { cc_session_uuid: "uuid-v1-fs", role: "fs-eng", started: true, exited: false }
```

### F17: post-creation fixture (two nepics already exist)
Both nepics fully scaffolded on disk. Used for "switch back to old nepic" tests.
```
nepics/01-v1/  (same as above)
nepics/02-ttt/20-architects/001-architect/.agent.nap.json
  { cc_session_uuid: "uuid-v2-arch", role: "architect", started: false, exited: false }
nepics/02-ttt/20-architects/001-architect/prompt.md
  (template content)
nepics/02-ttt/30-napkins/.placeholder
nepics/ui-state.json
  { activeNepicId: "02-ttt" }
```

### F18: architect-only nepic (for architect resume tests)
Single nepic with architect in various lifecycle states.

---

## Part 1: Cross-nepic isolation (Bug 1)

> Bug 1: creating new nepic marks old architect as done

The core invariant: **creating a new nepic must NOT modify any existing nepic's marker files.**

### T-0610-01 — createNepic does not write to old architect marker
- **Flow**: load F16 (01-v1 active) → `model.createNepic('02-ttt', 'Test')` → read old architect marker from disk
- **Subsystems**: model.createNepic, filesystem
- **Expected**: old architect marker unchanged — `done` absent or `false`, `started: true`, no new fields added
- **Where it breaks**: if `createNepic` somehow triggers a state flush or watcher reload that overwrites the old agent
- **Size**: small
- **Verification**: `fs.readJSON('nepics/01-v1/20-architects/001-architect/.agent.nap.json')` — assert `done` is not `true`, all fields match original fixture

### T-0610-02 — createNepic + switchNepic does not corrupt old architect
- **Flow**: load F16 → mark old architect running → `createNepic('02-ttt', 'Test')` → `switchNepic('02-ttt')` → read old architect marker from disk
- **Subsystems**: model.createNepic, model.switchNepic, filesystem
- **Expected**: old architect marker file identical to what it was before creation
- **Where it breaks**: `switchNepic` → `loadFromFilesystem` could trigger debounced watcher that writes back stale state to old nepic
- **Size**: small
- **Verification**: snapshot old architect marker before creation, compare byte-for-byte after switchNepic

### T-0610-03 — switch back to old nepic after creation — architect state correct
- **Flow**: load F16 → mark agents running → `createNepic` → `switchNepic('02-ttt')` → `switchNepic('01-v1')` → check architect state
- **Subsystems**: model.switchNepic, model.loadFromFilesystem, ephemeral state sets
- **Expected**: old architect shows `started: true`, NOT `done: true`. `running` depends on whether pty is still alive.
- **Where it breaks**: ephemeral `doneAgents` set leaks across nepic switches — if it accidentally contains the old architect's ID, `loadFromFilesystem` applies `done: true`
- **Size**: small
- **Verification**: after switching back, `model.getArchitects()[0].done === false` and `model.getArchitects()[0].started === true`

### T-0610-04 — state matrix: all old agents unchanged after nepic creation
- **Flow**: load F16 → record all agent states (id, started, exited, done for each) → `createNepic` → `switchNepic` → `switchNepic` back → compare all states
- **Subsystems**: model (full round-trip)
- **Expected**: every agent's persisted flags identical before and after
- **Where it breaks**: any leaked ephemeral state or accidental marker writes
- **Size**: small
- **Verification**: for-each agent: assert started/exited/done match pre-creation values read from disk

---

## Part 2: Watcher ENOTDIR (Bug 2)

> Bug 2: watcher treats ui-state.json as a nepic directory

### T-0610-10 — getNepics excludes ui-state.json
- **Flow**: load F17 (has ui-state.json in nepics/ dir) → `model.getNepics()`
- **Subsystems**: model.loadFromFilesystem, getNepics filtering
- **Expected**: nepic list contains only actual directories, NOT `ui-state.json`
- **Where it breaks**: if the `d === 'ui-state.json'` filter is missing or wrong
- **Size**: small
- **Verification**: `model.getNepics().find(n => n.slug === 'ui-state.json') === undefined`

### T-0610-11 — getNepics excludes hidden files and non-directories
- **Flow**: add `.DS_Store`, `notes.txt` to nepics base dir → load → getNepics
- **Subsystems**: model.loadFromFilesystem
- **Expected**: only actual nepic directories returned
- **Where it breaks**: isDirectory check missing for certain entries
- **Size**: small
- **Verification**: every entry in `getNepics()` should have `fs.isDirectory(base + '/' + slug) === true`

### T-0610-12 — switchNepic to ui-state.json slug → graceful error or skip
- **Flow**: attempt `model.switchNepic('ui-state.json')` on F17
- **Subsystems**: model.switchNepic, startWatching
- **Expected**: either throws a meaningful error, or the watcher does not crash with ENOTDIR
- **Where it breaks**: `startWatching` tries to `fs.watch('ui-state.json/30-napkins')` → ENOTDIR
- **Size**: small (with NodeFileSystem → medium if testing real watcher behavior)
- **Verification**: no ENOTDIR exception thrown; or if error, it's caught and reported cleanly

### T-0610-13 — createNepic then switchNepic: watcher watches correct path
- **Flow**: load F16 → `createNepic('02-ttt', 'Test')` → `switchNepic('02-ttt')` → trigger simulated change in new nepic dir
- **Subsystems**: model.switchNepic, startWatching, filesystem watcher
- **Expected**: watcher fires for changes in `nepics/02-ttt/30-napkins/`, model reloads correctly
- **Where it breaks**: watcher path miscalculated after creation
- **Size**: small
- **Verification**: simulate change → advance debounce → model.onChange fires

---

## Part 3: Terminal activation after restart (Bug 3)

> Bug 3: clicking agents in old nepic shows blank terminal after close/reopen

### T-0610-20 — running agents have valid pty after startAgents
- **Flow**: load F16 → `startAgents(model, ptySpawner)` → check ptySpawner state
- **Subsystems**: coordinators, resume, pty-spawner
- **Expected**: every started + !exited agent has a pty spawned; ptySpawner.isRunning returns true
- **Where it breaks**: if architects are skipped or agent list is incomplete
- **Size**: small
- **Verification**: for each agent with `started && !exited`: `ptySpawner.isRunning(agent.id) === true`

### T-0610-21 — on-demand resume: click exited agent → pty:resume signal needed
- **Flow**: create scenario where agent is exited but terminal created on demand → renderer should call pty:resume
- **Subsystems**: Terminal.tsx logic (renderer), pty:resume IPC
- **Expected**: when activeTerminalId set to exited agent's ID, pty.resume is called
- **Where it breaks**: only pty:ready is sent, not pty:resume → pty never spawned → blank terminal
- **Size**: medium (requires renderer + IPC)
- **Verification**: in main.ts, pty:resume handler spawns pty with `--resume` flag; check ptySpawner.isRunning after

### T-0610-22 — restart: all Case A agents get ptys, clicking any shows terminal data
- **Flow**: load survivability fixture → startAgents → verify that for each running agent, pty data would be routable
- **Subsystems**: coordinators, node-pty-spawner (markReady + flush)
- **Expected**: agent ptys are spawned, markReady flushes buffered output, data handler called
- **Where it breaks**: pty spawned but terminal never sends pty:ready → data stays buffered forever
- **Size**: medium
- **Verification**: spawn + markReady → data handler receives at least one chunk

---

## Part 4: Previous nepic fully workable (Bug 4)

> Bug 4: switch back to old nepic → should see all agents, click them, see terminals

### T-0610-30 — switchNepic preserves nepic list
- **Flow**: load F17 → switchNepic('01-v1') → check getNepics
- **Subsystems**: model.switchNepic, model.getNepics
- **Expected**: nepic list still shows both nepics, active nepic changes
- **Where it breaks**: loadFromFilesystem overwrites nepicList incorrectly
- **Size**: small
- **Verification**: `model.getNepics().length >= 2`; all original slugs present

### T-0610-31 — switch away and back: model loads correct napkins and architects
- **Flow**: load F17 (01-v1 active) → switchNepic('02-ttt') → switchNepic('01-v1')
- **Subsystems**: model.switchNepic, model.loadFromFilesystem
- **Expected**: after switching back, napkins and architects match 01-v1's disk state
- **Where it breaks**: stale data from 02-ttt leaks into 01-v1's model state
- **Size**: small
- **Verification**: `model.getNapkins()` returns 01-v1's napkins; `model.getArchitects()` returns 01-v1's architect; `model.getActiveNepicId() === '01-v1'`

### T-0610-32 — bridge snapshot reflects correct nepic after switch
- **Flow**: wire model+bridge → load F17 → switchNepic → capture snapshot
- **Subsystems**: model, bridge, wireModelToBridge
- **Expected**: snapshot.activeNepicId matches, napkins are for the active nepic, nepics list is complete
- **Where it breaks**: bridge pushes snapshot with stale or mixed data
- **Size**: small
- **Verification**: snapshot.activeNepicId, snapshot.napkins[0].nepicId, snapshot.nepics all correct

### T-0610-33 — ptys from old nepic not killed on nepic switch
- **Flow**: load F16 → startAgents → switchNepic('02-ttt') → check ptySpawner.isRunning for old agents
- **Subsystems**: model.switchNepic, coordinators, pty-spawner
- **Expected**: old ptys still alive — switching nepics should NOT call ptySpawner.kill
- **Where it breaks**: switchNepic kills all ptys or clearExitHandlers
- **Size**: small
- **Verification**: `ptySpawner.isRunning('uuid-v1-arch') === true` after switch

---

## Part 5: Watcher coverage (Bug 5)

> Bug 5: watcher only watches 30-napkins/, not 20-architects/

### T-0610-40 — watcher picks up changes in 30-napkins/
- **Flow**: load + startWatching → simulate change to napkin marker → advance debounce
- **Subsystems**: model.startWatching, filesystem watcher
- **Expected**: model reloads, onChange fires
- **Where it breaks**: (this is the existing behavior — regression guard)
- **Size**: small
- **Verification**: model.onChange spy called after debounce

### T-0610-41 — watcher picks up changes in 20-architects/
- **Flow**: load + startWatching → simulate change to architect marker → advance debounce
- **Subsystems**: model.startWatching, filesystem watcher
- **Expected**: model reloads, architect state updated
- **Where it breaks**: startWatching only watches `30-napkins/`, ignoring `20-architects/`
- **Size**: small
- **Verification**: modify architect marker externally → simulateChange → advance 200ms → `model.getArchitects()` reflects new data

### T-0610-42 — watcher handles architect marker edit → agent state updates live
- **Flow**: load → startWatching → external edit of architect's `.agent.nap.json` (e.g. set `done: true`) → advance debounce → check model
- **Subsystems**: model, watcher, architect loading
- **Expected**: `model.getArchitects()[0].done === true` after reload
- **Where it breaks**: watcher only covers napkins dir; architect changes invisible until restart
- **Size**: small
- **Verification**: architect done flag reflects disk state after watcher-triggered reload

---

## Part 6: Architect auto-start (Bug 6)

> Bug 6: architect not auto-started on app open — same A/B/C rules should apply

### T-0610-50 — computeResumeActions includes architects (Case A)
- **Flow**: create fixture with architect `started: true, exited: false` → computeResumeActions
- **Subsystems**: resume.ts
- **Expected**: architect gets `action: 'resume'` with `--resume` command
- **Where it breaks**: if getAllAgents doesn't include architects, or resume logic filters them out
- **Size**: small
- **Verification**: decisions.find(d => d.agentId === archId).action === 'resume'

### T-0610-51 — computeResumeActions includes architects (Case C — fresh)
- **Flow**: create fixture with architect `started: false, exited: false` → computeResumeActions
- **Subsystems**: resume.ts
- **Expected**: architect gets `action: 'fresh'` with `--session-id` + prompt command
- **Where it breaks**: fresh case doesn't handle architects or prompt path is wrong
- **Size**: small
- **Verification**: decisions.find(d => d.agentId === archId).action === 'fresh'; command contains 'prompt.md'

### T-0610-52 — startAgents spawns pty for architect
- **Flow**: load F16 (architect started=true) → startAgents → check ptySpawner
- **Subsystems**: coordinators, pty-spawner
- **Expected**: architect's pty spawned, model marks it running
- **Where it breaks**: if startAgents skips architects or getAllAgents returns incomplete list
- **Size**: small
- **Verification**: `ptySpawner.isRunning('uuid-v1-arch') === true`; `model.getArchitects()[0].running === true`

### T-0610-53 — fresh architect on new nepic: Case C → prompt.md path correct
- **Flow**: createNepic → load new nepic → computeResumeActions for its architect
- **Subsystems**: model.createNepic, resume.ts
- **Expected**: fresh command includes correct homePath + prompt.md
- **Where it breaks**: if homePath for newly created architect is wrong or prompt.md doesn't exist
- **Size**: small
- **Verification**: command contains the new nepic's architect homePath + '/prompt.md'

---

## Part 7: New nepic missing prompt.md (Bug 7)

> Bug 7: createNepic scaffolds architect marker but NOT prompt.md

### T-0610-60 — createNepic scaffolds prompt.md for architect
- **Flow**: load → `model.createNepic('02-ttt', 'Test')` → check filesystem for prompt.md
- **Subsystems**: model.createNepic, filesystem
- **Expected**: `<newNepicDir>/20-architects/001-architect/prompt.md` exists on disk
- **Where it breaks**: createNepic only writes `.agent.nap.json`, not `prompt.md`
- **Size**: small
- **Verification**: `fs.readFile(result.architectDir + '/prompt.md') !== null`

### T-0610-61 — architect fresh start reads prompt.md successfully
- **Flow**: createNepic → load new nepic → startAgents → inspect spawn command
- **Subsystems**: model.createNepic, resume.ts, coordinators
- **Expected**: the `claude` command references a prompt.md that actually exists
- **Where it breaks**: command references nonexistent file → claude errors on boot
- **Size**: small
- **Verification**: extract homePath from command → `fs.readFile(homePath + '/prompt.md') !== null`

### T-0610-62 — prompt.md content is valid (not empty placeholder)
- **Flow**: createNepic → read prompt.md
- **Subsystems**: model.createNepic
- **Expected**: prompt.md contains meaningful template content (not empty, not null)
- **Where it breaks**: writeJSON writes null or empty string
- **Size**: small
- **Verification**: content is non-empty string, contains expected template markers

---

## Part 8: Display string fix — "acting" → "lead"

> Fix: rename "acting" → "lead" in Sidebar.tsx

### T-0610-70 — architect card shows "lead" when running (not "acting")
- **Flow**: render ArchitectCard with `running: true` → inspect label
- **Subsystems**: Sidebar.tsx (ArchitectCard component)
- **Expected**: label text is `lead` (was `acting`)
- **Where it breaks**: display string regression
- **Size**: manual (UI test — renderer component)
- **Verification**: snapshot or DOM query of architect label element; `textContent === 'lead'`

---

## Part 9: Debug panel overlay (improvement)

> Improvement: debug panel should overlay, not resize terminal

### T-0610-75 — debug panel toggle does not change terminal container width
- **Flow**: measure terminal container width → toggle debug panel → measure again
- **Subsystems**: DebugPanel.tsx, Terminal.tsx, CSS layout
- **Expected**: terminal container width unchanged; debug panel renders with absolute/fixed positioning
- **Where it breaks**: debug panel in normal flow → pushes terminal → resize events → jank
- **Size**: medium (requires real DOM measurement)
- **Verification**: `containerRef.current.getBoundingClientRect().width` identical before and after toggle

---

## Part 10: Multi-nepic invariant tests

These are the "what does a healthy multi-nepic app look like" tests — invariants that should ALWAYS hold.

### T-0610-80 — invariant: each nepic's agents have correct nepicId
- **Flow**: load multi-nepic fixture → for each nepic, switch to it → check all agents
- **Subsystems**: model.loadFromFilesystem, agent loading
- **Expected**: every agent's nepicId matches the active nepic's slug
- **Where it breaks**: agent marker has wrong nepic field, or loadFromFilesystem uses wrong default
- **Size**: small
- **Verification**: `model.getAllAgents().every(a => a.nepicId === model.getActiveNepicId())`

### T-0610-81 — invariant: ui-state.json always reflects active nepic
- **Flow**: create nepic → switch away → switch back → read ui-state.json
- **Subsystems**: model.switchNepic, filesystem
- **Expected**: `ui-state.json.activeNepicId` always matches `model.getActiveNepicId()`
- **Where it breaks**: switchNepic doesn't persist, or persists wrong value
- **Size**: small
- **Verification**: read `ui-state.json` from disk, compare with `model.getActiveNepicId()`

### T-0610-82 — invariant: nepic creation is atomic (all dirs + marker + prompt.md)
- **Flow**: createNepic → enumerate expected files
- **Subsystems**: model.createNepic
- **Expected**: all of these exist: `10-docs/`, `20-architects/001-architect/.agent.nap.json`, `20-architects/001-architect/prompt.md`, `30-napkins/`
- **Where it breaks**: partial scaffolding — some dirs created, others not
- **Size**: small
- **Verification**: `fs.isDirectory` + `fs.readJSON` + `fs.readFile` for each expected path

### T-0610-83 — invariant: concurrent nepic operations don't corrupt state
- **Flow**: `createNepic('02-a', 'A')` and `createNepic('03-b', 'B')` in rapid succession → check both
- **Subsystems**: model.createNepic, filesystem writes
- **Expected**: both nepics scaffolded correctly, no cross-contamination
- **Where it breaks**: hasPendingWrite flag shared across operations → watcher skips needed reloads
- **Size**: small
- **Verification**: both architect markers exist with correct nepic slugs

### T-0610-84 — invariant: done + exited is valid state after nepic switch
- **Flow**: agent calls done → agent exits → switch away → switch back → check state
- **Subsystems**: model ephemeral sets, loadFromFilesystem
- **Expected**: agent shows done=true (from disk), exited=true (from disk), running=false
- **Where it breaks**: loadFromFilesystem loses done or exited flag; ephemeral set has stale data
- **Size**: small
- **Verification**: all three flags correct after round-trip through nepic switch

---

## Test size summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 25    | T-0610-01 through T-0610-84 (most) |
| Medium | 3     | T-0610-21, T-0610-22, T-0610-75 |
| Manual | 1     | T-0610-70 |

## Priority order for implementation

1. **Bug 7** (T-0610-60–62) — architect can't boot without prompt.md, blocks all new nepics
2. **Bug 1** (T-0610-01–04) — cross-nepic corruption is data loss
3. **Bug 2** (T-0610-10–13) — watcher crash blocks app
4. **Bug 5** (T-0610-40–42) — architect changes invisible until restart
5. **Bug 6** (T-0610-50–53) — architect not auto-started
6. **Bug 3/4** (T-0610-20–22, T-0610-30–33) — cross-nepic pty management
7. **Improvement** (T-0610-75) — debug panel overlay is cosmetic
8. **Fix** (T-0610-70) — display string is trivial
