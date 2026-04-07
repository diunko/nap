# FS-Eng Response — 0650 Permissions Hook

## What was built

All six implementation layers completed, in spec order:

### 1. Model (bridge-types.ts, model.ts)

- `PendingApproval` type: `{ tool, command, timestamp, payload }`
- `pendingApproval: PendingApproval | null` added to `AgentState` — ephemeral, survives filesystem reloads (same pattern as `running` and `done`)
- `setAgentPendingApproval(agentId, approval)` — sets ephemeral map + in-memory agent state, notifies
- `clearPendingApproval(agentId)` — clears map + agent state, notifies. No-op for unknown agents
- `findAgentByRole(role)` — searches architects first, then napkin agents. Returns null if not found
- `setAgentExitedById` clears pendingApproval on agent exit (G12)
- All existing `AgentState` constructions updated with `pendingApproval: null`

### 2. Socket handler (socket-server.ts, socket-handler.ts)

- `LONG_LIVED` sentinel — handler returns this to signal "I own the connection"
- Socket server passes `conn` to handler, skips auto-response when `LONG_LIVED` returned
- **Pending approvals registry**: `Map<agentId, { resolve, conn, keepaliveTimer }>`
- `hook-permission-request` handler:
  - Rejects duplicate (agent already has pending approval) — G8/T-24
  - Sets model state via `setAgentPendingApproval`
  - Pokes guardian if present + running (structured message format from spec)
  - Returns long-lived Promise that hangs until resolved
  - Keepalive pings every 60s to prevent OS socket timeout
  - Client disconnect cleanup: clears registry + model state (G7/G12)
- `permission-response` handler:
  - Looks up registry by agentId, errors if not found (T-08)
  - Clears keepalive timer, removes from registry, clears model state
  - Resolves the hanging Promise with the decision
- Protocol types added: `HookPermissionRequest`, `PermissionResponseRequest`

### 3. CLI (nap.ts)

- `nap3 hook permission-request`:
  - Reads `NAP_SESSION_ID` from env (exits 1 if missing — T-29)
  - Reads `NAP_SOCKET` from env, falls back to walk-up discovery (exits 1 if not found — T-30)
  - Reads stdin JSON (hook payload)
  - Extracts `tool_name` and `tool_input.command`
  - Sends `hook-permission-request` via `sendLongLived` (ignores keepalive pings)
  - 10 minute timeout → pass-through (empty output, exit 0)
  - Outputs exact CC-compatible JSON format (G6):
    - allow: `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }`
    - deny: `{ hookSpecificOutput: { ..., decision: { behavior: "deny", message: "denied by guardian", interrupt: true } } }`
    - no decision = pass-through
- `nap3 permission-response --agent <id> --decision allow|deny`:
  - Validates decision is "allow" or "deny" (exits 1 otherwise — T-16)
  - Sends `permission-response` via regular socket

### 4. Pty env propagation (node-pty-spawner.ts)

- `NAP_SOCKET` added to pty env alongside existing `NAP_SESSION_ID`
- Uses `getServerSocketPath(process.env['NAP_CWD'])` for the path

### 5. Renderer (Sidebar.tsx, Terminal.tsx, index.html, dot-style.ts)

- **Blinking dot**: `AgentDot` uses `blink 0.6s step-end infinite` animation when `pendingApproval` is set (faster than the 2s pulse for running)
- **`@keyframes blink`** and `@keyframes pulse` added to index.html
- **Permission modal**: `PermissionModal` component in Terminal.tsx
  - Shows when active terminal's agent has `pendingApproval`
  - Renders request JSON (tool + command + payload) in monospace pre block
  - Approve and Deny buttons with `data-testid` attributes
  - Sends `permission-response` intent via `window.electronAPI.sendIntent`
- **Intent handler**: main.ts routes `permission-response` intent to the socket handler
- **Guardian color**: `#a855f7` (purple) added to role color palette

### 6. Guardian scaffold (init --guardian, template)

- `nap3 init --guardian` flag:
  - Creates `20-architects/002-guardian/` with `role: "guardian"` marker
  - Copies guardian prompt.md from templates
  - Writes `.claude/settings.json` with PermissionRequest hook config:
    ```json
    { "hooks": { "PermissionRequest": [{ "type": "command", "command": "nap3 hook permission-request" }] } }
    ```
- Guardian prompt template in `src/templates/nepic/20-architects/002-guardian/prompt.md`
- `nap3 ps` shows `pending` status (purple) for agents awaiting approval

## Decisions

1. **LONG_LIVED pattern**: Rather than redesigning the socket server, added a sentinel value that lets specific handlers opt into managing their own connection lifecycle. Minimal change to existing code.

2. **Keepalive in handler, not server**: The 60s ping timer lives in the handler (where the hanging Promise is) rather than the server layer. This keeps the socket server generic.

3. **Intent → handler reuse**: The renderer's approve/deny buttons send an intent to main.ts, which calls the same `permission-response` handler used by the CLI. Single code path for resolution regardless of source.

4. **No separate guardian infrastructure**: The guardian is just a CC session with a prompt, same as any other agent. The only special thing is `role: "guardian"` which `findAgentByRole` uses.

## Test seams exposed

- `getPendingRegistry()` exported from socket-handler for tests to inspect registry state
- `LONG_LIVED` exported from socket-server
- `sendLongLived` in CLI handles keepalive pings transparently
- All modal elements have `data-testid` attributes
- `AgentState.pendingApproval` flows through snapshots to renderer

## All existing tests pass

- 220 small tests (vitest) — all pass
- 38 medium tests (Playwright) — all pass
- Zero type errors (tsc --noEmit clean)
