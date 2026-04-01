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
- `NodePtySpawner` has a dedicated `detectionBuffer` that captures ALL output (see bug report below)

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
- **34 medium tests pass** (29 existing + 5 new)
- **0 type errors** (`tsc --noEmit`)

### Tests written

**27 small tests (T-0620-xx)**

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

**5 medium tests**

| Test | What it verifies |
|------|-----------------|
| T-0620-30 | Click archived agent → successor prompt shown in terminal area |
| T-0620-31 | Resume fails with "No conversation found" → agent marked archived (Path B e2e) |
| T-0620-41 | Sidebar shows "archived" label for archived agent |
| T-0620-42 | Archived dot is clickable and sets active terminal |
| T-0620-57 | Archived agents appear in sidebar with correct dot style |

### Decisions

1. **Output buffer access**: Used `(ptySpawner as any).getOutputBuffer?.()` in coordinators to access both FakePtySpawner and NodePtySpawner without changing the PtySpawner interface. Both implement `getOutputBuffer()` but it's not on the interface since it's a detection concern, not a spawning concern.

2. **Successor replaces UUID in-place**: The agent object is mutated with new UUID rather than creating a new object. This preserves position in napkin.agents array and homePath.

3. **Successor starts as done=true**: Per spec — successor is "regular from here" and can be resumed. Setting done=true + started=true + archived=false makes it resumable on restart.

### TA seams addressed

1. **Resume logic ordering** ✅ — archived checked first in computeResumeActions
2. **Fast exit heuristic** ✅ — requires BOTH timing AND message
3. **Sidebar click guard** ✅ — `started || archived` on all click handlers
4. **UUID replacement** ✅ — hasPendingWrite guards marker write
5. **Role inference regex** ✅ — simple `replace(/^\d+-/, '')` handles multi-segment roles

---

### Bug found and fixed: NodePtySpawner output buffer flush

**The bug**: Resume failure detection (Path B) didn't work in the real app. `NodePtySpawner.markReady()` flushed the output buffer to the renderer and deleted it. After that, all pty output went to the renderer's data handler — never captured. When the exit handler in coordinators checked `getOutputBuffer()`, it got an empty string. The timing check passed but the message check failed. Agent was marked exited instead of archived. No successor prompt appeared.

**Why small tests didn't catch it**: `FakePtySpawner` doesn't have the renderer routing split. `simulateOutput()` writes directly to a buffer that `getOutputBuffer()` reads. There's no `markReady` flush. The detection always works in FakePtySpawner because the data path is one straight line.

**The fix**: Added a separate `detectionBuffer` to `NodePtySpawner` that captures ALL output regardless of ready state (capped at 4KB). The `getOutputBuffer()` method reads from this buffer. It survives the `markReady` flush and is only cleaned up after the exit handler runs.

**Verified with revert test**: Reverted the fix, rebuilt, ran T-0620-31 — test fails. Restored fix, rebuilt — test passes.

---

### Process problems and suggestions for the architect

This feature exposed three process issues worth addressing:

#### 1. I skipped the medium tests and shipped a broken Path B

The TA's test doc explicitly marked T-0620-30 and T-0620-31 as medium tests. I wrote 27 small tests and 0 medium tests in the first pass. The small tests all passed. I declared victory. The human caught the bug by manually testing.

**Root cause**: The small tests for Path B (T-0620-20 through T-0620-24) used FakePtySpawner, which doesn't have the output buffer routing split that exists in the real NodePtySpawner. The detection logic was correct in isolation — the integration was broken. This is exactly what medium tests exist to catch.

**Suggestion**: The fs-eng role file or the prompt should include a hard rule: **if the test doc marks a test as "medium", you must write a medium test. Small-test coverage of a medium-test case is not sufficient.** The TA sized tests as medium for a reason — because the seam crosses process boundaries (main → pty → renderer). Testing it with fakes hides the real integration.

#### 2. Medium tests run compiled JS — source edits don't take effect without rebuild

When verifying the bug, I reverted the source file and ran `npx playwright test`. Tests still passed. The Electron app loads compiled `out/main/main.js`, not TypeScript source. I didn't rebuild between reverting and testing. I spent several rounds confused before discovering this.

**Suggestion**: Add to the fs-eng role file or CLAUDE.md: **after editing main-process code, run `npm run build:v3` before running medium tests.** Small tests (vitest) compile on the fly. Medium tests (Playwright/Electron) use pre-compiled output. This mismatch is a trap.

#### 3. Medium tests for pty behavior need to account for the ready-state race

My first T-0620-31 test passed with the broken code because of timing. The test wrote to the pty and killed it immediately after seeing `running=true` in the store — but `pty.ready()` hadn't been called yet by the renderer. The output buffer still existed, so detection worked. The test was a false pass.

**The fix**: Wait for `readyTerminals.has(id)` in the main process before writing, ensuring the buffer is flushed and the real-app condition is reproduced.

**Suggestion for the TA**: When designing medium tests that involve pty output timing (or any async handoff between main and renderer), the test doc should note the race condition and the setup sequence needed to reproduce the real condition. Something like: "**Setup**: verify pty is in ready state before injecting output — otherwise the output buffer hasn't been flushed and the test exercises a different code path than production."

#### 4. FakePtySpawner is too fake for detection testing

The gap: `FakePtySpawner` has no concept of "ready state" or "output routing." It's a flat record of spawn calls + a buffer. This is fine for testing resume decisions and spawn commands. It's not fine for testing detection logic that depends on where output goes after the terminal is ready.

**Options**:
- Add a `markReady()` to FakePtySpawner that changes where `simulateOutput` data goes (mirrors the real split)
- Or: accept that detection tests must be medium, and enforce that in the test doc
- I lean toward the second — adding readyState to FakePtySpawner would be adding complexity to make a fake more realistic, which is the definition of "just use the real thing"
