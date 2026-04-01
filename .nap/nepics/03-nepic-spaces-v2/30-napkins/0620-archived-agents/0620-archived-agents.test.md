## 0620 — archived agents: test cases

### Naming: T-0620-NN

---

### I. Model layer — `archived` flag

**T-0620-01 — Archived flag loaded from marker**
- Flow: loadFromFilesystem reads `archived: true` from .agent.nap.json
- Subsystems: model.ts → loadAgents
- Expected: agent.archived === true after load
- Breaks if: marker field not read, defaults to false/undefined
- Size: small
- Verification: create archived fixture, load model, assert agent.archived === true

**T-0620-02 — Archived flag defaults to false when absent**
- Flow: existing markers without `archived` field → backward compatible
- Subsystems: model.ts → loadAgents
- Expected: agent.archived === false for all existing fixtures
- Breaks if: default not set, undefined leaks into state
- Size: small
- Verification: load any existing fixture (F1, F2), assert every agent.archived === false

**T-0620-03 — Archived flag survives filesystem reload**
- Flow: agent is archived → watcher triggers reload → archived still true
- Subsystems: model.ts → loadFromFilesystem, ephemeral state vs disk
- Expected: archived read from disk, not ephemeral — always correct after reload
- Breaks if: archived stored ephemerally instead of being read from disk marker
- Size: small
- Verification: create archived fixture, load model, load again (simulates watcher), assert archived still true

**T-0620-04 — Archived in bridge snapshot**
- Flow: model → bridge → snapshot → renderer sees archived flag
- Subsystems: bridge-types.ts (AgentState), bridge.ts
- Expected: snapshot includes archived field for each agent
- Breaks if: AgentState type not updated, field dropped during serialization
- Size: small
- Verification: wire model to FakeBridge, load archived fixture, assert snapshot agent has archived: true

**T-0620-05 — Archived flag in getAllAgents and getStatus**
- Flow: getStatus() for archived agent includes archived field
- Subsystems: model.ts → getStatus, getAllAgentsTree
- Expected: status response includes archived flag; agentStatus() returns 'archived' for archived agents
- Breaks if: getStatus doesn't include new field, tree status logic doesn't handle archived
- Size: small
- Verification: load archived fixture, call getStatus({ agent: '...' }), assert archived is present

---

### II. Resume logic — Path A (archived flag skips resume)

**T-0620-10 — Archived agent skipped by computeResumeActions**
- Flow: agent has archived: true → resume.ts classifies as skip
- Subsystems: resume.ts → computeResumeActions
- Expected: action === 'skip' for archived agents, regardless of started/exited
- Breaks if: resume logic only checks exited, not archived
- Size: small
- Verification: create agents with various (started, exited, archived) combos, assert all archived → skip

**T-0620-11 — Archived agent: no pty spawned on startAgents**
- Flow: startAgents skips archived → no spawn call
- Subsystems: coordinators.ts → startAgents, resume.ts
- Expected: FakePtySpawner.spawned has no entry for archived agent
- Breaks if: startAgents doesn't propagate skip decision for archived
- Size: small
- Verification: load fixture with 1 archived + 1 normal, startAgents, assert only normal agent spawned

**T-0620-12 — Mixed fixture: archived + alive + exited + fresh — correct resume decisions**
- Flow: all four agent states present, each gets correct action
- Subsystems: resume.ts, coordinators.ts
- Expected: archived → skip, alive (started+!exited) → resume, exited → skip, fresh → fresh
- Breaks if: archived handling interferes with other cases
- Size: small
- Verification: create 4-agent fixture, compute resume actions, assert each classification correct

**T-0620-13 — Archived architect also skipped**
- Flow: architect with archived: true → skip (same rule, no special case)
- Subsystems: resume.ts (architects go through same computeResumeActions)
- Expected: archived architect skipped
- Breaks if: architect resume has separate code path that doesn't check archived
- Size: small
- Verification: add archived architect to fixture, assert skip

---

### III. Resume failure detection — Path B

**T-0620-20 — Fast exit + "No conversation found" → agent marked for successor**
- Flow: pty spawns with --resume, exits within 5s, output has "No conversation found with session ID: ..."
- Subsystems: coordinators.ts or pty-spawner layer, model.ts
- Expected: agent.archived set to true (or a new "deadSession" flag), successor prompt triggered
- Breaks if: exit timing not tracked, output buffer not checked, threshold wrong
- Size: small (with FakePtySpawner)
- Verification: simulate resume spawn, emit "No conversation found" to output, simulateExit within 5s, assert agent flagged

