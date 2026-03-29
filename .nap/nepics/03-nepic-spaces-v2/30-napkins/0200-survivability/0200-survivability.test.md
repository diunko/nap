# 0200 — survivability: test cases

Hypothesis: **the model handles full entity shapes, computes resume decisions, and manages STOP→RUN / RUN→STOP transitions correctly — with NO marker mutations on quit. Small tests (model + fakes) and medium tests (real Electron + real ptys) produce equivalent results.**

---

## Fixtures

### F8: survivability fixture (three agent cases)
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing", "nepic": "test-nepic" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-ta", "role": "test-arch", "name": "001-test-arch",
    "napkin": "0100-explore", "nepic": "test-nepic",
    "parent": null, "parent_id": null,
    "created_at": 1711700000000, "started": true, "exited": false
  }
30-napkins/0100-explore/agents/002-fs-eng/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-fs", "role": "fs-eng", "name": "002-fs-eng",
    "napkin": "0100-explore", "nepic": "test-nepic",
    "parent": "001-test-arch", "parent_id": "uuid-ta",
    "created_at": 1711700100000, "started": true, "exited": true
  }
30-napkins/0200-build/.napkin.nap.json          → { "status": "backlog", "nepic": "test-nepic" }
30-napkins/0200-build/agents/001-fs-eng/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-fresh", "role": "fs-eng", "name": "001-fs-eng",
    "napkin": "0200-build", "nepic": "test-nepic",
    "parent": null, "parent_id": null,
    "created_at": 1711800000000, "started": false, "exited": false
  }
20-architects/001-architect/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect",
    "nepic": "test-nepic",
    "parent": null, "parent_id": null,
    "created_at": 1711600000000, "started": true, "exited": false
  }
```

Three cases exercised:
- **Case A** (resume): 001-test-arch (started, not exited), 001-architect (started, not exited)
- **Case B** (skip): 002-fs-eng (started, exited)
- **Case C** (fresh): 001-fs-eng in 0200-build (not started)

### F9: all-exited fixture
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "done", "nepic": "test-nepic" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-1", "role": "test-arch", "name": "001-test-arch",
    "napkin": "0100-explore", "nepic": "test-nepic",
    "created_at": 1711700000000, "started": true, "exited": true
  }
20-architects/001-architect/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect",
    "nepic": "test-nepic",
    "created_at": 1711600000000, "started": true, "exited": true
  }
```

All agents exited — no ptys should spawn on start.

---

## Small tests — full entity shapes (vitest)

Proves: model reads and exposes all fields from the 0200 spec. Bridge delivers full shapes to renderer.

### T-0200-01: AgentState has all spec fields
- **Flow**: load F8 → get agent from napkin → verify every field present and correct
- **Subsystems**: NapModel, MemoryFileSystem
- **Expected**: AgentState contains: id (=cc_session_uuid), name, role, nepicId, napkinId, parentName, parentId, createdAt, started, exited, running (false — no pty yet), done (false — ephemeral default), homePath
- **Breaks if**: model doesn't read new marker fields (parent, parent_id, started), or doesn't populate derived fields (nepicId, napkinId, homePath)
- **Size**: small
- **Verification**:
  ```
  const model = createModel(fs)
  await model.loadFromFilesystem(NEPIC_DIR)

  const agent = model.getNapkins()[0].agents[0]  // 001-test-arch
  expect(agent.id).toBe('uuid-ta')
  expect(agent.name).toBe('001-test-arch')
  expect(agent.role).toBe('test-arch')
  expect(agent.nepicId).toBe('test-nepic')
  expect(agent.napkinId).toBe('0100-explore')
  expect(agent.parentName).toBeNull()
  expect(agent.parentId).toBeNull()
  expect(agent.createdAt).toBe(1711700000000)
  expect(agent.started).toBe(true)
  expect(agent.exited).toBe(false)
  expect(agent.running).toBe(false)
  expect(agent.done).toBe(false)
  expect(agent.homePath).toContain('agents/001-test-arch')
  ```

### T-0200-02: AgentState parent fields populated from marker
- **Flow**: load F8 → get agent 002-fs-eng (has parent) → verify parent fields
- **Subsystems**: NapModel marker reading
- **Expected**: parentName = "001-test-arch", parentId = "uuid-ta"
- **Breaks if**: model doesn't read parent/parent_id from marker
- **Size**: small
- **Verification**:
  ```
  const agent = model.getNapkins()[0].agents[1]  // 002-fs-eng (sorted by createdAt)
  expect(agent.parentName).toBe('001-test-arch')
  expect(agent.parentId).toBe('uuid-ta')
  ```

