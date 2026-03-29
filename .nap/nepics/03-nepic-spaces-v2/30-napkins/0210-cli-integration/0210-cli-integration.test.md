# 0210 — CLI integration: test cases

Hypothesis: **the CLI, socket server, new model methods, name resolution, and message queue all wire together correctly — CLI commands produce the right model mutations and the renderer reflects them. Small tests (model + fakes + real socket) and medium tests (real CLI → real Electron) produce equivalent results.**

---

## Fixtures

### F10: CLI integration fixture (agents in various lifecycle states)
```
30-napkins/0100-explore/.napkin.nap.json        → { "status": "doing", "nepic": "test-nepic" }
30-napkins/0100-explore/agents/001-test-arch/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-ta", "role": "test-arch", "name": "001-test-arch",
    "napkin": "0100-explore", "nepic": "test-nepic",
    "parent": "001-architect", "parent_id": "uuid-arch",
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

Exercises: running agents, exited agents, fresh agents, multiple napkins, architect with children.

### F11: empty nepic (for create-from-scratch flows)
```
20-architects/001-architect/
  .agent.nap.json → {
    "cc_session_uuid": "uuid-arch", "role": "architect", "name": "001-architect",
    "nepic": "test-nepic",
    "created_at": 1711600000000, "started": true, "exited": false
  }
