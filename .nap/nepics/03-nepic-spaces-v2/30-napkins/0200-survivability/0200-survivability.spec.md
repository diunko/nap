## 0200 — close/reopen survivability: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study the v2 codebase AND the v3 code from 0100/0150. Understand how v2 manages ptys, how the Terminal component works, how output buffering and ready signaling flow, how the preload bridges IPC. Then understand what v3's model layer already does and how to extend it.

### The goal

The app survives quit → reopen with no data loss. Real ptys spawn on startup. The sidebar shows real running agents. Close the app, reopen, everything is back.

### Model entity shapes

The model types must be updated to their full shapes. These are the types that flow through the bridge to the renderer — React components access fields directly.

**AgentState** (the complete picture):
```ts
interface AgentState {
  id: string              // cc_session_uuid — THE identity
  name: string            // display name
  role: string            // architect, test-arch, fs-eng, test-eng
  nepicId: string         // containing nepic slug
  napkinId: string | null // containing napkin slug (null for architects)
  parentName: string | null
  parentId: string | null // parent agent UUID
  createdAt: number
  started: boolean        // has this UUID ever run a pty
  exited: boolean         // agent died on its own (persistent)
  running: boolean        // pty currently alive (ephemeral)
  done: boolean           // called nap done (ephemeral)
  homePath: string        // absolute path to agent dir
}
```

**NapkinState** (full):
```ts
interface NapkinState {
  id: string              // slug
  slug: string            // directory name
  nepicId: string         // containing nepic slug
  status: NapkinStatus
  path: string            // absolute path
  agents: AgentState[]
}
```

**NepicState** (full):
```ts
interface NepicState {
  id: string              // slug
  slug: string            // directory name
  name: string            // display name
  path: string            // absolute path
  architects: AgentState[]
}
```

**Marker files** persist everything except `running` and `done`:
```json
// .agent.nap.json
{
  "cc_session_uuid": "abc-123",
  "role": "test-arch",
  "name": "001-test-arch",
  "napkin": "0100-explore",
  "nepic": "03-nepic-spaces-v2",
  "parent": "001-architect",
  "parent_id": "def-456",
  "created_at": 1711700000000,
  "started": true,
  "exited": false
}

// .napkin.nap.json
{
  "status": "doing",
  "nepic": "03-nepic-spaces-v2"
}
```

### STOP→RUN transition — three agent cases

All agents have UUIDs (assigned at creation). The `started` flag distinguishes fresh from resumable:

- **Case A** (started + not exited): `claude --verbose --resume <uuid>`
- **Case B** (exited): skip — show gray dot, user can clear exited to resume later
- **Case C** (not started): `claude --verbose --session-id <uuid> "read prompt.md..."` — first run, then set `started: true`

### RUN→STOP transition

Kill all ptys. Save UI state. Done. Do NOT write `exited` flags — this is app quit, not agent death. Markers are already correct from runtime writes.

### What to port from v2

Study these files thoroughly before building:

**PTY management** — `packages/v2/src/main/main.ts` lines 155-222:
- `createPtyProcess()` — node-pty spawn with shell, env, cwd
- `pty.onData` → output buffering until renderer ready, then direct send
- `pty.onExit` → status update (adapt: call model.setAgentExited, not SQLite)
- `outputBuffers`, `readyTerminals` maps
- Extract into `packages/v3/src/main/pty-manager.ts`

**Terminal registry** — `packages/v2/src/renderer/terminal-registry.ts`:
- xterm.js instance creation, FitAddon, Canvas addon
- `getTerminal()`, `createTerminalInstance()`, `disposeTerminal()`
- Copy to v3, it's standalone

**Terminal component** — `packages/v2/src/renderer/components/Terminal.tsx`:
- Container div, xterm mounting, resize observer, DOM reparenting
- Breadcrumb header (can simplify for now)
- **Copy the style objects verbatim** — see design tokens in napkin

**Preload** — `packages/v2/src/main/preload.ts`:
- IPC bridge for pty: create, write, resize, ready, data, exit listeners
- Extend v3's existing preload (which has snapshot/intent channels from 0100)

**Scroll lock** — `packages/v2/src/renderer/scroll-lock.ts`:
- Copy if time allows, not critical for 0200

### Bridge changes

The bridge snapshot (`AppSnapshot`) needs to include terminal lifecycle info alongside model state. The renderer needs to know which agents have live ptys (for dot colors) and receive pty data (for xterm rendering).

Two options:
1. Expand AppSnapshot with agent `running` status (model tracks pty existence)
2. Separate channel for pty events (data, exit) alongside the snapshot channel

Recommendation: option 1 for status (running flag in AgentState), separate IPC channels for pty data streaming (pty:data is high-frequency, shouldn't be in snapshots). This matches v2's pattern.

### Design carry-over

All visual styles must be copied from v2 components. See the napkin's "design carry-over" section for exact color tokens. The instruction is: copy inline style objects verbatim from v2 source files. Don't redesign, don't "clean up", don't change colors or spacing.

### What NOT to do

- Don't add socket server / CLI integration — that's 0300
- Don't build sidebar zoom levels (focused/extended) — that's 0400
- Don't add kanban — that's 0500
- Don't add filesystem watcher for live file updates — 0150 proved the model handles it, but for 0200 the app loads once on start (watcher wiring in the Electron context is a 0300 concern)
- Don't break 0100/0150 tests
