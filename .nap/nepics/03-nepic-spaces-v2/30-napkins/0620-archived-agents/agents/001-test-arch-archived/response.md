## Test architecture for 0620 — archived agents

### What I read

- Napkin, spec, user stories (6 stories)
- All v3 source: model.ts, coordinators.ts, resume.ts, pty-spawner.ts, node-pty-spawner.ts, bridge-types.ts, dot-style.ts, Sidebar.tsx, Terminal.tsx, nap.ts CLI
- All v3 tests: fixtures, model, survivability, bridge, journey tests
- v2 resume fallback pattern (main.ts:189-199)
- Bug bash learnings (race conditions, persistence gaps, test derivation from code vs spec)
- Promise doc

### Test design: 31 test cases

Written to `0620-archived-agents.test.md`. Eight sections:

1. **Model layer (5 tests)** — archived flag loaded, defaults, survives reload, in snapshot, in getStatus
2. **Resume logic — Path A (4 tests)** — computeResumeActions skips archived, no pty spawned, mixed fixture, architects too
3. **Resume failure — Path B (5 tests)** — fast exit + message detection, timing boundary, fresh vs resume, message-only vs timing-only, v2 parity
4. **Successor flow (7 tests)** — prompt shown on click, prompt shown on resume fail, spawn with new UUID, prompt content, UUID replacement, can nap done, resumes after restart
5. **Dot style (3 tests)** — gray hollow for archived, "archived" label, clickable
6. **import-agents CLI (8 tests)** — scan logic, marker fields, role inference, architect dirs, skip existing, skip empty, no socket, appears in sidebar
7. **Journey tests (4 tests)** — import→click→successor, resume fail→successor, mixed 10-agent project, context sufficiency
8. **Regression/safety (3 tests)** — backward compat, done+archived impossible, homePath preserved

### Key seams identified

Five critical integration points where bugs are most likely — documented at the bottom of the test doc:

1. **Resume logic ordering** — archived must be checked BEFORE started/exited in computeResumeActions, or archived+started agents get resumed
2. **Fast exit heuristic** — requires BOTH timing (<5s) AND output message ("No conversation found"), either alone is a false positive
3. **Sidebar click handler** — current guard `if (agent.started)` blocks archived agents, must be relaxed
4. **UUID replacement atomicity** — marker write + model reload race if not using hasPendingWrite guard
5. **Role inference regex** — multi-segment roles (test-arch, fs-eng) need the right split point

### Fixture needs

The fs-eng will need:
- **F16: archived agent fixture** — agent with archived:true in napkin + archived architect
- **F17: import candidates fixture** — dirs with prompt.md/response.md but no markers
- **F18: mixed lifecycle fixture** — 10 agents: 6 alive, 2 will-fail-resume, 2 archived (for story 5 journey test)

### Lessons from bug bash applied

From the 0220 debug session learnings:
- Tests derived from **spec requirements**, not code behavior — the "Done is NOT persisted" mistake won't repeat
- State matrix coverage: archived × started × exited × done — all valid combinations tested
- Medium tests needed for cross-IPC flows (click→successor, resume fail→prompt display)
- Timing-sensitive detection (Path B) tested with both FakePtySpawner (small) and ideally NodePtySpawner (medium) for confidence

### Size distribution

24 small / 7 medium / 0 big. No big tests needed — this feature doesn't introduce new external protocols or full-app flows beyond what medium tests cover.
