# 0650 — Permissions Hook: Gap Review + Test Design

## Gaps

### G1: Hanging socket connection pattern (critical)

The current socket server (`socket-server.ts`) is request→response: handler receives message, returns result, server writes it immediately. The `hook-permission-request` handler needs to **hang** — keep the connection open for minutes until a separate `permission-response` resolves it.

**Proposed resolution:** The handler returns a `Promise` that doesn't resolve until the permission is resolved. The socket server already `await`s the handler result, so a long-lived Promise naturally holds the connection open. A shared `Map<agentId, { resolve, reject }>` (the "pending approvals registry") lets `permission-response` find and resolve the right Promise.

**Severity:** critical — the entire hook mechanism depends on this.

---

### G2: NAP_SESSION_ID propagation to pty env (critical)

The hook reads `NAP_SESSION_ID` from the CC process's env to identify which agent triggered the request. But the current pty-spawner (`node-pty-spawner.ts`) and model (`startAgentByName`) build the command string (`claude --verbose --session-id <uuid>`) without setting `NAP_SESSION_ID` in the spawned process's environment. The `--session-id` flag tells CC which session to use, but the hook subprocess inherits env from the CC process. If NAP_SESSION_ID isn't in that env, the hook can't map the request to a NAP agent.

**Proposed resolution:** When spawning agent ptys, set `NAP_SESSION_ID=<agent.id>` in the pty's environment. This propagates through CC to hook subprocesses. Also set `NAP_SOCKET=<socketPath>` so the hook can find the server.

**Severity:** critical — without this, the hook can't identify which agent triggered the permission request.

---

### G3: pendingApproval not in AgentState or AppSnapshot (important)

The napkin defines `agent.pendingApproval: { tool, command, timestamp, payload } | null` but `AgentState` in `bridge-types.ts` has no such field, and `AppSnapshot` doesn't carry it to the renderer.

**Proposed resolution:** Add `pendingApproval: PendingApproval | null` to `AgentState`. Keep it ephemeral (in-memory only, like `running`). It flows through the existing snapshot push mechanism. Define `PendingApproval` type in `bridge-types.ts`.

**Severity:** important — model/renderer integration won't work without it.

---

### G4: Guardian agent discovery (important)

Step 3 says "looks up guardian agent by role in model." The model has no `findByRole()` method. Agents have a `role` field, but the guardian role ("guardian") doesn't exist yet.

**Proposed resolution:** Add a method `model.findAgentByRole('guardian')` that searches architects (guardians live at the architect level in `20-architects/`). If none found or not running, the handler skips the guardian poke and relies on human resolution via modal.

**Severity:** important — guardian poke won't work without this.

---

### G5: CLI `hook` subcommand doesn't exist (important)

The napkin specifies `nap3 hook permission-request` but `nap.ts` has no `hook` command. This is a new CLI surface.

**Proposed resolution:** Add a `hook` command with `permission-request` subcommand. Reads stdin, reads NAP_SESSION_ID + NAP_SOCKET from env, sends socket message, blocks on response, writes CC-compatible JSON to stdout, exits 0.

Also add `permission-response` as a top-level command: `nap3 permission-response --agent <id> --decision allow|deny`.

**Severity:** important — the hook and resolution entry points.

---

### G6: CC hook output format must be exact (important)

CC expects a specific JSON structure from the PermissionRequest hook:
```json
{ "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" } } }
```

If the format is wrong, CC ignores it or errors. The napkin shows this but doesn't specify what happens for "deny" or "pass through."

**Proposed resolution:**
- Allow: `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }`
- Deny: `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "<reason>", interrupt: true } } }`
- Pass through (timeout/dismiss): exit 0 with no `decision` field, or empty JSON `{}` — CC falls through to its own dialog.

**Severity:** important — wrong format = CC ignores the hook result.

---

### G7: Timeout / cleanup for abandoned requests (important)

The napkin mentions "hook times out (10 min default)" but doesn't specify the mechanism. If the hook process hangs forever, the CC agent is stuck.

**Proposed resolution:** The `nap3 hook permission-request` CLI process sets a timeout (configurable, default 10 min). On timeout, it exits 0 with no decision (pass through to CC). The socket handler detects the closed connection and cleans up `pendingApproval`.

On the server side: when the socket connection closes (client disconnects), the pending approval registry entry is cleaned up. This handles both timeout and crash.