```

No napkins, no worker agents. Used for create-napkin, create-agent, create-nepic tests.

---

## Small tests — socket server protocol (vitest)

Proves: ndjson over unix socket works. Handler dispatch, error wrapping, concurrent connections.

### T-0210-01: socket round-trip — send request, receive response
- **Flow**: start socket server with trivial handler → connect via net.createConnection → write ndjson request → read ndjson response → disconnect
- **Subsystems**: socket server, NdjsonParser, serialize
- **Expected**: response matches handler's return value, preserves request id
- **Breaks if**: ndjson framing broken, handler not called, response not sent
- **Size**: small
- **Verification**:
  ```
  const handler = async (msg) => ({ id: msg.id, ok: true, echo: msg.type })
  await startSocketServer(handler, tmpSocketPath)
  const response = await send(tmpSocketPath, { type: 'ping', id: 1 })
  expect(response).toMatchObject({ id: 1, ok: true, echo: 'ping' })
  await stopSocketServer()
  ```

### T-0210-02: handler error → error response with request id
- **Flow**: handler throws → socket returns error response with same request id
- **Subsystems**: socket server error wrapping
- **Expected**: response has `{ id: 1, error: true, message: "..." }`, connection stays usable
- **Breaks if**: error not caught, connection dropped, id lost
- **Size**: small
- **Verification**:
  ```
  const handler = async () => { throw new Error('boom') }
  await startSocketServer(handler, tmpSocketPath)
  const response = await send(tmpSocketPath, { type: 'bad', id: 1 })
  expect(response).toMatchObject({ id: 1, error: true })
  expect(response.message).toContain('boom')
  ```

### T-0210-03: concurrent connections don't interfere
- **Flow**: two clients connect simultaneously, each sends a request → each gets its own response
- **Subsystems**: socket server connection management
- **Expected**: each client receives the response matching its request id, not the other's
- **Breaks if**: shared state between connections, responses routed to wrong client
- **Size**: small
- **Verification**:
  ```
  const handler = async (msg) => ({ id: msg.id, name: msg.name })
  await startSocketServer(handler, tmpSocketPath)
  const [r1, r2] = await Promise.all([
    send(tmpSocketPath, { id: 1, name: 'alice' }),
    send(tmpSocketPath, { id: 2, name: 'bob' }),
  ])
  expect(r1).toMatchObject({ id: 1, name: 'alice' })
  expect(r2).toMatchObject({ id: 2, name: 'bob' })
  ```

### T-0210-04: stale socket file cleaned up on server start
- **Flow**: write a dummy file at the socket path → start server → server removes stale file and binds
- **Subsystems**: socket server startup
- **Expected**: server starts successfully despite existing stale socket file
- **Breaks if**: server refuses to start when socket file exists (EADDRINUSE without cleanup)
- **Size**: small
- **Verification**:
  ```
  fs.writeFileSync(tmpSocketPath, '')  // stale socket
  await startSocketServer(handler, tmpSocketPath)  // should not throw
  const response = await send(tmpSocketPath, { type: 'ping', id: 1 })
  expect(response.id).toBe(1)
  ```

---

## Small tests — name resolution (vitest)

Proves: exact match, "did you mean" suggestions, scoping to active nepic.

### T-0210-10: exact match returns agent
- **Flow**: resolve "001-test-arch" against F10 agents (scoped to test-nepic)
- **Subsystems**: name resolver
- **Expected**: returns `{ ok: true, agent }` with agent.name = "001-test-arch"
- **Breaks if**: resolver doesn't check name field
- **Size**: small
- **Verification**:
  ```
  const result = resolveByName(agents, '001-test-arch')
  expect(result.ok).toBe(true)
  expect(result.agent.name).toBe('001-test-arch')
  ```

### T-0210-11: no match returns suggestions (Levenshtein ≤ 2)
- **Flow**: resolve "test-arch" (no prefix) against F10 agents
- **Subsystems**: name resolver, Levenshtein distance
- **Expected**: `{ ok: false, error: "no agent named 'test-arch'\n\ndid you mean:\n  001-test-arch" }`
- **Breaks if**: suggestions not generated, or Levenshtein threshold too strict
- **Size**: small
- **Verification**:
  ```
  const result = resolveByName(agents, 'test-arch')
  expect(result.ok).toBe(false)
  expect(result.error).toContain('did you mean')
  expect(result.error).toContain('001-test-arch')
  ```

### T-0210-12: no match and no similar names returns clean error
- **Flow**: resolve "zzzz-nonexistent" against F10 agents
- **Subsystems**: name resolver
- **Expected**: `{ ok: false, error: "no agent named 'zzzz-nonexistent'" }` — no suggestions
- **Breaks if**: empty suggestions shown, or error message unclear
- **Size**: small
- **Verification**:
  ```
  const result = resolveByName(agents, 'zzzz-nonexistent')
  expect(result.ok).toBe(false)
  expect(result.error).toContain('no agent named')
  expect(result.error).not.toContain('did you mean')
  ```

### T-0210-13: name resolution scoped to nepic
- **Flow**: two nepics each have agent "001-architect". Resolve without --nepic → searches active nepic only. Resolve with --nepic → finds correct one.
- **Subsystems**: name resolver, nepic scoping
- **Expected**: without nepic flag, returns agent from active nepic. With explicit nepic, returns agent from specified nepic.
- **Breaks if**: resolver searches all nepics when no --nepic given, returning ambiguous results
- **Size**: small
- **Verification**:
  ```
  const result = resolveByName(activeNepicAgents, '001-architect')
  expect(result.ok).toBe(true)
  expect(result.agent.nepicId).toBe('active-nepic')
  ```

### T-0210-14: duplicate name within nepic rejected at create time
- **Flow**: create agent "001-test-arch" in 0100-explore which already has 001-test-arch
- **Subsystems**: model.createAgentStub, name uniqueness
- **Expected**: throws/returns error "agent '001-test-arch' already exists in napkin 0100-explore"
- **Breaks if**: no uniqueness check, duplicate agent created
- **Size**: small
- **Verification**:
  ```
  await model.loadFromFilesystem(NEPIC_DIR)
  await expect(
    model.createAgentStub('0100-explore', '001-test-arch', 'test-arch')
  ).rejects.toThrow(/already exists/)
  ```

---

## Small tests — new model methods (vitest)

Proves: each model method writes correct markers, updates state, fires onChange. Uses MemoryFileSystem.

### T-0210-20: createNapkin writes dir + .napkin.nap.json
- **Flow**: load F11 → `model.createNapkin('0100-feature', 'backlog')` → verify filesystem + model state
- **Subsystems**: NapModel, MemoryFileSystem
- **Expected**: dir `30-napkins/0100-feature/agents/` created. `.napkin.nap.json` written with `{ status: 'backlog', nepic: 'test-nepic' }`. Model shows new napkin. onChange fires.
- **Breaks if**: dir not created, marker wrong, model not updated, no onChange
- **Size**: small
- **Verification**:
  ```
  const spy = vi.fn()
  model.onChange(spy)
  const napkin = await model.createNapkin('0100-feature', 'backlog')

  expect(napkin.slug).toBe('0100-feature')
  expect(napkin.status).toBe('backlog')

  const marker = await fs.readJSON('nepic/30-napkins/0100-feature/.napkin.nap.json')
  expect(marker.status).toBe('backlog')

  expect(model.getNapkins()).toHaveLength(1)
  expect(spy).toHaveBeenCalled()
  ```

### T-0210-21: createNapkin returns JSON matching CLI design
- **Flow**: createNapkin → check return value shape
- **Subsystems**: NapModel
- **Expected**: `{ slug, status, dir, nepic }` — matches the CLI design JSON output
- **Breaks if**: return value missing fields the CLI needs
- **Size**: small
- **Verification**:
  ```
  const result = await model.createNapkin('0100-feature', 'backlog')
  expect(result).toMatchObject({ slug: '0100-feature', status: 'backlog' })
  expect(result.dir).toContain('30-napkins/0100-feature')
  expect(result.nepic).toBe('test-nepic')
  ```

### T-0210-22: createAgentStub writes marker, does NOT spawn pty
- **Flow**: load F10 → `model.createAgentStub('0100-explore', '003-test-eng', 'test-eng')` → verify marker written, ptySpawner NOT called, model shows agent with started=false
- **Subsystems**: NapModel, MemoryFileSystem, FakePtySpawner
- **Expected**: `.agent.nap.json` written at `30-napkins/0100-explore/agents/003-test-eng/`. Agent in model has `started: false, running: false`. No pty spawned.
- **Breaks if**: pty spawned at create time (conflates create + start), marker missing
- **Size**: small
- **Verification**:
  ```
  const agent = await model.createAgentStub('0100-explore', '003-test-eng', 'test-eng')
  expect(agent.name).toBe('003-test-eng')
  expect(agent.started).toBe(false)
  expect(agent.running).toBe(false)

  const marker = await fs.readJSON('nepic/30-napkins/0100-explore/agents/003-test-eng/.agent.nap.json')
  expect(marker.role).toBe('test-eng')
  expect(marker.started).toBe(false)
  expect(marker.cc_session_uuid).toBeDefined()

  expect(ptySpawner.spawned).toHaveLength(0)
  ```

### T-0210-23: createAgentStub returns JSON matching CLI design
- **Flow**: createAgentStub → check return value shape
- **Subsystems**: NapModel
- **Expected**: `{ id, name, role, dir, napkin, nepic }` — matches CLI design
- **Breaks if**: return value missing fields
- **Size**: small
- **Verification**:
  ```
  const result = await model.createAgentStub('0100-explore', '003-test-eng', 'test-eng')
  expect(result).toMatchObject({ name: '003-test-eng', role: 'test-eng', napkin: '0100-explore' })
  expect(result.id).toBeDefined()
  expect(result.dir).toContain('agents/003-test-eng')
  expect(result.nepic).toBe('test-nepic')
  ```

### T-0210-24: createArchitectStub writes to 20-architects/
- **Flow**: load F11 → `model.createArchitectStub('002-nova')` → verify dir + marker
- **Subsystems**: NapModel, MemoryFileSystem
- **Expected**: `.agent.nap.json` at `20-architects/002-nova/` with role=architect, started=false. Model's getArchitects() includes it.
- **Breaks if**: created under 30-napkins/ instead of 20-architects/, or role wrong
- **Size**: small
- **Verification**:
  ```
  const arch = await model.createArchitectStub('002-nova')
  expect(arch.role).toBe('architect')
  expect(arch.name).toBe('002-nova')
  expect(arch.dir).toContain('20-architects/002-nova')

  const marker = await fs.readJSON('nepic/20-architects/002-nova/.agent.nap.json')
  expect(marker.role).toBe('architect')
  expect(marker.started).toBe(false)
  ```

### T-0210-25: createNepic scaffolds full structure + architect stub
- **Flow**: `model.createNepic('02-v2', 'Version 2')` → verify entire directory tree
- **Subsystems**: NapModel, MemoryFileSystem
- **Expected**: dirs created: `nepics/02-v2/10-docs/`, `nepics/02-v2/20-architects/001-architect/`, `nepics/02-v2/30-napkins/`. Architect stub marker at 20-architects/001-architect/. Returns `{ slug, name, dir, architectId, architectDir }`.
- **Breaks if**: missing subdirectories, no architect stub, incomplete return value
- **Size**: small
- **Verification**:
  ```
  const nepic = await model.createNepic('02-v2', 'Version 2')
  expect(nepic.slug).toBe('02-v2')
  expect(nepic.name).toBe('Version 2')
  expect(nepic.architectId).toBeDefined()
  expect(nepic.architectDir).toContain('20-architects/001-architect')

  const archMarker = await fs.readJSON('nepic/../02-v2/20-architects/001-architect/.agent.nap.json')
  expect(archMarker.role).toBe('architect')
  ```

### T-0210-26: startAgentByName finds agent, spawns pty, sets started+running
- **Flow**: load F10 → `model.startAgentByName('001-fs-eng')` (the fresh agent in 0200-build) → verify pty spawned, model flags updated
- **Subsystems**: NapModel, FakePtySpawner
- **Expected**: ptySpawner.spawned has entry with id=uuid-fresh. Model shows agent with started=true, running=true. Marker has started=true.
- **Breaks if**: agent not found, pty not spawned, flags not updated
- **Size**: small
- **Verification**:
  ```
  const ptySpawner = new FakePtySpawner()
  const agent = await model.startAgentByName('001-fs-eng', 'read prompt.md', ptySpawner)

  expect(agent.started).toBe(true)
  expect(agent.running).toBe(true)
  expect(ptySpawner.spawned[0].id).toBe('uuid-fresh')
  expect(ptySpawner.spawned[0].command).toContain('claude --verbose')
  expect(ptySpawner.spawned[0].command).toContain('read prompt.md')

  const marker = await fs.readJSON(freshAgentMarkerPath)
  expect(marker.started).toBe(true)
  ```

### T-0210-27: startAgentByName on already-running agent → error
- **Flow**: load F10 → startAgentByName('001-test-arch') — already started+running
- **Subsystems**: NapModel
- **Expected**: throws "agent '001-test-arch' is already running"
- **Breaks if**: spawns duplicate pty, no guard
- **Size**: small
- **Verification**:
  ```
  await expect(
    model.startAgentByName('001-test-arch', null, ptySpawner)
  ).rejects.toThrow(/already running/)
  expect(ptySpawner.spawned).toHaveLength(0)
  ```

### T-0210-28: startAgentByName on nonexistent agent → error with suggestions
- **Flow**: startAgentByName('test-arch') — no exact match
- **Subsystems**: NapModel, name resolution
- **Expected**: throws with "no agent named 'test-arch'" and suggestions
- **Breaks if**: unhelpful error message
- **Size**: small
- **Verification**:
  ```
  await expect(
    model.startAgentByName('test-arch', null, ptySpawner)
  ).rejects.toThrow(/no agent named/)
  ```

### T-0210-29: getStatus returns correct data for different query types
- **Flow**: load F10 → getStatus with different query patterns
- **Subsystems**: NapModel
- **Expected**:
  - `getStatus({ napkin: '0100-explore' })` → napkin phase, agent count, agent statuses
  - `getStatus({ agent: '001-test-arch' })` → agent state (running, role, napkin, session uuid)
  - `getStatus({})` → project overview (napkin distribution, running agents count)
- **Breaks if**: wrong query type returns wrong data shape
- **Size**: small
- **Verification**:
  ```
  const napkinStatus = model.getStatus({ napkin: '0100-explore' })
  expect(napkinStatus.phase).toBe('doing')
  expect(napkinStatus.agentCount).toBe(2)

  const agentStatus = model.getStatus({ agent: '001-test-arch' })
  expect(agentStatus.running).toBe(true)
  expect(agentStatus.role).toBe('test-arch')

  const overview = model.getStatus({})
  expect(overview.napkinsByPhase.doing).toBe(1)
  expect(overview.napkinsByPhase.backlog).toBe(1)
  ```

### T-0210-30: getAllAgentsTree returns agents grouped by parent
- **Flow**: load F10 → getAllAgentsTree()
- **Subsystems**: NapModel
- **Expected**: tree structure with 001-architect at root, 001-test-arch as child, 002-fs-eng under 001-test-arch. 001-fs-eng (0200-build) as separate root.
- **Breaks if**: parentId linkage broken, orphans misplaced
- **Size**: small
- **Verification**:
  ```
  const tree = model.getAllAgentsTree()
  const archNode = tree.find(n => n.name === '001-architect')
  expect(archNode.children).toHaveLength(1)
  expect(archNode.children[0].name).toBe('001-test-arch')
  expect(archNode.children[0].children[0].name).toBe('002-fs-eng')

  const freshNode = tree.find(n => n.name === '001-fs-eng')
  expect(freshNode.children).toHaveLength(0)
  ```

---

## Small tests — socket handlers (vitest)

Proves: each socket request type routes to the correct model method and returns the correct response. Uses real socket server + real model with MemoryFileSystem.

### T-0210-40: create-napkin handler → model.createNapkin → JSON response
- **Flow**: send `{ type: 'create-napkin', slug: '0300-deploy', status: 'backlog' }` → handler calls model.createNapkin → response contains `{ slug, status, dir, nepic }`
- **Subsystems**: socket server, handler dispatch, NapModel
- **Expected**: response is the JSON from CLI design. Model shows new napkin.
- **Breaks if**: handler doesn't call createNapkin, response shape wrong
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'create-napkin', id: 1, slug: '0300-deploy', status: 'backlog' })
  expect(res.slug).toBe('0300-deploy')
  expect(res.status).toBe('backlog')
  expect(res.dir).toBeDefined()
  expect(model.getNapkins().find(n => n.slug === '0300-deploy')).toBeDefined()
  ```

