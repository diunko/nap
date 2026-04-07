## 0650 — permissions hook: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study: the napkin (with inline discussion + data flow), the TA's gap analysis + test cases, all v3 source, and the CC hooks reference.

### Critical: read these first

- **Napkin**: `0650-permissions-hook.nap.md` — the full design with data flow
- **TA gaps + tests**: `0650-permissions-hook.test.md` — 13 gaps identified, 30 test cases
- **TA response**: `agents/001-test-arch-permissions/response.md` — critical seams + implementation order
- **CC hooks reference**: `20-architects/001-architect/scratch/permissions/00-cc-hooks.nap.md`
- **Stories**: `0650-permissions-hook.stories.md`

### TA critical gap G1: hanging socket pattern

The current socket server is request→response. The `hook-permission-request` handler needs to hold a connection open indefinitely until `permission-response` resolves it.

**Implementation:**
- Handler returns a `Promise` that doesn't resolve until permission is resolved
- Shared `Map<agentId, { resolve, reject, conn }>` registry in the socket handler module
- `hook-permission-request` adds an entry; `permission-response` removes and resolves it
- **Keepalive**: server sends periodic ndjson pings (e.g. `{ "type": "ping" }` every 60s) on hanging connections to prevent OS socket timeout. Client ignores pings.
- On client disconnect: clean up registry entry + clear pendingApproval in model

### TA critical gap G2: NAP_SESSION_ID env propagation

The pty spawner must set `NAP_SESSION_ID=<agent.id>` and `NAP_SOCKET=<socketPath>` in the spawned process's environment. Without this, `nap3 hook permission-request` can't identify which agent triggered the hook.

**Implementation:** One-line addition to `node-pty-spawner.ts` spawn() — add to the env object passed to node-pty. The socket path can be derived from the project cwd or passed explicitly.

### New model methods

```ts
// Ephemeral permission state
setAgentPendingApproval(agentId: string, approval: PendingApproval): void
clearPendingApproval(agentId: string): void

// Agent lookup by role
findAgentByRole(role: string): AgentState | null
```

`PendingApproval`:
```ts
interface PendingApproval {
  tool: string
  command: string
  timestamp: number
  payload: object  // full hook stdin JSON
}
```

`pendingApproval` is ephemeral — survives filesystem reloads (like `running` and `done`), dies on app stop. Added to `AgentState` in `bridge-types.ts`.

### New CLI commands

**`nap3 hook permission-request`** — invoked by CC as the PermissionRequest hook:
- Reads hook payload from stdin (JSON)
- Reads `NAP_SESSION_ID` from env
- Reads `NAP_SOCKET` from env (or discovers via walk-up)
- Sends socket: `{ type: "hook-permission-request", agentId, tool, command, payload }`
- **Blocks** until socket responds
- On response: prints CC-compatible JSON to stdout, exits 0
- On timeout: exits 0 with no decision (pass-through)
- On error: exits 1 (CC ignores, falls through)

**`nap3 permission-response --agent <id> --decision allow|deny`** — invoked by guardian or human:
- Sends socket: `{ type: "permission-response", agentId, decision }`
- Server resolves the hanging hook connection

### CC output format (must be exact)

Allow:
```json
{ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": { "behavior": "allow" } } }
```

Deny:
```json
{ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": { "behavior": "deny", "message": "<reason>", "interrupt": true } } }
```

Pass-through (timeout/dismiss): exit 0 with `{}` or no output.

### Socket handler additions

Two new request types:
- `hook-permission-request`: sets model state, pokes guardian, returns long-lived Promise
- `permission-response`: resolves the hanging Promise, clears model state

### Guardian poke

When guardian exists and is running, construct poke message:
```
[permission-request from: <name> | napkin: <napkin> | role: <role>]
tool: <tool>
command: <command>
task: <path to prompt.md>
```

Send via message queue (existing poke mechanism).

### Renderer: modal + blinking dot

**Modal**: when active terminal's agent has `pendingApproval`, show a modal in the terminal area:
- Renders request JSON like debug panel (color-coded, monospace)
- Approve + Deny buttons
- Approve sends intent: `{ type: "permission-response", agentId, decision: "allow" }`
- Deny sends intent with `"deny"`
- Dismiss (switch away): modal disappears, hook keeps hanging

**Blinking dot**: agent dot blinks when `pendingApproval` is set. Same role color, blink animation. Visible on all surfaces (sidebar collapsed, focused, kanban).

### Guardian agent (scaffold only)

For v1: just the role definition and init flag. The guardian is a CC session with a prompt — no special infrastructure beyond what's already built.

- `nap3 init --guardian`: creates `20-architects/002-guardian/` with marker + prompt.md, adds hook config to `.claude/settings.json`
- Guardian prompt template in `src/templates/`
- Guardian color: purple (#a855f7)

### Implementation order (from TA)

1. Model changes (pendingApproval, findByRole)
2. Socket handler (registry, hook-permission-request, permission-response, keepalive)
3. CLI commands (hook permission-request, permission-response)
4. Pty env propagation (NAP_SESSION_ID, NAP_SOCKET)
5. Renderer (modal, blinking dot)
6. Guardian scaffold (init --guardian, template)

### What NOT to do

- Don't implement learned-policies.md (future)
- Don't implement `nap3 hook stop` or other hook handlers (future)
- Don't change existing poke behavior
- Don't break existing tests