### T-0200-03: NapkinState has full spec fields
- **Flow**: load F8 → get napkins → verify id, nepicId, path present
- **Subsystems**: NapModel
- **Expected**: NapkinState has id (=slug), slug, nepicId, status, path, agents[]
- **Breaks if**: model doesn't populate new NapkinState fields
- **Size**: small
- **Verification**:
  ```
  const napkin = model.getNapkins()[0]
  expect(napkin.id).toBe('0100-explore')
  expect(napkin.slug).toBe('0100-explore')
  expect(napkin.nepicId).toBe('test-nepic')
  expect(napkin.path).toContain('30-napkins/0100-explore')
  expect(napkin.agents).toHaveLength(2)
  ```

### T-0200-04: Bridge snapshot delivers full entity shapes
- **Flow**: load F8 with bridge wired → snapshot contains all new fields
- **Subsystems**: NapModel + FakeBridge
- **Expected**: snapshot has full AgentState and NapkinState shapes, including new fields
- **Breaks if**: bridge truncates or transforms fields during push
- **Size**: small
- **Verification**:
  ```
  let snapshot: AppSnapshot | null = null
  bridge.onSnapshot(s => snapshot = s)
  await model.loadFromFilesystem(NEPIC_DIR)

  expect(snapshot.napkins[0].nepicId).toBe('test-nepic')
  expect(snapshot.napkins[0].agents[0].id).toBe('uuid-ta')
  expect(snapshot.napkins[0].agents[0].started).toBe(true)
  expect(snapshot.napkins[0].agents[0].running).toBe(false)
  expect(snapshot.architects[0].id).toBe('uuid-arch')
  expect(snapshot.architects[0].started).toBe(true)
  ```

---

## Small tests — STOP→RUN resume decisions (vitest)

Proves: correct classification of agents into Case A (resume), B (skip), C (fresh). Resume decisions are a pure function of agent state — test them as such.

### T-0200-10: Case A — started + not exited → resume
- **Flow**: load F8 → compute resume decisions → 001-test-arch yields "resume" with `--resume` command
- **Subsystems**: resume decision logic
- **Expected**: agent with started=true, exited=false produces action "resume" containing `--resume uuid-ta`
- **Breaks if**: resume logic doesn't check started flag
- **Size**: small
- **Verification**:
  ```
  const decisions = computeResumeActions(model.getAllAgents())
  const ta = decisions.find(d => d.agentId === 'uuid-ta')
  expect(ta.action).toBe('resume')
  expect(ta.command).toContain('--resume uuid-ta')
  ```

### T-0200-11: Case B — exited → skip
- **Flow**: load F8 → 002-fs-eng (exited) yields "skip"
- **Subsystems**: resume decision logic
- **Expected**: exited agent produces action "skip" with no command
- **Breaks if**: exited check missing — agent resumed despite being dead
- **Size**: small
- **Verification**:
  ```
  const fsEng = decisions.find(d => d.agentId === 'uuid-fs')
  expect(fsEng.action).toBe('skip')
  ```

### T-0200-12: Case C — not started → fresh
- **Flow**: load F8 → 001-fs-eng in 0200-build (not started) yields "fresh" with `--session-id` command
- **Subsystems**: resume decision logic
- **Expected**: agent with started=false produces action "fresh" containing `--session-id uuid-fresh`
- **Breaks if**: started flag not read from marker, or fresh command uses --resume
- **Size**: small
- **Verification**:
  ```
  const fresh = decisions.find(d => d.agentId === 'uuid-fresh')
  expect(fresh.action).toBe('fresh')
  expect(fresh.command).toContain('--session-id uuid-fresh')
  ```

### T-0200-13: Architect classified by same A/B/C rules
- **Flow**: load F8 → architect (started, not exited) yields "resume"
- **Subsystems**: resume decision logic (architects path)
- **Expected**: architects not special-cased — same rules apply
- **Breaks if**: architects excluded from resume decisions
- **Size**: small
- **Verification**:
  ```
  const arch = decisions.find(d => d.agentId === 'uuid-arch')
  expect(arch.action).toBe('resume')
  expect(arch.command).toContain('--resume uuid-arch')
  ```