### T-0210-41: create-agent handler → model.createAgentStub → JSON response
- **Flow**: send `{ type: 'create-agent', napkinSlug: '0100-explore', name: '003-test-eng', role: 'test-eng' }` → response contains `{ id, name, role, dir, napkin, nepic }`
- **Subsystems**: socket server, handler dispatch, NapModel
- **Expected**: agent created in model, response matches CLI design shape
- **Breaks if**: handler creates wrong entity type, response missing fields
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, {
    type: 'create-agent', id: 1,
    napkinSlug: '0100-explore', name: '003-test-eng', role: 'test-eng'
  })
  expect(res.name).toBe('003-test-eng')
  expect(res.role).toBe('test-eng')
  expect(res.napkin).toBe('0100-explore')
  expect(res.id).toBeDefined()
  ```

### T-0210-42: create-architect handler → model.createArchitectStub → JSON response
- **Flow**: send `{ type: 'create-architect', name: '002-nova' }` → response contains `{ id, name, role, dir, nepic }`
- **Subsystems**: socket server, handler dispatch, NapModel
- **Expected**: architect created under 20-architects/, response correct
- **Breaks if**: architect created under wrong path
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'create-architect', id: 1, name: '002-nova' })
  expect(res.name).toBe('002-nova')
  expect(res.role).toBe('architect')
  expect(res.dir).toContain('20-architects')
  ```