**Severity:** important — without timeout, stuck hooks block agents permanently.

---

### G8: Concurrent pending approvals — registry design (important)

Multiple agents can have simultaneous pending requests. Each `hook-permission-request` holds a socket connection open. The `permission-response` handler must resolve the correct one by agentId.

**Proposed resolution:** A `Map<string, { resolve: (decision) => void, conn: net.Socket }>` in the socket handler module. `hook-permission-request` adds an entry; `permission-response` removes and resolves it.

Edge case: what if `permission-response` arrives for an agent that has no pending request? Return an error. What if two `hook-permission-request` arrive for the same agent? The second should replace or reject the first (CC shouldn't send two, but defensive code matters).

**Severity:** important — concurrency is a core use case.

---

### G9: Renderer modal + approve/deny intent bridge (nice-to-have for v1)

The napkin describes a modal with JSON display and approve/deny buttons. This requires:
- New renderer component (PermissionModal)
- Reading `pendingApproval` from store
- Sending `permission-response` intent via IPC bridge
- Main handling the intent (same as socket handler's permission-response)

**Proposed resolution:** Implement a simple modal that shows when `activeAgent?.pendingApproval` is set. Approve/deny buttons send `{ type: 'permission-response', agentId, decision }` via `sendIntent`. Main handles this in the `ipcMain.on('app:intent')` handler.

**Severity:** nice-to-have for initial implementation — guardian + CLI flow works without the modal. Human can always use CC's fallback dialog.

---

### G10: Blinking dot animation for pending approval (nice-to-have)

The napkin says "agent's dot blinks when pendingApproval is set." Currently dots pulse when `agent.running`. Pending approval needs a distinct visual (faster blink? different color overlay?).

**Proposed resolution:** Add a CSS animation class `blink` (faster than pulse) triggered by `agent.pendingApproval !== null`. Applied in `AgentDot` component alongside existing running pulse.

**Severity:** nice-to-have — visual polish.

---

### G11: Guardian agent creation via `nap3 init --guardian` (nice-to-have for v1)

The napkin says `nap3 init --guardian` creates the guardian alongside the architect. The current `init` command doesn't support this flag.

**Proposed resolution:** When `--guardian` flag is present:
1. Create `20-architects/002-guardian/` with role: "guardian" in marker
2. Write `.claude/settings.json` with PermissionRequest hook config
3. Copy guardian prompt.md from templates

**Severity:** nice-to-have for v1 — can manually set up guardian for initial testing.

---

### G12: Agent exits while permission is pending (important)

If an agent's pty crashes or exits while a permission request is pending, the `pendingApproval` and the hanging hook connection should be cleaned up.

**Proposed resolution:** In `setAgentExitedById`, check if the agent has a pending approval entry in the registry. If so, resolve it with "deny" (or clean up silently — the hook process is likely already dead since CC exited). Clear `pendingApproval` in model.

**Severity:** important — prevents stale state.

---

### G13: `session_id` in stdin vs env ambiguity (nice-to-have)

Step 1 of the data flow shows `session_id` in the stdin payload AND `NAP_SESSION_ID` in env. The CC hooks reference doesn't clearly list `session_id` as a PermissionRequest stdin field (it shows `hook_event_name`, `tool_name`, `tool_input`, `permission_suggestions`).

**Proposed resolution:** The hook should primarily use `NAP_SESSION_ID` from env (set by NAP when spawning the pty). The stdin payload's `session_id` (if present) is a CC-internal field and may not match NAP's agent ID. Ignore it. Use env.

**Severity:** nice-to-have — just clarification.

---

## Test Cases

### T-0650-01: Model — setAgentPendingApproval sets state and notifies
**Flow:** Call `model.setAgentPendingApproval(agentId, payload)` → agent's pendingApproval field is set → onChange fires → snapshot includes the data.
**Subsystems:** model
**Expected:** `agent.pendingApproval` matches the payload. `onChange` listener called. `getNapkins()`/`getArchitects()` returns agent with populated field.
**Likely to break:** If pendingApproval is accidentally wiped by filesystem reload (it must be ephemeral like `running`).
**Size:** small
**Verification:** `expect(agent.pendingApproval).toEqual({ tool: 'Bash', command: 'npm install', timestamp: expect.any(Number), payload: {...} })`

---

### T-0650-02: Model — clearPendingApproval resets state and notifies
**Flow:** Set pending → clear pending → agent's pendingApproval is null → onChange fires.
**Subsystems:** model
**Expected:** `agent.pendingApproval` is null after clear.
**Size:** small
**Verification:** `expect(agent.pendingApproval).toBeNull()`

---

### T-0650-03: Model — pendingApproval survives filesystem reload
**Flow:** Set pendingApproval → trigger filesystem reload → agent still has pendingApproval.
**Subsystems:** model
**Expected:** Ephemeral pendingApproval state preserved across `loadFromFilesystem` calls (same pattern as `running` and `done` sets).
**Likely to break:** If implementation forgets to restore pendingApproval from ephemeral set after reload.
**Size:** small
**Verification:** Set pending, call `loadFromFilesystem`, verify `agent.pendingApproval` is still set.

---

### T-0650-04: Model — clearPendingApproval for unknown agent is a no-op
**Flow:** Call `model.clearPendingApproval('nonexistent-id')` → no error, no crash.
**Subsystems:** model
**Expected:** Returns silently, no state change.
**Size:** small
**Verification:** No throw, model state unchanged.

---

### T-0650-05: Socket handler — hook-permission-request sets model state + hangs
**Flow:** Send `{ type: 'hook-permission-request', agentId, tool, command, payload }` → model's pendingApproval is set → socket connection stays open (no response yet).
**Subsystems:** socket-handler, model
**Expected:** Model has pendingApproval set. The socket connection doesn't receive a response for at least N seconds.
**Likely to break:** If the handler resolves immediately instead of hanging.
**Size:** small
**Verification:** After sending, check model state immediately. Set a timeout — if response arrives within 2s, test fails (it should hang).

---

### T-0650-06: Socket handler — permission-response resolves hanging connection
**Flow:** Send hook-permission-request (hangs) → send permission-response with allow → first connection receives `{ decision: "allow" }` → model's pendingApproval cleared.
**Subsystems:** socket-handler, model
**Expected:** Hanging connection gets a response. Model's pendingApproval is null.
**Likely to break:** Race between the two messages. Registry lookup failing.
**Size:** small
**Verification:** First connection resolves with `{ decision: "allow" }`. Model state verified.

---

### T-0650-07: Socket handler — permission-response with deny
**Flow:** Same as T-0650-06 but with `decision: "deny"`.
**Subsystems:** socket-handler, model
**Expected:** Hanging connection receives `{ decision: "deny" }`. pendingApproval cleared.
**Size:** small
**Verification:** Response contains deny decision.

---

### T-0650-08: Socket handler — permission-response for unknown agent → error
**Flow:** Send `{ type: 'permission-response', agentId: 'nonexistent', decision: 'allow' }` → error response.
**Subsystems:** socket-handler
**Expected:** Error message like "no pending approval for agent 'nonexistent'".
**Size:** small
**Verification:** `expect(res.error).toBe(true)`

---

### T-0650-09: Socket handler — hook-permission-request pokes guardian
**Flow:** Set up model with a running guardian agent → send hook-permission-request → guardian gets poked with structured message.
**Subsystems:** socket-handler, model, message-queue
**Expected:** Message queue receives a poke for the guardian's ID. Message contains agent name, tool, command, and task path.
**Likely to break:** Guardian lookup logic. Poke message format.
**Size:** small
**Verification:** Spy on `enqueue()` → verify called with guardian ID and structured message.

---

### T-0650-10: Socket handler — hook-permission-request without guardian → no poke
**Flow:** Model has no guardian agent → send hook-permission-request → pendingApproval set, no poke attempted.
**Subsystems:** socket-handler, model
**Expected:** pendingApproval set correctly. No error. Human must resolve via modal or CC fallback.
**Size:** small
**Verification:** Model state set. No enqueue call.

---

### T-0650-11: Socket handler — concurrent permission requests from different agents
**Flow:** Send hook-permission-request for agent-A (hangs) → send hook-permission-request for agent-B (hangs) → resolve agent-B → resolve agent-A.
**Subsystems:** socket-handler, model
**Expected:** Each connection resolves independently with the correct decision.
**Likely to break:** If the registry uses a single slot instead of per-agent map.
**Size:** small
**Verification:** agent-B's connection resolves first with its decision. agent-A's resolves later with its decision. Both pendingApprovals cleared.

---

### T-0650-12: Socket handler — connection closes before resolution → cleanup
**Flow:** Send hook-permission-request (hangs) → close the client socket → pendingApproval should be cleaned up.
**Subsystems:** socket-handler, model
**Expected:** After client disconnect, model's pendingApproval for that agent is cleared. Registry entry removed.
**Likely to break:** If server doesn't handle client disconnect events.
**Size:** small
**Verification:** Close socket. Wait briefly. Check `model.getAllAgents()` — pendingApproval is null.

---

### T-0650-13: CLI — `nap3 hook permission-request` reads stdin, sends socket, blocks, outputs JSON
**Flow:** Spawn `nap3 hook permission-request` with stdin piped and NAP_SESSION_ID + NAP_SOCKET set → it sends socket message → resolve via separate `nap3 permission-response` call → hook process writes CC-compatible JSON to stdout → exits 0.
**Subsystems:** CLI (nap.ts), socket-server, socket-handler
**Expected:** stdout matches `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }`.
**Likely to break:** Stdin parsing. Env var reading. Output format exactness.
**Size:** small (mock socket) or medium (real server)
**Verification:** Parse stdout JSON. Verify `hookSpecificOutput.decision.behavior === 'allow'`. Exit code 0.

---

### T-0650-14: CLI — `nap3 hook permission-request` timeout → pass-through
**Flow:** Spawn hook with a very short timeout (e.g., 1s for testing) → don't resolve → hook exits 0 with empty/no-decision JSON.
**Subsystems:** CLI
**Expected:** Hook exits 0. Stdout is empty or `{}` (CC falls through to dialog).
**Size:** small
**Verification:** Exit code 0. No `decision` in stdout.

---

### T-0650-15: CLI — `nap3 permission-response --agent <id> --decision allow`
**Flow:** Run `nap3 permission-response --agent uuid-fs --decision allow` while a hook-permission-request is pending → sends socket message → pending hook resolves.
**Subsystems:** CLI, socket-handler
**Expected:** Socket receives `{ type: 'permission-response', agentId: 'uuid-fs', decision: 'allow' }`. The hook connection unblocks.
**Size:** small
**Verification:** Hook process exits 0 with allow decision in stdout.

---

### T-0650-16: CLI — `nap3 permission-response` with invalid decision → error
**Flow:** Run `nap3 permission-response --agent uuid-fs --decision maybe`.
**Subsystems:** CLI
**Expected:** stderr shows error, exits 1. Only "allow" and "deny" are valid.
**Size:** small
**Verification:** Exit code 1. stderr contains "invalid decision".

---

### T-0650-17: Model — findAgentByRole returns guardian when present
**Flow:** Load model with a guardian agent (role: "guardian") → `findAgentByRole('guardian')` returns it.
**Subsystems:** model
**Expected:** Returns the guardian AgentState.
**Size:** small
**Verification:** `expect(result.role).toBe('guardian')`

---

### T-0650-18: Model — findAgentByRole returns null when no guardian
**Flow:** Load model with only architect and fs-eng agents → `findAgentByRole('guardian')` returns null.
**Subsystems:** model
**Expected:** Returns null.
**Size:** small
**Verification:** `expect(result).toBeNull()`

---

### T-0650-19: End-to-end — full permission cycle via socket
**Flow:** Load model → send hook-permission-request for agent uuid-ta → verify model state → send permission-response allow → verify hook-permission-request connection gets response → verify model cleared.
**Subsystems:** socket-server, socket-handler, model
**Expected:** Full cycle works. Both socket connections complete. Model transitions correctly.
**Likely to break:** Timing between the two messages. Connection lifecycle.
**Size:** small (all in-process via test socket)
**Verification:** First connection resolves with `{ decision: "allow" }`. Model pendingApproval transitions null → set → null.

---

### T-0650-20: Medium — permission request shows blinking dot in sidebar
**Flow:** Launch Electron app → load fixture with running agent → send hook-permission-request via socket → verify sidebar dot has blink animation.
**Subsystems:** main, renderer (Sidebar, AgentDot), model
**Expected:** Agent dot's CSS animation changes to blink when pendingApproval is set.
**Likely to break:** Snapshot not including pendingApproval. Dot component not reading the field.
**Size:** medium
**Verification:** `page.evaluate(() => { const dot = document.querySelector('[data-testid="agent-dot"]'); return getComputedStyle(dot).animation; })` → contains 'blink'.

---

### T-0650-21: Medium — permission modal renders in terminal area
**Flow:** Launch app → fixture with running agent → set pendingApproval → switch to that agent's terminal → modal with request JSON + approve/deny buttons visible.
**Subsystems:** renderer (Terminal, PermissionModal)
**Expected:** Modal renders with tool name, command, and two buttons.
**Size:** medium
**Verification:** `page.evaluate(() => document.querySelector('[data-testid="permission-modal"]')?.textContent)` contains tool name and "Approve"/"Deny".

---

### T-0650-22: Medium — approve button resolves permission
**Flow:** Launch app → pendingApproval set → click approve button → pendingApproval cleared → modal disappears.
**Subsystems:** renderer, bridge, main (intent handler)
**Expected:** Intent sent via bridge. Main handles it. Model cleared. Snapshot pushes to renderer.
**Likely to break:** Intent wiring. Handler missing the new intent type.
**Size:** medium
**Verification:** After click, `app.evaluate(() => (global as any).__napModel__.getAllAgents().find(a => a.id === 'uuid-ta').pendingApproval)` → null.

---

### T-0650-23: Medium — dismiss modal → pendingApproval stays (fallthrough)
**Flow:** Launch app → pendingApproval set → switch to different terminal → pendingApproval still set, hook still hanging.
**Subsystems:** renderer, model
**Expected:** Switching away doesn't clear pendingApproval. The hook keeps waiting.
**Size:** medium
**Verification:** Switch terminal. Check model — pendingApproval still set.

---

### T-0650-24: Socket handler — duplicate hook-permission-request for same agent
**Flow:** Send hook-permission-request for agent-A → send another hook-permission-request for agent-A → second one should get an error or replace the first.
**Subsystems:** socket-handler
**Expected:** Error response on second request: "agent already has a pending approval". First connection unaffected.
**Likely to break:** If registry allows overwrite, first connection hangs forever.
**Size:** small
**Verification:** Second connection gets error. First still hanging.

---

### T-0650-25: Guardian poke message format
**Flow:** Set up guardian + requesting agent → send hook-permission-request → capture the poke message → verify it matches the napkin's format.
**Subsystems:** socket-handler, message-queue
**Expected:** Message matches:
```
[permission-request from: <name> | napkin: <slug> | role: <role>]
tool: <tool>
command: <command>
task: <prompt.md path>
```
**Size:** small
**Verification:** String matching on the enqueued message.

---

### T-0650-26: Model — pendingApproval cleared on agent exit
**Flow:** Set pendingApproval for agent → call setAgentExitedById → pendingApproval is null.
**Subsystems:** model
**Expected:** Exit cleans up ephemeral approval state.
**Size:** small
**Verification:** `expect(agent.pendingApproval).toBeNull()` after exit.

---

### T-0650-27: Medium — `nap3 ps` shows pending agents
**Flow:** Launch app → set pendingApproval → run `nap3 ps` → output indicates which agents are waiting for approval.
**Subsystems:** CLI, socket-handler, model
**Expected:** ps output shows a "pending" or similar status for agents with pendingApproval.
**Size:** medium
**Verification:** stdout contains "pending" for the right agent.

---

### T-0650-28: Hook config format — `.claude/settings.json` structure
**Flow:** Verify the hook config matches CC's expected format.
**Subsystems:** none (validation only)
**Expected:** Config is:
```json
{ "hooks": { "PermissionRequest": [{ "type": "command", "command": "nap3 hook permission-request" }] } }
```
**Size:** small (unit test on config generation)
**Verification:** Generated JSON matches expected structure.

---

### T-0650-29: CLI — `nap3 hook permission-request` without NAP_SESSION_ID → exit 1
**Flow:** Spawn hook without NAP_SESSION_ID env var.
**Subsystems:** CLI
**Expected:** stderr: "NAP_SESSION_ID not set". Exit 1. (Non-zero non-2 = CC ignores.)
**Size:** small
**Verification:** Exit code 1. stderr contains error message.

---

### T-0650-30: CLI — `nap3 hook permission-request` without NAP_SOCKET → exit 1
**Flow:** Spawn hook without NAP_SOCKET env var and no discoverable socket.
**Subsystems:** CLI
**Expected:** stderr: "nap3 is not running". Exit 1.
**Size:** small
**Verification:** Exit code 1.