**T-0620-21 — Slow exit (>5s) does NOT trigger successor**
- Flow: pty spawns with --resume, runs for >5s, then exits
- Subsystems: coordinators.ts / pty-spawner timing logic
- Expected: normal exit flow — agent marked exited, not archived/successor
- Breaks if: timing check uses wrong direction (< vs >)
- Size: small
- Verification: simulate resume spawn, wait or mock time past 5s, exit, assert normal exited flow

**T-0620-22 — Fresh start exit does NOT trigger successor (even if fast)**
- Flow: --session-id (not --resume) exits in 2s
- Subsystems: coordinators.ts — must distinguish resume from fresh
- Expected: normal exit — this was a first start that failed, not a dead session
- Breaks if: detection doesn't check whether command was --resume
- Size: small
- Verification: start fresh agent, simulateExit in 2s, assert normal exited (not successor)

**T-0620-23 — Resume exit without "No conversation found" → normal exit**
- Flow: --resume exits in 3s but output is "Connection refused" or empty
- Subsystems: coordinators.ts — both timing AND message required
- Expected: normal exited flow, not successor
- Breaks if: only timing checked, message not verified
- Size: small
- Verification: simulate resume, inject different error to buffer, fast exit, assert not successor

**T-0620-24 — v2 fallback pattern parity: same detection heuristic**
- Flow: v2's `main.ts:191` checks `Date.now() - architectResumeTime < 5000` — v3 must use equivalent
- Subsystems: coordinators.ts or node-pty-spawner.ts
- Expected: 5-second threshold, resume command check
- Breaks if: threshold different from v2, regression
- Size: small
- Verification: this is a design constraint test — verify the constants and logic match v2's pattern

---

### IV. Successor flow

**T-0620-30 — Archived agent click → successor prompt shown**
- Flow: renderer clicks archived agent → terminal area shows "session expired — invoke a successor?"
- Subsystems: renderer (Terminal.tsx/Sidebar.tsx) → IPC → main
- Expected: clickable message in terminal area, not empty black
- Breaks if: click handler doesn't check archived flag, falls through to empty terminal
- Size: medium (needs real renderer to verify DOM)
- Verification: app.evaluate loads archived fixture, page.evaluate clicks agent, assert terminal area contains successor prompt text

**T-0620-31 — Resume failure → successor prompt shown (same as archived click)**
- Flow: Path B detection → terminal shows successor prompt (same flow as Path A click)
- Subsystems: main → pty-spawner detection → IPC → renderer
- Expected: after fast resume failure, terminal area shows successor prompt
- Breaks if: detection fires but doesn't push successor state to renderer
- Size: medium
- Verification: boot app with started agent, simulate resume failure via test-mode pty, verify terminal area shows prompt

**T-0620-32 — Successor spawn: fresh Claude with generated prompt**
- Flow: user accepts successor → main spawns `claude --session-id <new-uuid> "<generated-prompt>"`
- Subsystems: main → pty-spawner, model.ts (new UUID)
- Expected: pty spawn with new UUID, generated prompt as first message, includes role/prompt.md/response.md/napkin context
- Breaks if: prompt written to file instead of sent as message, wrong UUID used
- Size: small (test the prompt generation and spawn command, not the renderer)
- Verification: trigger successor for archived agent, assert ptySpawner.spawned has new UUID + correct prompt content

**T-0620-33 — Successor prompt content: all required context**
- Flow: generated prompt must include role path, prompt.md, response.md, napkin .nap.md
- Subsystems: successor prompt generator (new code)
- Expected: prompt mentions all four pieces of context
- Breaks if: any context omitted, paths wrong
- Size: small
- Verification: call prompt generator with agent data, assert output contains all four context references

**T-0620-34 — After successor spawn: new UUID replaces old**
- Flow: model updates marker — new UUID, archived=false, done=true, exited=false
- Subsystems: model.ts
- Expected: marker on disk has new UUID; old UUID no longer in model; agent is regular
- Breaks if: old UUID left in marker, model not notified
- Size: small
- Verification: trigger successor, read marker from (Memory)FS, assert new UUID, archived=false

**T-0620-35 — Successor agent can nap done**
- Flow: successor is a regular agent → can call nap done → done=true
- Subsystems: model.ts → setAgentDone, socket-handler
- Expected: done signal works normally on successor
- Breaks if: something in successor state prevents done signal
- Size: small
- Verification: spawn successor, call setAgentDone(newUuid), assert done=true

**T-0620-36 — Successor agent resumes normally after restart**
- Flow: successor has valid UUID → app restart → resumed with --resume
- Subsystems: resume.ts, coordinators.ts
- Expected: after successor + quit + restart, agent resumes normally
- Breaks if: archived flag not cleared, or UUID not properly written
- Size: small
- Verification: spawn successor, stopApp, reload model, computeResumeActions → action === 'resume'