### T-0210-43: create-nepic handler → model.createNepic → JSON response
- **Flow**: send `{ type: 'create-nepic', slug: '02-v2', displayName: 'Version 2' }` → response contains `{ slug, name, dir, architectId, architectDir }`
- **Subsystems**: socket server, handler dispatch, NapModel
- **Expected**: full nepic structure scaffolded, architect stub created
- **Breaks if**: missing subdirectories or architect stub
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'create-nepic', id: 1, slug: '02-v2', displayName: 'Version 2' })
  expect(res.slug).toBe('02-v2')
  expect(res.name).toBe('Version 2')
  expect(res.architectId).toBeDefined()
  ```

### T-0210-44: start handler → model.startAgentByName → pty spawned → JSON response
- **Flow**: load F10 → send `{ type: 'start', name: '001-fs-eng', prompt: 'read prompt.md' }` → agent started
- **Subsystems**: socket server, NapModel, FakePtySpawner
- **Expected**: response `{ id, name, pid }`. Pty spawned. Model shows running.
- **Breaks if**: pty not spawned, or started flag not set
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'start', id: 1, name: '001-fs-eng', prompt: 'read prompt.md' })
  expect(res.name).toBe('001-fs-eng')
  expect(res.id).toBe('uuid-fresh')
  expect(ptySpawner.spawned).toHaveLength(1)
  ```

### T-0210-45: done handler → model.setAgentDone → in-memory only
- **Flow**: send `{ type: 'done', sessionId: 'uuid-ta' }` → model marks done
- **Subsystems**: socket server, NapModel
- **Expected**: agent's `done` flag true in model. Marker file NOT updated (done is ephemeral). Pty stays alive.
- **Breaks if**: done written to marker (should be in-memory only), or pty killed
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'done', id: 1, sessionId: 'uuid-ta' })
  expect(res.error).toBeUndefined()

  const agent = model.getAllAgents().find(a => a.id === 'uuid-ta')
  expect(agent.done).toBe(true)
  expect(agent.running).toBe(true)  // still alive

  const marker = await fs.readJSON(taMarkerPath)
  expect(marker.done).toBeUndefined()  // NOT persisted
  ```

### T-0210-46: stop handler → pty killed + model.setAgentExited
- **Flow**: load F10, start agents → send `{ type: 'stop', name: '001-test-arch' }`
- **Subsystems**: socket server, NapModel, FakePtySpawner
- **Expected**: pty killed. Model shows exited=true. Marker updated with exited=true.
- **Breaks if**: pty not killed, or exited not persisted
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'stop', id: 1, name: '001-test-arch' })
  expect(res.error).toBeUndefined()

  expect(ptySpawner.isRunning('uuid-ta')).toBe(false)
  const agent = model.getAllAgents().find(a => a.id === 'uuid-ta')
  expect(agent.exited).toBe(true)
  ```

### T-0210-47: set-status handler → model.setNapkinStatus
- **Flow**: send `{ type: 'set-status', napkinSlug: '0100-explore', status: 'review' }`
- **Subsystems**: socket server, NapModel
- **Expected**: napkin status updated in model and marker file
- **Breaks if**: wrong napkin targeted, status not persisted
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'set-status', id: 1, napkinSlug: '0100-explore', status: 'review' })
  expect(res.error).toBeUndefined()
  expect(model.getNapkins().find(n => n.slug === '0100-explore').status).toBe('review')
  ```

### T-0210-48: set-status with invalid phase → error
- **Flow**: send `{ type: 'set-status', napkinSlug: '0100-explore', status: 'wip' }`
- **Subsystems**: socket server, handler validation
- **Expected**: error "unknown phase 'wip' — use: backlog, todo, doing, review, done"
- **Breaks if**: invalid phase accepted silently
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'set-status', id: 1, napkinSlug: '0100-explore', status: 'wip' })
  expect(res.error).toBe(true)
  expect(res.message).toContain('unknown phase')
  expect(res.message).toContain('backlog, todo, doing, review, done')
  ```

### T-0210-49: ps handler → getAllAgentsTree → tree structure
- **Flow**: load F10 → send `{ type: 'ps' }`
- **Subsystems**: socket server, NapModel
- **Expected**: response contains tree with correct hierarchy, 4 columns per node (name, status, napkin, role)
- **Breaks if**: tree structure wrong, missing fields
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'ps', id: 1 })
  expect(res.agents).toBeDefined()
  const arch = res.agents.find(a => a.name === '001-architect')
  expect(arch.role).toBe('architect')
  expect(arch.children).toBeDefined()
  ```

### T-0210-50: status (inspect) handler → model.getStatus
- **Flow**: send `{ type: 'status', napkin: '0100-explore' }` for napkin inspect
- **Subsystems**: socket server, NapModel
- **Expected**: response has napkin phase, agent count, agent statuses
- **Breaks if**: handler confuses old "status" (now "set-status") with new inspect
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'status', id: 1, query: { napkin: '0100-explore' } })
  expect(res.phase).toBe('doing')
  expect(res.agentCount).toBe(2)
  ```

---

## Small tests — message queue (vitest)

Proves: three-step delivery, per-session queuing, rate limiting.

