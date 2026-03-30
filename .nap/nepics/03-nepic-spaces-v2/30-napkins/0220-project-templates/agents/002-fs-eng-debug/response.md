## Debug session report — v3 first live test

### Status: in progress (pausing, not done)

Human is testing the v3 app live with `raft-viz` template project. Full build completed — all 4 napkins done, 13 agents finished. App survives restart, resumes sessions, on-demand resume works for exited agents.

---

### All fixes (22 commits total)

**Prior session (9 commits):**
1. Snapshot race in preload — buffered IPC before React mount
2. did-finish-load ordering — register before async model load
3. Ephemeral running/done flags survive filesystem reloads
4. PTY cwd falls back to NAP_CWD
5. Terminal created on demand when switching
6. Sidebar cards and agent dots made clickable
7. HMR version counter in sidebar header
8. Workflow doc CLI examples fixed to create+start flow
9. Architect prompt split for template vs freeform init

**This session (13 commits):**
10. Sidebar redesigned to match v2 mock styles
11. Terminal breadcrumb resolves agent names instead of UUID
12. Done agent checkmark dots with dashed border
13. Debug panel with draggable width and color-coded JSON
14. File link provider for clickable terminal paths
15. Cmd+G follow mode
16. `nap-wait` race condition fix
17. `done` flag persisted to disk
18. All started agents clickable in sidebar
19. Done agents resumed on restart (not skipped)
20. On-demand resume for exited agents via `pty:resume` IPC
21. Response updates (this file)
22. Various test updates

---

### Critical bugs — detailed analysis for test architect

#### Bug 1: `nap-wait` hangs forever (race condition between ephemeral sets and filesystem reload)

**What happened**: When two `nap3 nap` commands ran concurrently waiting for agents, neither detected completion. `nap3 ps` showed agents as `done` but `nap3 nap` kept returning `status: 'running'`. Reproducible — happened every time two waits ran in parallel.

**Root cause**: `setAgentExitedById` (called when pty exits) did three things in this order:
1. `doneAgents.delete(agentId)` — cleared the ephemeral persistence set (sync)
2. `agent.exited = true` — set on the OLD in-memory object (sync)
3. `await fs.writeJSON(markerPath, { exited: true })` — wrote to disk (async)

Between steps 1 and 3, the file watcher's 200ms debounce could fire (triggered by the agent's own file writes before exit). `loadFromFilesystem()` rebuilt all agent objects from disk. The NEW objects had:
- `exited: false` — disk write hadn't completed yet
- `done: false` — `doneAgents` was already cleared in step 1
- `running: false` — `runningAgents` was cleared

Then in step 3, the disk write completed and set `hasPendingWrite = true`. The file watcher triggered by this write saw `hasPendingWrite` and skipped the reload. State was permanently wrong — agent stuck with all flags false.

**Fix**: (a) Don't clear `doneAgents` on exit — done+exited is a valid state. (b) Write to disk BEFORE updating in-memory state so `hasPendingWrite` is set before any debounce fires.

**Why tests didn't catch it**: The small tests use `MemoryFileSystem` which doesn't have real filesystem timing. The `simulateExit` helper awaits the callback synchronously, so the disk write completes before any watcher fires. The race requires real async disk I/O interleaved with a debounced filesystem watcher — a timing condition that only manifests with `NodeFileSystem` under concurrent load.

**Testing insight**: This class of bug (ephemeral state + async persistence + filesystem watcher) can't be caught by unit tests with synchronous mocks. Need either:
- An integration test that uses `NodeFileSystem` with real timing
- A stress test that exercises concurrent `nap done` + pty exit + file watcher reload
- Or, the spec should have identified that `doneAgents.delete()` in `setAgentExitedById` creates a window where neither the ephemeral set nor the disk has the flag

---

#### Bug 2: `done` flag not persisted to disk — done agents re-launched on restart

**What happened**: After app restart, agents that had called `nap3 done` showed `done: false` in the debug panel. They were resumed with `claude --resume`, re-launching Claude sessions that had already finished their work.

**Root cause**: Design inconsistency in the model layer. Three agent lifecycle flags, three different persistence strategies:
- `started` → written to `.agent.nap.json` marker on disk ✓
- `exited` → written to `.agent.nap.json` marker on disk ✓
- `done` → ephemeral only (in-memory Set, never written to disk) ✗

`setAgentDone` only did `doneAgents.add(id)` and `agent.done = true`. No disk write. On restart, `doneAgents` is empty, `loadFromFilesystem` hardcoded `done: false`.

