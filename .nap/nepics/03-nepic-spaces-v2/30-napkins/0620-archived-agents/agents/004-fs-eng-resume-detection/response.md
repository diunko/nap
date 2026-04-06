## 004-fs-eng-resume-detection — response

### Bug

The `pty:resume` IPC handler in `main.ts` had no resume failure detection. When a user clicked an exited agent to resume it, `claude --resume <uuid>` would spawn, fail fast with "No conversation found", and the handler would only call `setAgentExitedById` — leaving the user with an empty terminal and no successor prompt.

The working detection logic (fast exit + "No conversation found" in detection buffer → mark archived → trigger successor flow) only existed in `startAgents` (coordinators.ts).

### Fix

Added the same detection pattern to the `pty:resume` handler in `main.ts:134`:

1. Record `spawnTime = Date.now()` before `ptySpawner.spawn()`
2. In the exit callback: check `(Date.now() - spawnTime) < RESUME_FAIL_THRESHOLD_MS`
3. If fast exit: read `ptySpawner.getOutputBuffer(id)` for "No conversation found"
4. If matched: call `model.setAgentArchived(id)` instead of `setAgentExitedById(id)`

Import `RESUME_FAIL_THRESHOLD_MS` from coordinators (already exported).

### Test

**T-0620-31b** (medium): launches app with F8_FIXTURE (uuid-fs is started+exited → startAgents skips it). Triggers `pty:resume` via renderer IPC, marks terminal ready, writes "No conversation found" to stdin (cat echoes it), kills the pty, asserts `agent.archived === true` in both store and disk marker. Fails without the fix (timeout waiting for archived), passes with it.

### Results

- 177 small tests pass
- 35 medium tests pass (including new T-0620-31b)
- `tsc --noEmit` — zero errors