### T-0210-55: poke delivers text → Escape → CR
- **Flow**: enqueue message "hello" → writer receives three writes in order
- **Subsystems**: message queue, pty writer
- **Expected**: writes in order: "hello" (text), "\x1b" (Escape), "\r" (CR). Correct delays between steps.
- **Breaks if**: missing Escape step (autocomplete not dismissed), or missing CR (not submitted)
- **Size**: small
- **Verification**:
  ```
  const writes: string[] = []
  setWriter((id, data) => writes.push(data))

  enqueue('uuid-ta', 'hello')
  await sleep(1000)  // let delivery complete

  expect(writes).toEqual(['hello', '\x1b', '\r'])
  ```

### T-0210-56: multiple poke messages delivered sequentially
- **Flow**: enqueue "msg1" then "msg2" for same session → delivered in order with spacing
- **Subsystems**: message queue per-session queuing
- **Expected**: msg1 three-step completes before msg2 three-step starts. Total writes: 6.
- **Breaks if**: messages interleaved or delivered concurrently
- **Size**: small
- **Verification**:
  ```
  const writes: Array<{ id: string; data: string }> = []
  setWriter((id, data) => writes.push({ id, data }))

  enqueue('uuid-ta', 'msg1')
  enqueue('uuid-ta', 'msg2')
  await sleep(2500)

  // msg1 cycle then msg2 cycle
  expect(writes.map(w => w.data)).toEqual(['msg1', '\x1b', '\r', 'msg2', '\x1b', '\r'])
  ```

### T-0210-57: clearQueue stops pending deliveries
- **Flow**: enqueue two messages → clearQueue after first delivery starts → second message never delivered
- **Subsystems**: message queue cleanup
- **Expected**: only first message's three-step delivered. Second message dropped.
- **Breaks if**: queue not cleared, second message still delivered
- **Size**: small
- **Verification**:
  ```
  enqueue('uuid-ta', 'msg1')
  enqueue('uuid-ta', 'msg2')
  await sleep(500)  // mid-first-delivery
  clearQueue('uuid-ta')
  await sleep(2000)

  // Only msg1's cycle
  expect(writes.filter(w => w.data === 'msg2')).toHaveLength(0)
  ```

---

## Small tests — nap init (vitest)

Proves: init creates correct v3 structure with no SQLite. Tests init on a real tmpDir (init is filesystem-only, no Electron needed).

### T-0210-60: init creates correct directory structure
- **Flow**: run nap init in tmpDir → verify file tree
- **Subsystems**: CLI init command, filesystem
- **Expected**: `.nap/.gitignore` exists with "sock\nui-state.json\n". `.nap/00-org/` exists with files copied from templates. `nepics/01-v1/10-docs/`, `nepics/01-v1/20-architects/001-architect/`, `nepics/01-v1/30-napkins/` exist. No `40-board/`. No `nap.db`.
- **Breaks if**: old v2 structure created (40-board/, nap.db), or missing dirs
- **Size**: small
- **Verification**:
  ```
  // Run init in tmpDir (subprocess or direct function call)
  execSync('nap init', { cwd: tmpDir })

  expect(fs.existsSync(path.join(tmpDir, '.nap', '.gitignore'))).toBe(true)
  expect(fs.readFileSync(path.join(tmpDir, '.nap', '.gitignore'), 'utf8')).toBe('sock\nui-state.json\n')

  expect(fs.existsSync(path.join(tmpDir, '.nap', '00-org'))).toBe(true)
  expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '001-architect'))).toBe(true)
  expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '30-napkins'))).toBe(true)

  // NO old artifacts
  expect(fs.existsSync(path.join(tmpDir, '.nap', 'nap.db'))).toBe(false)
  expect(fs.existsSync(path.join(tmpDir, '.nap', 'nepics', '01-v1', '40-board'))).toBe(false)
  ```

### T-0210-61: init architect stub marker is correct
- **Flow**: run nap init → read `.agent.nap.json`
- **Subsystems**: CLI init command
- **Expected**: marker has `{ cc_session_uuid: <uuid>, role: 'architect', name: '001-architect', nepic: '01-v1', created_at: <number>, started: false }`. No SQLite session ID — cc_session_uuid is a fresh UUID.
- **Breaks if**: marker schema wrong, started not false, nepic missing
- **Size**: small
- **Verification**:
  ```
  execSync('nap init', { cwd: tmpDir })
  const markerPath = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '001-architect', '.agent.nap.json')
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))

  expect(marker.role).toBe('architect')
  expect(marker.name).toBe('001-architect')
  expect(marker.nepic).toBe('01-v1')
  expect(marker.started).toBe(false)
  expect(marker.cc_session_uuid).toMatch(/^[0-9a-f-]{36}$/)
  expect(typeof marker.created_at).toBe('number')
  ```

### T-0210-62: init writes ui-state.json
- **Flow**: run nap init → read ui-state.json
- **Subsystems**: CLI init command
- **Expected**: `{ activeNepicId: '01-v1' }`
- **Breaks if**: missing or wrong activeNepicId
- **Size**: small
- **Verification**:
  ```
  const uiState = JSON.parse(fs.readFileSync(path.join(tmpDir, '.nap', 'ui-state.json'), 'utf8'))
  expect(uiState).toEqual({ activeNepicId: '01-v1' })
  ```

### T-0210-63: init creates prompt.md for architect
- **Flow**: run nap init → check prompt.md exists at architect dir
- **Subsystems**: CLI init command, template copying
- **Expected**: `prompt.md` exists and is non-empty (copied from template)
- **Breaks if**: prompt.md missing — architect starts with no instructions
- **Size**: small
- **Verification**:
  ```
  const promptPath = path.join(tmpDir, '.nap', 'nepics', '01-v1', '20-architects', '001-architect', 'prompt.md')
  expect(fs.existsSync(promptPath)).toBe(true)
  expect(fs.readFileSync(promptPath, 'utf8').length).toBeGreaterThan(0)
  ```

### T-0210-64: init on existing project → error
- **Flow**: run nap init twice in same dir
- **Subsystems**: CLI init guard
- **Expected**: second init fails with "Project already initialized"
- **Breaks if**: init overwrites existing project
- **Size**: small
- **Verification**:
  ```
  execSync('nap init', { cwd: tmpDir })
  expect(() => execSync('nap init', { cwd: tmpDir, stdio: 'pipe' })).toThrow()
  ```

