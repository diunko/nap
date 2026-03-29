## 0200 — survivability: fs-eng response

### What was built

**Model expansion** (`bridge-types.ts`, `model.ts`):
- AgentState: added id, nepicId, napkinId, parentName, parentId, started, running, done, homePath
- NapkinState: added id, nepicId, path
- Model reads new marker fields (parent, parent_id, started, nepic, napkin)
- New methods: getAllAgents, setAgentExitedById, setAgentRunning, setAgentDone, setAgentStarted
- Old methods preserved — setAgentExited(slug, name) still works for backward compat

**Resume decision function** (`resume.ts`):
- `computeResumeActions(agents)` — pure function, three cases:
  - Case A (started + !exited): `--resume <uuid>`
  - Case B (exited): skip
  - Case C (!started): `--session-id <uuid> "read prompt.md..."`

**FakePtySpawner** (`pty-spawner.ts`):
- PtySpawner interface with spawn, kill, killAll, onExit, clearExitHandlers
- FakePtySpawner records calls, supports simulateExit (async/awaitable)

**Coordinators** (`coordinators.ts`):
- `startAgents(model, ptySpawner)`: computes resume actions, spawns ptys, wires exit handlers, writes started=true for Case C
- `stopApp(model, ptySpawner, uiState?)`: clears exit handlers before killing (v3's answer to v2's appIsClosing), kills ptys, saves UI state

**Fixtures** (`fixtures.ts`, `helpers.ts`):
- F8: survivability fixture — exercises all three agent cases (resume, skip, fresh) + architect
- F9: all-exited fixture — every agent exited, zero ptys should spawn

**Tests** (`survivability.test.ts`):
- 28 small tests covering: full entity shapes (T-0200-01 to 04), resume decisions (T-0200-10 to 14), startAgents with FakePtySpawner (T-0200-20 to 24), stopApp/RUN→STOP (T-0200-30 to 34), runtime agent exit (T-0200-40 to 42), done signal (T-0200-43 to 46), journey tests (T-0200-50 to 52)

### Decisions

- **In-memory first, disk second**: setAgentExitedById updates in-memory state and calls notify() synchronously, then writes marker async. This ensures tests can check model state immediately after simulateExit.
- **clearExitHandlers before killAll**: v3's clean alternative to v2's appIsClosing flag. Exit callbacks are simply removed before ptys are killed during quit — no marker mutations on quit.
- **nepicId from markers**: The nepicId comes from the marker's `nepic` field, not from the directory path. This keeps test fixtures self-contained (NEPIC_DIR='nepic' but nepicId='test-nepic').
- **ccSessionUuid → id**: Renamed the field. Updated 4 lines in model.test.ts. All 0100/0150 tests still pass.

### Test results

- 66 small tests pass (vitest) — 38 existing + 28 new
- 8 medium tests pass (Playwright) — all existing 0100/0150 medium tests
- tsc --noEmit: zero type errors

### What's NOT built (deferred per spec)

- Real PtySpawner (node-pty integration) — needed for medium 0200 tests, deferred to when main.ts wiring is done
- Terminal registry, Terminal component, preload pty channels — 0300/0400 scope
- Medium survivability tests (T-0200-60 to 64) — require real pty spawning infrastructure