### T-0200-14: All-exited fixture → every decision is "skip"
- **Flow**: load F9 → all decisions are "skip", no pty commands generated
- **Subsystems**: resume decision logic
- **Expected**: no resume or fresh actions — nothing to spawn
- **Breaks if**: exited agents accidentally resumed
- **Size**: small
- **Verification**:
  ```
  const fs9 = createAllExitedFixture()
  const model9 = createModel(fs9)
  await model9.loadFromFilesystem(NEPIC_DIR)
  const decisions = computeResumeActions(model9.getAllAgents())
  expect(decisions.every(d => d.action === 'skip')).toBe(true)
  ```

---

## Small tests — STOP→RUN with FakePtySpawner (vitest)

Proves: startup coordinator spawns correct ptys and updates model state.

### T-0200-20: Resume spawns pty with --resume flag
- **Flow**: load F8 → startAgents(ptySpawner) → FakePtySpawner records spawn for Case A agent
- **Subsystems**: startup coordinator, FakePtySpawner
- **Expected**: spawned entry with id="uuid-ta", command containing `claude --verbose --resume uuid-ta`
- **Breaks if**: coordinator doesn't pass correct command to pty spawner
- **Size**: small
- **Verification**:
  ```
  const ptySpawner = new FakePtySpawner()
  await startAgents(model, ptySpawner)

  const call = ptySpawner.spawned.find(s => s.id === 'uuid-ta')
  expect(call).toBeDefined()
  expect(call.command).toContain('claude --verbose --resume uuid-ta')
  ```

### T-0200-21: Fresh start spawns pty with --session-id flag + prompt
- **Flow**: load F8 → startAgents → FakePtySpawner records spawn for Case C agent
- **Subsystems**: startup coordinator, FakePtySpawner
- **Expected**: command contains `--session-id uuid-fresh` and prompt text ("read prompt.md")
- **Breaks if**: fresh path uses --resume instead of --session-id
- **Size**: small
- **Verification**:
  ```
  const call = ptySpawner.spawned.find(s => s.id === 'uuid-fresh')
  expect(call.command).toContain('--session-id uuid-fresh')
  expect(call.command).toContain('read')
  ```

### T-0200-22: Fresh start writes started: true to marker
- **Flow**: load F8 → startAgents → check marker for Case C agent
- **Subsystems**: startup coordinator, model write-back
- **Expected**: marker now has started: true
- **Breaks if**: started flag not written after Case C spawn
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)

  const marker = await fs.readJSON('nepic/30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json')
  expect(marker.started).toBe(true)
  ```

### T-0200-23: Exited agent → no pty spawned
- **Flow**: load F8 → startAgents → FakePtySpawner has no spawn for uuid-fs (exited)
- **Subsystems**: startup coordinator
- **Expected**: exited agent not in spawned list
- **Breaks if**: exited check bypassed
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  expect(ptySpawner.spawned.find(s => s.id === 'uuid-fs')).toBeUndefined()
  ```

### T-0200-24: Running flag set after spawn
- **Flow**: load F8 → startAgents → model shows running=true for spawned agents, false for skipped
- **Subsystems**: model ephemeral state, startup coordinator
- **Expected**: Case A/C agents running=true, Case B agent running=false
- **Breaks if**: model not updated after spawn, or exited agent erroneously set to running
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)

  // Case A: running
  const ta = model.getNapkins()[0].agents.find(a => a.id === 'uuid-ta')
  expect(ta.running).toBe(true)

  // Case B: not running (exited)
  const fsEng = model.getNapkins()[0].agents.find(a => a.id === 'uuid-fs')
  expect(fsEng.running).toBe(false)

  // Case C: running (fresh start)
  const fresh = model.getNapkins()[1].agents.find(a => a.id === 'uuid-fresh')
  expect(fresh.running).toBe(true)
  ```

---

## Small tests — RUN→STOP transition (vitest)

Proves: quit path kills ptys, saves UI state, writes NO exited markers. This is the key difference from v2.

### T-0200-30: Quit kills all ptys
- **Flow**: load F8 → startAgents → stopApp → all ptys killed
- **Subsystems**: shutdown coordinator, FakePtySpawner
- **Expected**: ptySpawner reports zero running after stopApp
- **Breaks if**: shutdown doesn't kill ptys, or misses some
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  expect(ptySpawner.runningCount()).toBe(3)  // 2 resumed + 1 fresh

  await stopApp(model, ptySpawner)
  expect(ptySpawner.runningCount()).toBe(0)
  ```