### T-0210-65: init --add-skills copies skills to project .claude/skills/
- **Flow**: run nap init --add-skills → verify skills copied
- **Subsystems**: CLI init, skill installation
- **Expected**: `.claude/skills/napkin/` and `.claude/skills/napkin-format/` exist in project dir
- **Breaks if**: skills not copied, or copied to wrong location
- **Size**: small
- **Verification**:
  ```
  execSync('nap init --add-skills', { cwd: tmpDir })
  expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'napkin'))).toBe(true)
  expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'napkin-format'))).toBe(true)
  ```

---

## Small tests — nap open walk-up (vitest)

### T-0210-68: walk-up finds .nap/ from subdirectory
- **Flow**: create `.nap/` in tmpDir → call findProjectRoot from tmpDir/sub/deep/
- **Subsystems**: walk-up discovery (shared/constants.ts)
- **Expected**: returns tmpDir (the project root with .nap/)
- **Breaks if**: only checks cwd, doesn't walk up
- **Size**: small
- **Verification**:
  ```
  fs.mkdirSync(path.join(tmpDir, '.nap'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'sub', 'deep'), { recursive: true })
  const root = findProjectRoot(path.join(tmpDir, 'sub', 'deep'))
  expect(root).toBe(tmpDir)
  ```

### T-0210-69: walk-up with no .nap/ → null
- **Flow**: call findProjectRoot from tmpDir with no .nap/
- **Subsystems**: walk-up discovery
- **Expected**: returns null
- **Breaks if**: throws instead of returning null, or finds unrelated .nap/
- **Size**: small
- **Verification**:
  ```
  const root = findProjectRoot(tmpDir)
  expect(root).toBeNull()
  ```

---

## Small tests — handler error messages (vitest)

Proves: every command that can fail produces the correct error message per CLI design.

### T-0210-70: start nonexistent agent → "no agent named" with suggestions
- **Flow**: send start for "test-arch" → error with did-you-mean
- **Subsystems**: socket handler, name resolution
- **Expected**: `"no agent named 'test-arch'\n\ndid you mean:\n  001-test-arch"`
- **Breaks if**: generic error, no suggestions
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'start', id: 1, name: 'test-arch' })
  expect(res.error).toBe(true)
  expect(res.message).toContain("no agent named 'test-arch'")
  expect(res.message).toContain('did you mean')
  expect(res.message).toContain('001-test-arch')
  ```

### T-0210-71: start already-running agent → "already running"
- **Flow**: send start for "001-test-arch" (already started+running in F10)
- **Subsystems**: socket handler, model guard
- **Expected**: `"agent '001-test-arch' is already running"`
- **Breaks if**: spawns duplicate pty
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, { type: 'start', id: 1, name: '001-test-arch' })
  expect(res.error).toBe(true)
  expect(res.message).toContain('already running')
  ```

### T-0210-72: create duplicate agent → "already exists"
- **Flow**: create-agent with name that exists in same napkin
- **Subsystems**: socket handler, name uniqueness
- **Expected**: `"agent '001-test-arch' already exists in napkin 0100-explore"`
- **Breaks if**: duplicate created
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, {
    type: 'create-agent', id: 1,
    napkinSlug: '0100-explore', name: '001-test-arch', role: 'test-arch'
  })
  expect(res.error).toBe(true)
  expect(res.message).toContain('already exists')
  ```

### T-0210-73: create-nepic with nonexistent slug format → bad nepic error
- **Flow**: create-agent with --nepic pointing to nonexistent nepic
- **Subsystems**: socket handler, nepic validation
- **Expected**: `"nepic '05-v5' does not exist"`
- **Breaks if**: creates entity in void, no nepic guard
- **Size**: small
- **Verification**:
  ```
  const res = await send(sock, {
    type: 'create-agent', id: 1,
    napkinSlug: '0100-explore', name: 'x', role: 'fs-eng', nepicId: '05-v5'
  })
  expect(res.error).toBe(true)
  expect(res.message).toContain("does not exist")
  ```

---

## Small tests — socket handler → model → bridge snapshot (vitest)

Proves: socket mutations flow through to renderer. The key integration seam.

### T-0210-75: create-napkin → model → bridge snapshot includes new napkin
- **Flow**: wire model to bridge → send create-napkin via socket → bridge snapshot has new napkin
- **Subsystems**: socket handler → NapModel → Bridge
- **Expected**: bridge pushes snapshot with the new napkin in napkins array
- **Breaks if**: handler calls model but onChange doesn't fire, or bridge not wired
- **Size**: small
- **Verification**:
  ```
  let snapshot = null
  bridge.onSnapshot(s => snapshot = s)

  await send(sock, { type: 'create-napkin', id: 1, slug: '0300-deploy', status: 'todo' })
  expect(snapshot.napkins.find(n => n.slug === '0300-deploy')).toBeDefined()
  expect(snapshot.napkins.find(n => n.slug === '0300-deploy').status).toBe('todo')
  ```

### T-0210-76: start → model → bridge snapshot shows running
- **Flow**: send start via socket → bridge snapshot shows agent with running=true
- **Subsystems**: socket handler → NapModel → FakePtySpawner → Bridge
- **Expected**: snapshot has agent with running=true, started=true
- **Breaks if**: model update doesn't propagate through bridge
- **Size**: small
- **Verification**:
  ```
  await send(sock, { type: 'start', id: 1, name: '001-fs-eng', prompt: 'go' })
  const agent = snapshot.napkins
    .flatMap(n => n.agents)
    .find(a => a.name === '001-fs-eng')
  expect(agent.running).toBe(true)
  expect(agent.started).toBe(true)
  ```

### T-0210-77: done → model → bridge snapshot shows done
- **Flow**: send done via socket → bridge snapshot shows agent with done=true
- **Subsystems**: socket handler → NapModel → Bridge
- **Expected**: snapshot has agent with done=true, still running=true
- **Breaks if**: done not reflected in snapshot
- **Size**: small
- **Verification**:
  ```
  await send(sock, { type: 'done', id: 1, sessionId: 'uuid-ta' })
  const agent = snapshot.napkins
    .flatMap(n => n.agents)
    .find(a => a.id === 'uuid-ta')
  expect(agent.done).toBe(true)
  expect(agent.running).toBe(true)
  ```

---

## Medium tests — real CLI → real socket → real Electron (Playwright)

Each medium test runs the real CLI binary as a subprocess, which connects to the real socket server inside Electron. Assertions via `page.evaluate()` on the renderer store + real disk reads.

### T-0210-80: nap create napkin via real CLI → napkin appears in sidebar
- **Flow**: write F10 to tmpDir → launch app → exec `nap create napkin 0300-deploy --status todo` → wait for renderer store to show new napkin
- **Subsystems**: real CLI, real socket, real model, real IPC, real renderer
- **Expected**: renderer store has napkin with slug=0300-deploy, status=todo. CLI stdout is valid JSON with `{ slug, status, dir, nepic }`. Real `.napkin.nap.json` on disk.
- **Breaks if**: CLI can't connect to socket, handler fails, IPC doesn't push, renderer doesn't update
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-40 + T-0210-75
  const cliOutput = execSync('nap create napkin 0300-deploy --status todo', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })
  const json = JSON.parse(cliOutput.toString())
  expect(json.slug).toBe('0300-deploy')

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.some(n => n.slug === '0300-deploy')
  })
  ```