**Fix**: `setAgentDone` now writes `done: true` to the marker file. `loadFromFilesystem` reads `done` from disk. Done agents are resumed on restart (they have a valid Claude session to reconnect to). Only exited agents are skipped.

**Why tests didn't catch it**: The tests EXPLICITLY encoded the wrong behavior. Test T-0200-44 was named "Done is NOT persisted → reload → done=false" and asserted `expect(agent!.done).toBe(false)`. Test T-0200-45 was named "Done agent resumes on next start (done ≠ exited)" and asserted the agent SHOULD be resumed — which was technically true but for the wrong reason (it resumed because it didn't know it was done, not because resuming was the right thing).

The tests validated the implementation, not the requirement. Nobody asked "should `done` survive a restart?" and wrote a test from the answer. Instead, someone looked at what the code did and wrote assertions to match.

**Testing insight**: This is the most dangerous class of test failure — a green test that encodes a wrong assumption. Mitigations:
- Tests should be derived from specs/requirements, not from reading the implementation
- Test NAMES should describe the DESIRED behavior, not the current behavior. "Done is NOT persisted" should have raised a flag during review — is that actually what we want?
- The spec for the `done` lifecycle should have explicitly stated persistence requirements for each flag. If the spec said "done is ephemeral", the test is correct. If the spec was silent on persistence, the test author made an assumption.

---

#### Bug 3: On-demand resume for exited agents

**What happened**: Clicking an exited agent in the sidebar showed an empty terminal with a blinking cursor. No session, no scrollback, nothing.

**Root cause**: When `Terminal.tsx` created an xterm on demand (for agents without a terminal entry), it signaled `pty:ready` but never told main to spawn a pty process. For running/done agents this worked because they already had ptys from startup. Exited agents had no pty — `computeResumeActions` skipped them.

**Fix**: Added `pty:resume` IPC channel. When Terminal.tsx creates an xterm on demand and detects the agent is exited, it calls `window.electronAPI.pty.resume(id)`. Main process spawns `claude --resume <id>`, registers exit handler, marks agent as running.

**Why tests didn't catch it**: No test covers the "click exited agent → resume" user journey. The medium tests test startup resume (agents that were running when app quit), but not on-demand resume (user explicitly clicking an exited agent after restart).

**Testing insight**: This is a UX flow that crosses the IPC boundary — renderer click → main process spawn → pty data flows back. Needs a medium/e2e test that:
1. Starts app with a fixture containing an exited agent
2. Simulates clicking the exited agent's card
3. Verifies a pty is spawned with `--resume`
4. Verifies the terminal receives data

---

### Reflections on testing strategy

The three bugs above reveal a pattern: **the test suite validates the implementation contract but not the product contract**.

1. **Synchronous mocks hide async races**. The `MemoryFileSystem` + `FakePtySpawner` combo makes everything deterministic, which is great for testing logic but blind to timing. The `nap-wait` race only happens when real async disk I/O interleaves with a debounced watcher — something the mocks can't reproduce. Consider adding a "timing-sensitive" test tier that uses `NodeFileSystem` with artificial delays.

2. **Tests derived from code, not from requirements**. The "Done is NOT persisted" test is the clearest example — it was a correct description of what the code did, but wrong about what it should do. The fix: specs should explicitly state persistence and lifecycle requirements for each flag. Tests should trace back to spec lines, not to code paths.

3. **Missing user journey tests**. The medium tests cover startup flows well but don't cover interactive flows — clicking cards, switching terminals, on-demand resume. These are the flows that break most often in practice because they cross multiple layers (store → IPC → main → pty → IPC → renderer).

4. **The `done` vs `exited` semantic gap**. The codebase had two concepts that were undertested at their boundary:
   - `done` = agent finished successfully (called `nap done`)
   - `exited` = pty process terminated (user Ctrl-D, crash, or normal exit after done)

   An agent can be done+running (called done but still alive), done+exited (normal completion), or !done+exited (user killed it). The tests never explored these combinations systematically. A state matrix test (all combinations of started/done/exited/running) would have caught the persistence gap.

---

### Known remaining issues

- Dot colors based on role not status (running test-arch shows amber instead of green)
- No pulsing animation on running dots
- No gutter/nepic switcher
- No filter bar (Cmd+K)
- No card expand/focus/extended states
- No sidebar toggle
- No kanban overlay
- `nap3 log` is a stub (returns empty)

### Test result

All 135 tests pass (114 small + 21 medium). Full project build completed (raft-viz: 4 napkins, 13 agents, all done). App survives restart with correct state. On-demand resume works for exited agents. Concurrent `nap3 nap` waits work correctly after race fix.