### T-0200-31: Quit does NOT write exited flags — markers unchanged
- **Flow**: load F8 → startAgents → snapshot agent markers → stopApp → compare markers
- **Subsystems**: shutdown coordinator, model
- **Expected**: .agent.nap.json files are identical before and after quit. Specifically, exited stays false for running agents.
- **Breaks if**: quit path writes exited: true (the v2 bug — v2 needed appIsClosing flag to prevent this)
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)

  const agentMarkerPath = 'nepic/30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json'
  const before = await fs.readJSON(agentMarkerPath)

  await stopApp(model, ptySpawner)

  const after = await fs.readJSON(agentMarkerPath)
  expect(after).toEqual(before)
  expect(after.exited).toBe(false)
  ```

### T-0200-32: Quit saves UI state
- **Flow**: load F8 → startAgents → stopApp with UI state → ui-state.json written
- **Subsystems**: shutdown coordinator, model.saveUiState
- **Expected**: ui-state.json contains activeNepicId and activeTerminalId
- **Breaks if**: UI state not saved during quit sequence
- **Size**: small
- **Verification**:
  ```
  await stopApp(model, ptySpawner, {
    activeNepicId: 'test-nepic',
    activeTerminalId: 'uuid-ta',
    sidebarVisible: true,
  })

  const uiState = await fs.readJSON('nepic/ui-state.json')
  expect(uiState).toMatchObject({
    activeNepicId: 'test-nepic',
    activeTerminalId: 'uuid-ta',
  })
  ```

### T-0200-33: Quit → reload → running=false for all agents
- **Flow**: load → startAgents → agents running → stopApp → reload model → running=false
- **Subsystems**: model lifecycle, ephemeral state boundary
- **Expected**: running flag doesn't survive reload (it's ephemeral)
- **Breaks if**: running flag persisted to marker
- **Size**: small
- **Verification**:
  ```
  await startAgents(model1, ptySpawner)
  expect(model1.getNapkins()[0].agents[0].running).toBe(true)

  await stopApp(model1, ptySpawner)

  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  expect(model2.getNapkins()[0].agents[0].running).toBe(false)
  ```

### T-0200-34: Pty exit during kill → exited NOT written
- **Flow**: load → startAgents → stopApp calls killAll → ptys exit (onExit fires) → exited flag NOT written to marker
- **Subsystems**: shutdown coordinator, pty exit suppression
- **Expected**: pty onExit callbacks during stopApp are suppressed — they do NOT call model.setAgentExited. This is v3's answer to v2's appIsClosing flag: we simply don't write anything on quit.
- **Breaks if**: exit handler fires normally during quit → writes exited: true
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)

  // Record all marker writes
  const writesSpy = vi.spyOn(fs, 'writeJSON')

  await stopApp(model, ptySpawner)

  // Only write should be ui-state.json, NOT any .agent.nap.json
  const agentWrites = writesSpy.mock.calls.filter(c => c[0].includes('.agent.nap.json'))
  expect(agentWrites).toHaveLength(0)
  ```

---

## Small tests — runtime: agent exits on its own (vitest)

Proves: when a pty exits during normal operation (NOT quit), the model writes exited=true. Next start skips that agent.