### T-0210-81: nap create agent via real CLI → agent appears in sidebar
- **Flow**: launch app with F10 → `nap create agent 003-test-eng --napkin 0100-explore --role test-eng` → agent visible in renderer
- **Subsystems**: real CLI, real socket, real model, real IPC
- **Expected**: renderer store shows new agent under 0100-explore with started=false
- **Breaks if**: agent not created, or not pushed to renderer
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-41
  const cliOutput = execSync('nap create agent 003-test-eng --napkin 0100-explore --role test-eng', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })
  const json = JSON.parse(cliOutput.toString())
  expect(json.name).toBe('003-test-eng')

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.[0]?.agents?.some(a => a.name === '003-test-eng')
  })
  ```

### T-0210-82: nap start via real CLI → agent shows running in renderer
- **Flow**: launch app with F10 → `nap start 001-fs-eng "read prompt.md"` → renderer shows agent running
- **Subsystems**: real CLI, real socket, real model, real pty spawner
- **Expected**: renderer store shows 001-fs-eng with running=true
- **Breaks if**: pty not spawned, or running flag not pushed to renderer
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-44 + T-0210-76
  execSync('nap start 001-fs-eng "read prompt.md"', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    const agents = s?.napkins?.flatMap(n => n.agents) || []
    return agents.some(a => a.name === '001-fs-eng' && a.running)
  })
  ```

### T-0210-83: nap done via real CLI → dot turns blue (done=true)
- **Flow**: launch app with F10, start agents → exec `nap done` with NAP_SESSION_ID=uuid-ta → renderer shows agent done
- **Subsystems**: real CLI, real socket, real model
- **Expected**: renderer store shows agent uuid-ta with done=true, still running=true
- **Breaks if**: NAP_SESSION_ID not read from env, or done not reflected
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-45 + T-0210-77
  execSync('nap done', { cwd: tmpDir, env: { NAP_SOCKET: sockPath, NAP_SESSION_ID: 'uuid-ta' } })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    const agents = s?.napkins?.flatMap(n => n.agents) || []
    return agents.some(a => a.id === 'uuid-ta' && a.done)
  })
  ```

### T-0210-84: nap set-status via real CLI → phase label changes in renderer
- **Flow**: launch app with F10 → `nap set-status 0100-explore review` → renderer shows new status
- **Subsystems**: real CLI, real socket, real model
- **Expected**: renderer store shows napkin 0100-explore with status=review
- **Breaks if**: status not persisted through socket→model→bridge→renderer
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-47
  execSync('nap set-status 0100-explore review', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.napkins?.some(n => n.slug === '0100-explore' && n.status === 'review')
  })
  ```

### T-0210-85: nap ps via real CLI → correct tree output
- **Flow**: launch app with F10, start agents → `nap ps --json` → parse JSON output
- **Subsystems**: real CLI, real socket
- **Expected**: JSON contains all agents with correct NAME, STATUS, NAPKIN, ROLE columns
- **Breaks if**: tree structure wrong, missing agents, wrong status
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-49
  const output = execSync('nap ps --json', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })
  const agents = JSON.parse(output.toString())
  expect(agents.find(a => a.name === '001-architect')).toBeDefined()
  expect(agents.find(a => a.name === '001-test-arch').status).toMatch(/running/)
  ```

### T-0210-86: nap stop via real CLI → agent stops, won't resume on restart
- **Flow**: launch app with F10, start agents → `nap stop 001-test-arch` → renderer shows exited → quit → relaunch → agent NOT resumed
- **Subsystems**: real CLI, real socket, real pty, survivability
- **Expected**: after stop, renderer shows exited. After relaunch, agent still exited (not resumed).
- **Breaks if**: exited flag not written to marker, or agent resumes despite exited
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-46
  execSync('nap stop 001-test-arch', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    const agents = s?.napkins?.flatMap(n => n.agents) || []
    return agents.some(a => a.name === '001-test-arch' && a.exited)
  })

  // Verify marker on disk
  const marker = JSON.parse(fs.readFileSync(taMarkerPath, 'utf8'))
  expect(marker.exited).toBe(true)
  ```

### T-0210-87: nap status (inspect) via real CLI → correct output
- **Flow**: launch app with F10 → `nap status --napkin 0100-explore --json` → parse output
- **Subsystems**: real CLI, real socket, real model
- **Expected**: output contains napkin phase, agent count, per-agent statuses
- **Breaks if**: inspect command confused with set-status, or wrong data returned
- **Size**: medium
- **Verification**:
  ```
  // Equivalent to small T-0210-50
  const output = execSync('nap status --napkin 0100-explore --json', { cwd: tmpDir, env: { NAP_SOCKET: sockPath } })
  const status = JSON.parse(output.toString())
  expect(status.phase).toBe('doing')
  expect(status.agentCount).toBe(2)
  ```

