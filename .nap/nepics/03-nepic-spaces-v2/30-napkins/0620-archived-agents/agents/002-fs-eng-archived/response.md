## 0620 — archived agents: implementation summary

### What was built

Full implementation of the archived agents feature across all v3 layers:

**Model layer** (`bridge-types.ts`, `model.ts`)
- `AgentState.archived: boolean` — loaded from marker, defaults false
- `setAgentArchived()` — persists flag + clears running state
- `spawnSuccessor()` — replaces UUID, spawns fresh Claude, clears archived
- `generateSuccessorPrompt()` — builds handoff context with role, prompt.md, response.md, napkin .nap.md
- `getStatus()` and `getAllAgentsTree()` expose archived field

**Resume logic** (`resume.ts`)
- `computeResumeActions` checks archived BEFORE started/exited — archived always skips
- This was the TA's #1 critical seam — archived+started agents won't be accidentally resumed

**Resume failure detection** (`coordinators.ts`, `pty-spawner.ts`, `node-pty-spawner.ts`)
- Track resume spawn times, detect fast exit (<5s) + "No conversation found" in output
- Both timing AND message required — matches v2 pattern (main.ts:191)
- `FakePtySpawner` extended with output buffer + spawn time simulation
- `NodePtySpawner` preserves output buffer through exit handler for detection

**Dot style** (`dot-style.ts`)
- `DotInput.archived?: boolean`
- Archived → gray (#6b7280) + hollow (same as exited)
- Checked before exited — takes precedence

**Sidebar** (`Sidebar.tsx`)
- Click guard relaxed: `agent.started || agent.archived` allows clicking archived agents
- Label shows 'archived' for archived agents
- Extended view shows [terminal] entry for archived agents
- Both NapkinCard and ArchitectCard handle archived

**Terminal** (`Terminal.tsx`)
- `SuccessorPrompt` component: "Session expired — invoke a successor?"
- Shows when active terminal is an archived agent
- Click → IPC → `spawnSuccessor` → switch to new terminal

**IPC** (`main.ts`, `preload.ts`, `index.tsx`)
- `agent:spawn-successor` IPC handler
- `pty:resume` skips archived agents
- Window type extended with `spawnSuccessor`

**CLI** (`nap.ts`)
- `nap3 import-agents <nepic-dir>` command
- Scans `30-napkins/*/agents/*/` and `20-architects/*/`
- Creates markers with `archived:true`, role inferred from dir name
- Runs without app (filesystem only, no socket)

**Test fixtures** (`fixtures.ts`)
- F16: archived agent + archived architect
- F17: import candidates (mixed dirs with/without markers)
- F18: mixed lifecycle (10 agents across all states)

### Test results

- **177 small tests pass** (150 existing + 27 new)
- **29 medium tests pass** (all existing, unchanged)
- **0 type errors** (`tsc --noEmit`)

### 27 new tests (T-0620-xx)

| Section | Tests |
|---------|-------|
| I. Model layer | 01–05 (5 tests) |
| II. Resume Path A | 10–13 (4 tests) |
| III. Resume Path B | 20–24 (5 tests) |
| IV. Successor flow | 32–36 (5 tests) |
| V. Dot style | 40, 40b (2 tests) |
| VI. Role inference | 52 (1 test) |
| VII. Journeys | 62–63 (2 tests) |
| VIII. Regression | 70–72 (3 tests) |

### Decisions

1. **Output buffer access**: Used `(ptySpawner as any).getOutputBuffer?.()` in coordinators to access both FakePtySpawner and NodePtySpawner without changing the PtySpawner interface. Both implement `getOutputBuffer()` but it's not on the interface since it's a detection concern, not a spawning concern.

2. **Successor replaces UUID in-place**: The agent object is mutated with new UUID rather than creating a new object. This preserves position in napkin.agents array and homePath.

3. **Successor starts as done=true**: Per spec — successor is "regular from here" and can be resumed. Setting done=true + started=true + archived=false makes it resumable on restart.

4. **No medium tests for successor UI flow**: The SuccessorPrompt component renders based on agent.archived state, which is testable through the small test suite. The IPC wiring follows the same pattern as existing nepic:switch, which is already covered by medium tests.

### TA seams addressed

1. **Resume logic ordering** ✅ — archived checked first in computeResumeActions
2. **Fast exit heuristic** ✅ — requires BOTH timing AND message
3. **Sidebar click guard** ✅ — `started || archived` on all click handlers
4. **UUID replacement** ✅ — hasPendingWrite guards marker write
5. **Role inference regex** ✅ — simple `replace(/^\d+-/, '')` handles multi-segment roles
