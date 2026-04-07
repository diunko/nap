# Test Architect Response — 0650 Permissions Hook

## Summary

Reviewed the full napkin, CC hooks reference, and all v3 source files (model, socket-handler, socket-server, CLI, renderer, bridge, message-queue, coordinators, pty-spawner). Designed 30 test cases across the permission hook lifecycle.

## Key Findings

### Critical gaps (block implementation)

1. **Hanging socket pattern** — The current socket server is request→response. The hook handler needs to hold a connection open indefinitely until a separate `permission-response` resolves it. Proposed: handler returns a long-lived Promise; shared `Map<agentId, { resolve }>` registry lets permission-response find and resolve the right one.

2. **NAP_SESSION_ID env propagation** — The hook reads NAP_SESSION_ID from env to identify the requesting agent. But the pty spawner doesn't set this env var. Proposed: set `NAP_SESSION_ID=<agent.id>` and `NAP_SOCKET=<socketPath>` in the pty's environment at spawn time.

### Important gaps (needed for correctness)

3. **pendingApproval field** — Doesn't exist in AgentState/AppSnapshot. Must be ephemeral (like `running`), survive filesystem reloads, flow through snapshots to renderer.

4. **Guardian discovery** — No `findByRole()` on model. Need it for guardian poke.

5. **CLI `hook` command** — New CLI surface: `nap3 hook permission-request` (reads stdin, blocks) + `nap3 permission-response --agent <id> --decision allow|deny`.

6. **CC output format** — Must be exact: `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow"|"deny" } } }`. Wrong format = CC ignores it.

7. **Timeout/cleanup** — Hook process needs a timeout (default 10 min). Server needs to handle client disconnect (cleanup pending approval).

8. **Concurrent requests** — Multiple agents pending simultaneously. Registry keyed by agentId.

9. **Agent exit cleanup** — If agent pty exits while pending, clean up approval state.

### Nice-to-have (can defer)

10. Renderer modal with approve/deny buttons
11. Blinking dot animation for pending approval
12. `nap3 init --guardian` auto-setup
13. stdin session_id vs env clarification (use env)

## Test Architecture

- **14 small tests** — model state (T-01 through T-04), socket handler mechanics (T-05 through T-12, T-24, T-25, T-26), config format (T-28)
- **12 small tests** — CLI entry/exit (T-13 through T-16, T-29, T-30), model methods (T-17, T-18), integration (T-19)
- **4 medium tests** — renderer (T-20 through T-23), CLI+app integration (T-27)

### Highest-value tests (build these first)

1. **T-0650-06** (permission-response resolves hanging connection) — proves the core mechanism works
2. **T-0650-11** (concurrent requests) — proves the registry handles multiple agents
3. **T-0650-13** (CLI end-to-end) — proves the hook process works as CC would invoke it
4. **T-0650-19** (full cycle via socket) — proves the happy path from request to resolution

### Test fixtures needed

- **F-0650-01**: Minimal fixture + guardian agent (role: "guardian") in 20-architects/002-guardian/
- **F-0650-02**: Same as F10 but with pending approval pre-set (for renderer tests)
- No new medium test helpers needed — existing `launchApp`/`createTestNepicDir` from helpers.ts work.

## Implementation order recommendation

1. Model changes (pendingApproval field, set/clear methods, findByRole) — smallest surface, most testable
2. Socket handler (hook-permission-request, permission-response, registry) — core mechanism
3. CLI commands (hook permission-request, permission-response) — entry points
4. Pty env propagation (NAP_SESSION_ID, NAP_SOCKET) — one-line fix in spawner
5. Renderer (modal, blinking dot) — visual layer, can defer
6. Guardian creation (`nap3 init --guardian`) — scaffolding, can defer