### T-0210-88: nap init → nap open → architect starts → sidebar shows it
- **Flow**: nap init in tmpDir → nap open → wait for app to start → sidebar shows 001-architect running
- **Subsystems**: real CLI init, real CLI open, real Electron, STOP→RUN Case C
- **Expected**: app launches, model reads markers, Case C starts architect (fresh). Sidebar shows architect with running=true.
- **Breaks if**: init creates wrong markers, open can't find .nap/, Case C doesn't fire
- **Size**: medium
- **Verification**:
  ```
  execSync('nap init', { cwd: tmpDir })
  // Launch via test helper (not nap open, to get Playwright handle)
  app = await launchApp(tmpDir)
  page = await app.firstWindow()

  await page.waitForFunction(() => {
    const s = window.__napStore__?.getState()
    return s?.architects?.some(a => a.name === '001-architect' && a.running)
  }, { timeout: 10000 })
  ```

### T-0210-89: nap create napkin → nap create agent → nap start → nap done → nap nap returns
- **Flow**: full architect workflow via real CLI. Create napkin, create agent, populate prompt.md, start agent, agent calls done, nap nap completes.
- **Subsystems**: all CLI commands end-to-end, socket server, model, pty
- **Expected**: each command succeeds. nap nap exits with code 0 after done signal received.
- **Breaks if**: any command in the chain fails, or nap nap doesn't detect done
- **Size**: medium
- **Verification**:
  ```
  // Create napkin
  execSync('nap create napkin 0300-test --status doing', { cwd: tmpDir, env })

  // Create agent
  const agentJson = execSync('nap create agent 001-ta --napkin 0300-test --role test-arch', { cwd: tmpDir, env })
  const agent = JSON.parse(agentJson.toString())

  // Write prompt.md into agent dir
  fs.writeFileSync(path.join(agent.dir, 'prompt.md'), 'echo test')

  // Start agent (with NAP_TEST=1, spawns cat instead of claude)
  execSync(`nap start 001-ta "read prompt.md"`, { cwd: tmpDir, env })

  // Simulate done from agent's perspective
  execSync('nap done', { cwd: tmpDir, env: { ...env, NAP_SESSION_ID: agent.id } })

  // nap nap should return immediately (agent already done)
  execSync('nap nap 001-ta --timeout 5', { cwd: tmpDir, env })
  // No error = test passes
  ```

---

## Equivalence map

| Journey | Small test | Medium test | Shared assertion |
|---------|-----------|-------------|------------------|
| Create napkin | T-0210-40, T-0210-75 | T-0210-80 | napkin in model, in renderer, on disk |
| Create agent | T-0210-41 | T-0210-81 | agent in model + renderer, started=false |
| Start agent | T-0210-44, T-0210-76 | T-0210-82 | pty spawned, running=true in renderer |
| Done signal | T-0210-45, T-0210-77 | T-0210-83 | done=true, running=true (still alive) |
| Set status | T-0210-47 | T-0210-84 | napkin status updated everywhere |
| List agents | T-0210-49 | T-0210-85 | tree structure with all agents |
| Stop agent | T-0210-46 | T-0210-86 | exited=true, won't resume |
| Status inspect | T-0210-50 | T-0210-87 | correct data shape |
| Init → Open | T-0210-60..65 | T-0210-88 | correct markers, architect starts |
| Full workflow | T-0210-40..50 combined | T-0210-89 | create → start → done → nap returns |

---

## What's NOT tested here (and why)

- **peek / log** — these require IPC to the renderer. The socket→IPC→renderer seam is the same pattern as snapshot push (already tested in 0100/0150). Small tests can verify the handler sends the right IPC message. Medium tests verify the round-trip. But detailed xterm buffer reading is 0400 territory.
- **poke end-to-end** — message queue unit tests (T-0210-55..57) cover the three-step delivery. Real pty interaction (does Escape actually dismiss autocomplete in Claude?) is manual testing.
- **nap open detached spawn** — testing Electron spawn from CLI is platform-specific and fragile. Medium tests use `launchApp()` helper directly. The walk-up logic is tested (T-0210-68..69).
- **Cross-nepic operations** — T-0210-13 covers nepic scoping in name resolution. Full cross-nepic create/start flows are an edge case for a later napkin when multi-nepic is real.
- **Visual correctness** — sidebar rendering from snapshots is tested in 0100. 0210 doesn't add new UI.
- **CLI arg parsing edge cases** — flag parsing is inherited from v2 with minimal changes. Not a risk seam.

---

## Test infrastructure the fs-eng must build

1. **Socket server** — port from v2, adapt handler signature for v3 model methods. Module: `packages/v3/src/main/socket-server.ts`.

2. **Request handler** — routes socket requests to model methods. Module: `packages/v3/src/main/socket-handler.ts`. Depends on model, ptySpawner, bridge.

3. **Name resolver** — port from v2, adapt for model. Module: `packages/v3/src/main/name-resolver.ts`. Pure function: `resolveByName(agents, name)`.

4. **Message queue** — port from v2. Module: `packages/v3/src/main/message-queue.ts`. Wire to ptySpawner.write().

5. **New model methods** — `createNapkin`, `createAgentStub`, `createArchitectStub`, `createNepic`, `startAgentByName`, `getStatus`, `getAllAgentsTree`. All on the existing NapModel interface.

6. **Protocol types update** — extend `packages/v3/src/shared/protocol.ts` with new request types: `CreateNapkinRequest`, `CreateAgentRequest`, `CreateArchitectRequest`, `CreateNepicRequest`, `SetStatusRequest`, `StatusInspectRequest`, `StopRequest`.

7. **CLI rewrite** — `packages/v3/src/cli/nap.ts` rewritten to match approved CLI design.

8. **Walk-up project root discovery** — extend `findSocketPath` or add `findProjectRoot` to `packages/v3/src/shared/constants.ts`.

9. **Test fixtures** — F10 (CLI integration), F11 (empty nepic) added to `packages/v3/tests/fixtures.ts`.

10. **Medium test helper** — extend `packages/v3/tests/helpers.ts` with `execNap(command, opts)` that runs the CLI binary as a subprocess with correct env vars (NAP_SOCKET, NAP_TEST, etc).