### T-0200-40: Agent pty exits → model marks exited + marker updated
- **Flow**: load F8 → startAgents → simulateExit for uuid-ta → exited=true, running=false, marker updated
- **Subsystems**: pty exit handler, model write-back
- **Expected**: agent.exited=true, agent.running=false. Marker has exited: true. Other marker fields preserved.
- **Breaks if**: exit handler doesn't write marker, or model state not updated
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  ptySpawner.simulateExit('uuid-ta', 0)

  const agent = model.getNapkins()[0].agents.find(a => a.id === 'uuid-ta')
  expect(agent.exited).toBe(true)
  expect(agent.running).toBe(false)

  const marker = await fs.readJSON(agentMarkerPath)
  expect(marker.exited).toBe(true)
  expect(marker.cc_session_uuid).toBe('uuid-ta')  // other fields preserved
  ```

### T-0200-41: Exited agent NOT resumed on next start
- **Flow**: startAgents → agent exits → stopApp → reload → startAgents → exited agent NOT spawned
- **Subsystems**: full lifecycle
- **Expected**: second startAgents doesn't spawn pty for the exited agent
- **Breaks if**: resume logic doesn't re-read exited flag from marker
- **Size**: small
- **Verification**:
  ```
  // Phase 1: agent exits during operation
  await startAgents(model1, pty1)
  pty1.simulateExit('uuid-ta', 0)
  await stopApp(model1, pty1)

  // Phase 2: restart
  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  const pty2 = new FakePtySpawner()
  await startAgents(model2, pty2)

  expect(pty2.spawned.find(s => s.id === 'uuid-ta')).toBeUndefined()
  ```

### T-0200-42: Agent exit fires bridge notification
- **Flow**: load with bridge → startAgents → agent exits → bridge snapshot shows exited=true, running=false
- **Subsystems**: pty exit handler → model → bridge
- **Expected**: bridge delivers updated snapshot with exited agent state
- **Breaks if**: exit handler doesn't trigger model.notify, or bridge not wired
- **Size**: small
- **Verification**:
  ```
  let snapshot: AppSnapshot | null = null
  bridge.onSnapshot(s => snapshot = s)

  await startAgents(model, ptySpawner)
  ptySpawner.simulateExit('uuid-ta', 0)

  const agent = snapshot.napkins[0].agents.find(a => a.id === 'uuid-ta')
  expect(agent.exited).toBe(true)
  expect(agent.running).toBe(false)
  ```

---

## Small tests — done signal (vitest)

Proves: done is ephemeral. Agent stays running. Not persisted. Resumes on next start.

### T-0200-43: Done signal → done=true, running still true
- **Flow**: load → startAgents → model.setAgentDone('uuid-ta') → done=true, running=true
- **Subsystems**: model ephemeral state
- **Expected**: done flag set in memory, pty still alive (running=true)
- **Breaks if**: done kills the pty, or done flag not implemented
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  model.setAgentDone('uuid-ta')

  const agent = model.getNapkins()[0].agents.find(a => a.id === 'uuid-ta')
  expect(agent.done).toBe(true)
  expect(agent.running).toBe(true)
  ```