---

### V. Dot style — archived visual

**T-0620-40 — dotStyle returns gray hollow for archived agents**
- Flow: dot-style.ts with archived input
- Subsystems: dot-style.ts → dotStyle()
- Expected: color = gray (#6b7280), shape = 'hollow' (same as exited)
- Breaks if: DotInput doesn't include archived field, dotStyle doesn't handle it
- Size: small
- Verification: call dotStyle({ role: 'fs-eng', running: false, done: false, exited: false, archived: true }), assert gray + hollow

**T-0620-41 — Sidebar shows "archived" label for archived agent**
- Flow: Sidebar.tsx → agent status label
- Subsystems: renderer → Sidebar
- Expected: label text is "archived" (not "exited" or "wait")
- Breaks if: label logic only checks exited/done/running, not archived
- Size: medium
- Verification: page.evaluate with archived fixture, find agent status label, assert text === "archived"

**T-0620-42 — Archived dot is clickable (triggers successor flow)**
- Flow: clicking archived dot or card → switches to that agent's terminal area
- Subsystems: Sidebar.tsx → onClick, store.ts
- Expected: click sets active terminal to archived agent, showing successor prompt
- Breaks if: click handler skips agents that aren't started (current code: `if (agent.started) setActiveTerminal(agent.id)`)
- Size: medium
- Verification: page.evaluate clicks archived agent card, assert activeTerminalId changes

---

### VI. import-agents CLI command

**T-0620-50 — Basic scan: finds agent dirs with prompt.md but no marker**
- Flow: nap3 import-agents scans 30-napkins/*/agents/*/ for dirs with prompt.md/response.md but no .agent.nap.json
- Subsystems: CLI (nap.ts) → filesystem
- Expected: each qualifying dir gets a .agent.nap.json created
- Breaks if: scan logic wrong, misses dirs, or processes dirs that already have markers
- Size: small (filesystem-only, use MemoryFS or tmpdir)
- Verification: create dir structure with 3 agent dirs (2 without markers, 1 with), run import, assert exactly 2 markers created

**T-0620-51 — Marker fields correct: UUID, role, archived, started**
- Flow: created marker has correct fields
- Subsystems: CLI import-agents
- Expected: cc_session_uuid is a valid UUID, role inferred from dir name, archived=true, started=false, name=dir name, napkin/nepic slugs correct
- Breaks if: UUID missing, role inference wrong, archived not set
- Size: small
- Verification: run import, read created marker JSON, assert all fields

**T-0620-52 — Role inference from dir name convention**
- Flow: 001-test-arch → test-arch, 002-fs-eng → fs-eng, 001-architect → architect
- Subsystems: CLI import-agents role parser
- Expected: numeric prefix stripped, remainder is role
- Breaks if: regex doesn't handle all name patterns, multi-dash roles (test-arch) broken
- Size: small
- Verification: test role inference with various dir names: 001-test-arch, 002-fs-eng, 003-reviewer, 001-fs-eng-debug

**T-0620-53 — Architect dirs scanned too (20-architects/)**
- Flow: import-agents also checks 20-architects/*/ for dirs without markers
- Subsystems: CLI import-agents
- Expected: architect dirs without markers get archived markers with role=architect
- Breaks if: only 30-napkins scanned, architects missed
- Size: small
- Verification: create structure with architect dir without marker + prompt.md, import, assert marker created with role=architect

**T-0620-54 — Dirs with existing markers NOT touched**
- Flow: dir already has .agent.nap.json → import skips it
- Subsystems: CLI import-agents
- Expected: existing marker unchanged
- Breaks if: import overwrites existing markers, destroying UUID/state
- Size: small
- Verification: create dir with existing marker, import, read marker, assert unchanged

**T-0620-55 — Dirs without prompt.md or response.md skipped**
- Flow: dir exists but has no prompt.md or response.md → not an agent dir
- Subsystems: CLI import-agents
- Expected: no marker created for empty dirs
- Breaks if: import creates markers for any subdir regardless of content
- Size: small
- Verification: create agent dir with only .placeholder, import, assert no marker created

**T-0620-56 — import-agents runs without app (no socket required)**
- Flow: CLI command works standalone, no running Electron app needed
- Subsystems: CLI nap.ts
- Expected: command reads/writes filesystem directly, doesn't connect to socket
- Breaks if: command tries socket connection and fails when app isn't running
- Size: small
- Verification: run import-agents without starting socket server, assert success (no connection error)

**T-0620-57 — Imported agents appear in sidebar after app launch**
- Flow: import-agents → open app → sidebar shows archived agents
- Subsystems: CLI → filesystem → model → bridge → renderer
- Expected: all imported agents visible with archived dot style
- Breaks if: model doesn't load archived agents, or bridge doesn't include them
- Size: medium
- Verification: create fixture with imported markers, boot app, assert sidebar shows agents with archived dots

---

### VII. Journey tests (cross-cutting)

**T-0620-60 — Journey: import → open → click archived → successor → regular agent**
- Flow: story 1+2+3 end-to-end — the full happy path
- Subsystems: CLI, model, bridge, renderer, pty-spawner
- Expected: import creates markers → app shows archived dots → click shows successor prompt → accept → fresh Claude → agent is regular → can nap done
- Breaks if: any link in the chain breaks
- Size: medium
- Verification: full journey via page.evaluate + app.evaluate, check each transition point

**T-0620-61 — Journey: resume fails → successor → regular agent**
- Flow: story 4 — app restart, resume fails, successor invoked
- Subsystems: model, coordinators, pty-spawner (timing detection), renderer
- Expected: start with alive agent → quit → restart → resume fails → successor prompt → accept → regular agent
- Breaks if: detection logic, successor prompt display, or UUID replacement broken
- Size: medium
- Verification: boot with started agent, force resume failure, verify successor prompt, accept, verify regular agent state

**T-0620-62 — Journey: mixed project — 6 alive, 2 failed resume, 2 imported archived**
- Flow: story 5 — sidebar shows the correct mix
- Subsystems: model, coordinators, renderer (Sidebar)
- Expected: 6 agents running (green dots), 2 show successor prompt (gray → successor), 2 show archived (gray hollow)
- Breaks if: one category bleeds into another, counts wrong
- Size: medium (small if only testing model/resume layer without renderer)
- Verification: load 10-agent fixture, startAgents, force 2 exits, assert spawn counts + model states

**T-0620-63 — Journey: successor has enough context to answer questions**
- Flow: story 6 — verify the generated prompt is sufficient
- Subsystems: successor prompt generator
- Expected: prompt references prompt.md, response.md, napkin .nap.md, role file
- Breaks if: paths wrong, context missing
- Size: small (pure function test on prompt generator)
- Verification: generate prompt for known agent, assert all 4 context references present

---

### VIII. Regression / safety

**T-0620-70 — Existing tests unbroken: archived=undefined treated as false**
- Flow: all existing fixtures have no `archived` field → backward compatible
- Subsystems: model.ts, resume.ts, dot-style.ts
- Expected: all existing test suites pass without modification (except adding archived:false to type checks)
- Breaks if: archived defaults to undefined instead of false, causes truthiness bugs
- Size: small
- Verification: run existing test suites — they should pass as-is after the feature lands

**T-0620-71 — done+archived is an invalid combination — not reachable**
- Flow: an agent should never be both done and archived
- Subsystems: model.ts — state transitions
- Expected: successor clears archived when spawning; import never sets done
- Breaks if: state machine allows done+archived, causes confusing UI
- Size: small
- Verification: assert that after successor spawn, archived=false AND done=true; assert import marker has done=false (or absent)

**T-0620-72 — Archived agent's homePath preserved after import**
- Flow: import-agents creates marker in existing dir — dir content (prompt.md, response.md) untouched
- Subsystems: CLI import-agents
- Expected: marker added, no other files modified or deleted
- Breaks if: import overwrites or removes existing files
- Size: small
- Verification: create dir with prompt.md + response.md, import, assert both files still exist with original content

---

### Test size summary

| Size   | Count | Tests |
|--------|-------|-------|
| Small  | 24    | T-0620-01 through -05, -10 through -13, -20 through -24, -32 through -36, -40, -50 through -56, -63, -70 through -72 |
| Medium | 7     | T-0620-30, -31, -41, -42, -57, -60, -61, -62 |

### Seams most likely to break

1. **Resume logic (T-0620-10)**: `computeResumeActions` must check archived BEFORE the started/exited logic. If archived is checked after started, an archived+started agent would be resumed instead of skipped.

2. **Fast exit detection timing (T-0620-20-24)**: The 5-second window + output buffer check is a heuristic. Must require BOTH timing AND message match — either alone produces false positives.

3. **Sidebar click handler (T-0620-42)**: Current code: `if (agent.started) setActiveTerminal(agent.id)`. Archived agents have started=false — this click guard must be relaxed to also allow archived agents.

4. **UUID replacement (T-0620-34)**: The successor flow must atomically replace the old UUID with a new one in the marker file. If the model reloads between write and update, the agent could temporarily disappear.

5. **Import role inference (T-0620-52)**: Multi-segment roles (test-arch, fs-eng) require stripping exactly the numeric prefix + first dash. Getting the regex wrong silently produces wrong roles.
