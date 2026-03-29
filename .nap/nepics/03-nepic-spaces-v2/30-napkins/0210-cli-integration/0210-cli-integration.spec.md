## 0210 — CLI integration: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study: the approved CLI design (`agents/001-cli-design/03-cli-design.nap.md`), the v2 socket server and CLI code, and everything in `packages/v3/src/` and `packages/v3/tests/`.

### The approved CLI design

The CLI design at `agents/001-cli-design/03-cli-design.nap.md` is the authoritative reference for command syntax, flags, output format, and behavior. Read it cover to cover. This spec covers implementation constraints the design doesn't address.

### Socket server

Port from `packages/v2/src/main/socket-server.ts`. Same ndjson protocol over unix socket at `.nap/sock`.

Key differences from v2:
- Every handler calls model methods, not SQLite
- New request types: `create-napkin`, `create-agent`, `create-architect`, `create-nepic`, `set-status`, `status` (inspect)
- `start` now finds a pre-created agent by name and spawns it (not create+spawn)
- `done` is in-memory only — no persistence
- `close` is removed
- `kill` is renamed to `stop`

The socket server must start before the window is created (same as v2 — prevents race conditions with CLI commands). Wire it in `main.ts`.

### Model methods to add

The model needs these new methods. All write methods should: update in-memory state, write marker files, call onChange.

```ts
// Entity creation
createNapkin(slug: string, status?: NapkinStatus, nepicId?: string): Promise<NapkinState>
createAgentStub(napkinSlug: string, name: string, role: string, nepicId?: string): Promise<AgentState>
createArchitectStub(name: string, nepicId?: string): Promise<AgentState>
createNepic(slug: string, displayName: string): Promise<NepicState>

// Agent lifecycle
startAgentByName(name: string, prompt?: string, nepicId?: string): Promise<AgentState>
  // Finds agent in model, spawns pty via ptySpawner, sets started+running

// Read-only queries
getStatus(query: { napkin?: string, agent?: string, nepic?: string }): StatusResult
getAllAgentsTree(): AgentTreeNode[]  // grouped by parentId for nap ps
```

### nap init rewrite

Rewrite the `init` command in `packages/v3/src/cli/nap.ts`. This runs without the app.

What it writes:
- `.nap/.gitignore` — `sock\nui-state.json\n`
- `.nap/00-org/` — copy from `src/templates/00-org/`
- `.nap/nepics/01-v1/10-docs/` (empty)
- `.nap/nepics/01-v1/20-architects/001-architect/.agent.nap.json`:
  ```json
  {
    "cc_session_uuid": "<random>",
    "role": "architect",
    "name": "001-architect",
    "nepic": "01-v1",
    "created_at": <now>,
    "started": false
  }
  ```
- `.nap/nepics/01-v1/20-architects/001-architect/prompt.md` — from template
- `.nap/nepics/01-v1/30-napkins/` (empty)
- `.nap/ui-state.json` — `{ "activeNepicId": "01-v1" }`

NO SQLite. NO `sqlite3` dependency. NO `40-board/`. NO `nap.db`.

### nap open rewrite

Drop the path argument. Walk up from cwd to find `.nap/` directory (like git finds `.git/`). The walk-up logic already exists in `packages/v3/src/shared/constants.ts` (`findSocketPath` walks up looking for `.nap/sock`). Adapt or extend it to find `.nap/` itself.

Drop `--architect`, `--name`, `--command` flags. The architect starts automatically via STOP→RUN case C.

### Name resolution

Port from `packages/v2/src/main/name-resolver.ts`. Adapt to use model instead of SQLite.

Per CLI design: exact match within active nepic. Names are unique within a nepic (enforced at create time). On failure, return candidates for "did you mean" suggestions.

### Message queue (poke)

Port from `packages/v2/src/main/message-queue.ts`. Three-step delivery: text → Escape → CR. Wire to ptySpawner's write method.

### CLI rewrite

Rewrite `packages/v3/src/cli/nap.ts` to match the approved CLI design. Key changes:

- `nap create napkin/agent/architect/nepic` — new commands, JSON output
- `nap start <name>` — starts pre-created agent by name
- `nap set-status` — renamed from `nap status <slug> <phase>`
- `nap status` — new read-only inspect command
- `nap stop` — renamed from `nap kill`
- `nap close` — removed
- `nap done` — no arguments
- `nap open` — no path arg, no flags
- `nap ps` — 4 columns: NAME, STATUS, NAPKIN, ROLE

All error messages must be clear and helpful. See CLI design for exact error message formats.

### Design carry-over

Any UI changes (if socket handlers push snapshots that add new entities to the sidebar) must use the existing v3 design tokens. No visual changes needed for 0210 — the sidebar already renders from model snapshots.

### What NOT to do

- Don't change the renderer or sidebar — it already renders from model snapshots
- Don't add new UI features — 0210 is CLI + socket + model plumbing
- Don't break existing 0100/0150/0200 tests
- Don't add SQLite for anything