### T-0200-44: Done is NOT persisted → reload → done=false
- **Flow**: set done → stopApp → reload → agent.done=false
- **Subsystems**: model persistence boundary
- **Expected**: done flag doesn't survive reload — ephemeral by design
- **Breaks if**: done written to marker file
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  model.setAgentDone('uuid-ta')
  await stopApp(model, ptySpawner)

  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  const agent = model2.getNapkins()[0].agents.find(a => a.id === 'uuid-ta')
  expect(agent.done).toBe(false)
  ```

### T-0200-45: Done agent resumes on next start (done ≠ exited)
- **Flow**: set done → stopApp → reload → startAgents → agent resumed with --resume
- **Subsystems**: model + resume logic
- **Expected**: agent that was "done" still gets resumed (started=true, exited=false → Case A)
- **Breaks if**: done confused with exited in resume logic
- **Size**: small
- **Verification**:
  ```
  await startAgents(model, ptySpawner)
  model.setAgentDone('uuid-ta')
  await stopApp(model, ptySpawner)

  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  const pty2 = new FakePtySpawner()
  await startAgents(model2, pty2)

  const call = pty2.spawned.find(s => s.id === 'uuid-ta')
  expect(call).toBeDefined()
  expect(call.command).toContain('--resume uuid-ta')
  ```

### T-0200-46: Done signal fires bridge notification
- **Flow**: load with bridge → startAgents → setAgentDone → snapshot shows done=true
- **Subsystems**: model → bridge
- **Expected**: bridge snapshot reflects done=true for the agent
- **Breaks if**: setAgentDone doesn't call notify
- **Size**: small
- **Verification**:
  ```
  let snapshot: AppSnapshot | null = null
  bridge.onSnapshot(s => snapshot = s)

  await startAgents(model, ptySpawner)
  model.setAgentDone('uuid-ta')

  const agent = snapshot.napkins[0].agents.find(a => a.id === 'uuid-ta')
  expect(agent.done).toBe(true)
  expect(agent.running).toBe(true)
  ```

---

## Small tests — survivability journeys (vitest)

Full lifecycle tests combining multiple transitions. These are the core value of 0200.

### T-0200-50: Journey — start → agent exits → quit → restart → correct agents resume
- **Flow**: load F8 → startAgents → uuid-ta pty exits → stopApp → reload → startAgents → verify each agent's fate
- **Subsystems**: full model + pty lifecycle across restart
- **Expected**: on second start: uuid-ta skipped (exited), uuid-arch resumed, uuid-fresh now Case A (was Case C on first start, started=true written)
- **Breaks if**: any transition corrupts state, or started flag not persisted for Case C
- **Size**: small
- **Verification**:
  ```
  // Phase 1: start, agent exits
  const pty1 = new FakePtySpawner()
  await startAgents(model1, pty1)
  pty1.simulateExit('uuid-ta', 0)
  await stopApp(model1, pty1)

  // Phase 2: restart
  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  const pty2 = new FakePtySpawner()
  await startAgents(model2, pty2)

  // uuid-ta: exited → skipped
  expect(pty2.spawned.find(s => s.id === 'uuid-ta')).toBeUndefined()

  // uuid-arch: Case A → resumed
  const archCall = pty2.spawned.find(s => s.id === 'uuid-arch')
  expect(archCall).toBeDefined()
  expect(archCall.command).toContain('--resume')

  // uuid-fresh: was Case C in phase 1, now Case A (started=true written)
  const freshCall = pty2.spawned.find(s => s.id === 'uuid-fresh')
  expect(freshCall).toBeDefined()
  expect(freshCall.command).toContain('--resume uuid-fresh')
  ```

### T-0200-51: Journey — fresh agent → started=true → quit → restart → now resumes
- **Flow**: load F8 → startAgents (Case C → started written) → stopApp → reload → startAgents → uuid-fresh is now Case A
- **Subsystems**: started flag lifecycle across restart
- **Expected**: agent transitions from Case C to Case A
- **Breaks if**: started flag not persisted to marker
- **Size**: small
- **Verification**:
  ```
  // Phase 1: fresh start writes started=true
  await startAgents(model1, pty1)
  const marker1 = await fs.readJSON(freshMarkerPath)
  expect(marker1.started).toBe(true)
  await stopApp(model1, pty1)

  // Phase 2: now Case A
  const model2 = createModel(fs)
  await model2.loadFromFilesystem(NEPIC_DIR)
  const pty2 = new FakePtySpawner()
  await startAgents(model2, pty2)

  const call = pty2.spawned.find(s => s.id === 'uuid-fresh')
  expect(call.command).toContain('--resume uuid-fresh')  // Case A, not C
  ```

### T-0200-52: Journey — full cycle with bridge: start → done → exit → quit → restart → snapshot correct
- **Flow**: load F8 + bridge → startAgents → set done on uuid-ta → uuid-fs exits → stopApp → reload + bridge → verify snapshot
- **Subsystems**: model + bridge + pty lifecycle across restart
- **Expected**: after restart, snapshot shows: uuid-ta resumable (done reset, not exited), uuid-fs exited (was already exited in fixture), uuid-fresh resumable (Case A after first run)
- **Breaks if**: bridge doesn't reflect correct post-restart state
- **Size**: small
- **Verification**:
  ```
  // Phase 1: runtime events
  const bridge1 = new FakeBridge()
  wireModelToBridge(model1, bridge1, 'test-nepic')
  await startAgents(model1, pty1)
  model1.setAgentDone('uuid-ta')
  await stopApp(model1, pty1)

  // Phase 2: restart with bridge
  const model2 = createModel(fs)
  const bridge2 = new FakeBridge()
  wireModelToBridge(model2, bridge2, 'test-nepic')
  let snapshot: AppSnapshot | null = null
  bridge2.onSnapshot(s => snapshot = s)

  await model2.loadFromFilesystem(NEPIC_DIR)

  // uuid-ta: done reset (ephemeral), not exited, not running yet
  const ta = snapshot.napkins[0].agents.find(a => a.id === 'uuid-ta')
  expect(ta.done).toBe(false)
  expect(ta.exited).toBe(false)
  expect(ta.running).toBe(false)

  // uuid-fs: still exited from fixture
  const fsEng = snapshot.napkins[0].agents.find(a => a.id === 'uuid-fs')
  expect(fsEng.exited).toBe(true)
  ```

---

## Medium tests — equivalence with small tests (Playwright + real Electron)

Medium tests spawn real Electron with real ptys. In test mode (NAP_TEST=1), pty commands use a test command (e.g. `cat` or `sleep 999`) to keep processes alive without needing real `claude`.

### T-0200-60: Launch with fixture → ptys spawned → store shows running agents
- **Flow**: write F8 to tmpDir → launch app → wait for store to show running agents → verify running/exited split
- **Subsystems**: real Electron, real pty spawn, real IPC
- **Expected**: Case A agents running (uuid-ta, uuid-arch), Case C agent running (uuid-fresh), Case B agent NOT running (uuid-fs exited)
- **Breaks if**: pty spawn fails, or running flag not pushed through real IPC
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0200-24
  tmpDir = makeTmpDir()
  createTestNepicDir(tmpDir, F8_FIXTURE)
  app = await launchApp(tmpDir)
  page = await app.firstWindow()

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.some(a => a.running === true)
  }, { timeout: 15000 })

  const state = await page.evaluate(() => {
    const s = window.__napStore__.getState()
    return {
      runningIds: s.napkins.flatMap(n => n.agents.filter(a => a.running).map(a => a.id)),
      exitedIds: s.napkins.flatMap(n => n.agents.filter(a => a.exited).map(a => a.id)),
    }
  })

  expect(state.runningIds).toContain('uuid-ta')
  expect(state.runningIds).toContain('uuid-fresh')
  expect(state.exitedIds).toContain('uuid-fs')
  expect(state.runningIds).not.toContain('uuid-fs')
  ```

### T-0200-61: Agent pty exits → marker on real disk → store shows exited
- **Flow**: launch → wait for running → kill one pty → marker updated on disk → store shows exited
- **Subsystems**: real pty exit, real fs write, real IPC
- **Expected**: marker has exited=true on disk. Store shows exited=true, running=false.
- **Breaks if**: exit handler doesn't write to real fs, or IPC doesn't push update
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0200-40
  // Launch and wait for running
  await app.evaluate(async () => {
    global.__napPtyManager__.kill('uuid-ta')
  })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    const agent = s?.napkins?.[0]?.agents?.find(a => a.id === 'uuid-ta')
    return agent?.exited === true && agent?.running === false
  }, { timeout: 10000 })

  // Verify marker on real disk
  const markerPath = path.join(nepicDir, '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json')
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
  expect(marker.exited).toBe(true)
  ```

### T-0200-62: Quit → reopen → same agents running, exited still exited
- **Flow**: launch → verify running → quit → relaunch → same agents running
- **Subsystems**: real Electron lifecycle, real pty, real fs persistence
- **Expected**: after relaunch, Case A/C agents running again, Case B still exited
- **Breaks if**: quit corrupts markers, or resume logic fails with real fs
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0200-50 (partial — no agent exit, just quit/reopen)
  // Phase 1: verify running
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.some(a => a.running)
  }, { timeout: 15000 })

  // Phase 2: quit
  await app.evaluate(({ app }) => app.quit())
  await app.close()

  // Phase 3: relaunch
  app = await launchApp(tmpDir)
  page = await app.firstWindow()

  // Phase 4: verify same state
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.some(a => a.running)
  }, { timeout: 15000 })

  const state = await page.evaluate(() => {
    const s = window.__napStore__.getState()
    return {
      runningIds: s.napkins.flatMap(n => n.agents.filter(a => a.running).map(a => a.id)),
      exitedIds: s.napkins.flatMap(n => n.agents.filter(a => a.exited).map(a => a.id)),
    }
  })
  expect(state.runningIds).toContain('uuid-ta')
  expect(state.exitedIds).toContain('uuid-fs')
  ```

### T-0200-63: Quit does NOT write exited flags to real disk
- **Flow**: launch → read marker → quit → read marker again → unchanged
- **Subsystems**: real Electron shutdown, real fs
- **Expected**: .agent.nap.json exited field unchanged after quit
- **Breaks if**: quit writes exited (the v2 bug we're eliminating)
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0200-31
  const markerPath = path.join(nepicDir, '30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json')
  const before = fs.readFileSync(markerPath, 'utf-8')

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.some(a => a.running)
  }, { timeout: 15000 })

  await app.evaluate(({ app }) => app.quit())
  await app.close()

  const after = fs.readFileSync(markerPath, 'utf-8')
  expect(JSON.parse(after).exited).toBe(false)
  expect(after).toBe(before)
  ```

### T-0200-64: Case C agent → started=true written to real disk
- **Flow**: launch with F8 → wait for Case C agent running → verify started=true on disk
- **Subsystems**: real pty spawn, real fs write
- **Expected**: Case C agent's marker on disk now has started: true
- **Breaks if**: fresh start doesn't write started flag to real fs
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0200-22
  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    const agent = s?.napkins?.[1]?.agents?.[0]
    return agent?.running === true
  }, { timeout: 15000 })

  const markerPath = path.join(nepicDir, '30-napkins/0200-build/agents/001-fs-eng/.agent.nap.json')
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
  expect(marker.started).toBe(true)
  ```

---

## Equivalence map

| Journey | Small test | Medium test | Shared assertion |
|---------|-----------|-------------|------------------|
| Three-case resume (A/B/C) | T-0200-10,11,12,13 | T-0200-60 | A running, B exited, C running |
| Running flag after spawn | T-0200-24 | T-0200-60 | running=true for A/C, false for B |
| Agent exit → exited flag | T-0200-40 | T-0200-61 | exited=true in model + marker |
| Quit → no exited writes | T-0200-31,34 | T-0200-63 | markers unchanged after quit |
| Quit → reopen → same state | T-0200-50 | T-0200-62 | same running/exited split |
| Case C → started=true | T-0200-22 | T-0200-64 | marker.started=true |

---

## What's NOT tested here (and why)

- **Real claude sessions** — medium tests use a test pty command (cat/sleep), not real claude. Real claude resume is 0500 integration.
- **Terminal UI rendering** — no xterm, no sidebar dot colors, no canvas. That's 0400.
- **Socket/CLI integration** — nap done signal arrives through socket server, tested in 0300. Here we test `model.setAgentDone()` directly.
- **Output buffering / ready signaling** — ported from v2, tested when wired to real xterm in later napkins.
- **Multiple nepics** — single nepic in all fixtures. Multi-nepic switching is 0500.
- **Filesystem watcher interaction** — watcher tested thoroughly in 0150. Pty lifecycle tested here. No overlap.
- **Sidebar zoom levels** — 0400.

---

## Test infrastructure the fs-eng must build

1. **Expanded AgentState type** — add: id (=cc_session_uuid), nepicId, napkinId, parentName, parentId, started, running, done, homePath. Update bridge-types.ts.

2. **Expanded NapkinState type** — add: id (=slug), nepicId, path. Update bridge-types.ts.

3. **Model updates**:
   - Read new marker fields: parent, parent_id, started
   - Populate new AgentState fields during loadFromFilesystem
   - `setAgentRunning(agentId, running)` — sets ephemeral running flag, notifies
   - `setAgentDone(agentId)` — sets ephemeral done flag, notifies
   - `setAgentStarted(napkinSlug, agentName)` — writes started: true to marker
   - `getAllAgents()` — returns flat list of all agents (napkin + architect) for resume decisions

4. **Resume decision function** — `computeResumeActions(agents: AgentState[])`:
   - Pure function, testable without fakes
   - Input: agents with started/exited/id/homePath fields
   - Output: `{ agentId, action: 'resume' | 'fresh' | 'skip', command?: string }[]`
   - Case A (started + !exited): `claude --verbose --resume <id>`
   - Case B (exited): skip
   - Case C (!started): `claude --verbose --session-id <id> "read <homePath>/prompt.md..."`

5. **FakePtySpawner** — for small tests:
   - `spawn(opts: { id, command, cwd })` — records call, adds to running set
   - `kill(id)` — removes from running, fires registered exit callback
   - `killAll()` — kills all running
   - `isRunning(id): boolean`
   - `runningCount(): number`
   - `simulateExit(id, exitCode)` — fires exit callback, removes from running
   - `onExit(id, callback)` — registers exit callback for agent

6. **Startup coordinator** — `startAgents(model, ptySpawner)`:
   - Computes resume actions from model state
   - Executes actions: spawn ptys, write started=true for Case C
   - Sets running=true on model for spawned agents
   - Registers onExit handler: calls model.setAgentExited (for runtime exits)

7. **Shutdown coordinator** — `stopApp(model, ptySpawner, uiState?)`:
   - Saves UI state via model.saveUiState
   - Disconnects pty exit handlers (so kills don't trigger setAgentExited)
   - Kills all ptys
   - Sets running=false on model for all agents

8. **F8 fixture** — survivability (three cases). Memory version in fixtures.ts, disk version in helpers.ts (F8_FIXTURE constant).

9. **F9 fixture** — all-exited. Memory version + disk version.

10. **Test pty command** — when NAP_TEST=1, replace `claude --verbose ...` with a long-lived test command (e.g. `cat` or `sleep 999`) so medium tests can verify pty lifecycle without real claude.

11. **Pty manager test hook** — expose `global.__napPtyManager__` when NAP_TEST=1, with at minimum `kill(id)` for medium tests to trigger agent exit.
