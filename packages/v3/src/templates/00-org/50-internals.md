# How it works under the hood

Optional reading. Most agents never need this — read your role file, read the workflow, do your job. But when you need to understand *why* something behaves the way it does, or when your feature touches the plumbing, this is the map.

## Start from the simplest thing

You have files on disk. That's it. That's the entire persistent state.

```
.nap/nepics/01-v1/30-napkins/0100-feature/.napkin.nap.json    → { "status": "doing" }
.nap/nepics/01-v1/30-napkins/0100-feature/agents/001-ta/.agent.nap.json → { "uuid": "...", "role": "test-arch", ... }
```

There's no database. No server storing state. Just JSON files in directories. If you delete a marker file, the app forgets that agent. If you create one, the app discovers it. The filesystem IS the truth.

## What happens when the app starts

The app reads those files and builds a model in memory:

```
files on disk  →  model (in memory)  →  what you see in the UI
```

1. Walk `.nap/nepics/<active>/30-napkins/` — find napkin dirs, read `.napkin.nap.json` for status
2. Walk `agents/` inside each napkin — find agent dirs, read `.agent.nap.json` for identity
3. Walk `20-architects/` — find architect and guardian agents
4. Build the model: napkins with their agents, statuses, file trees
5. For each agent with a UUID and `started: true` and not `exited: true` — resume via `claude --resume <uuid>`

That's the entire startup. No reconciliation, no migration, no sync. Read files, build model, resume sessions.

## What happens when the app stops

Memory dies. That's it.

The model, the pty processes, the UI state — all gone. The marker files on disk are untouched. Next time the app starts, it reads them again and rebuilds everything.

This is the **two-state model**: the app is either STOPPED (files on disk, nothing in memory) or RUNNING (model in memory, ptys alive). The two transitions:
- **Start (s→r):** read files → build model → resume agents
- **Stop (r→s):** kill ptys → memory dies → files unchanged

No special shutdown logic. No "save before quit." The files were already written during runtime.

## The three actors

### The app (Electron)

Two processes, one bridge:

```
Main process                          Renderer process
┌─────────────────────┐              ┌──────────────────────┐
│  Model              │   bridge     │  Store (zustand)     │
│  (business state)   │ ──────────→ │  (UI state)          │
│                     │  snapshots   │                      │
│  PTY manager        │              │  Sidebar, Terminal,  │
│  Socket server      │ ←────────── │  Kanban, Gutter      │
│  File watcher       │   intents   │                      │
└─────────────────────┘              └──────────────────────┘
```

**Main process** owns the model — napkins, agents, statuses, file I/O, pty lifecycle. When the model changes, it pushes a full snapshot to the renderer through the bridge (Electron IPC).

**Renderer process** is a view client. It receives snapshots, stores them in zustand, renders React components. It sends intents back (e.g., "switch to this terminal") but never modifies the model directly.

**The bridge** is typed IPC. Main pushes `AppSnapshot` (napkins, agents, statuses). Renderer sends `AppIntent` (user actions). They never share memory.

### The CLI (`nap3`)

The CLI is a separate process. It doesn't import Electron, doesn't touch the model directly. It talks to the running app through a Unix socket at `.nap/sock`.

```
nap3 start 001-ta "read prompt.md"
    │
    ▼
  socket (.nap/sock)
    │
    ▼
  main process → model.startAgent() → pty spawned → bridge pushes snapshot → UI shows new dot
```

Every CLI command follows this pattern: CLI sends a request over the socket → main process handles it by calling model methods → model updates → bridge pushes to renderer.

Key commands and what they do in the model:
- `nap3 create napkin` → model creates dir + marker file
- `nap3 create agent` → model creates agent dir + marker (no pty yet)
- `nap3 start <name>` → model finds agent, spawns pty with `claude --session-id <uuid>`
- `nap3 done` → model marks agent as done (in memory — ephemeral)
- `nap3 set-status` → model updates `.napkin.nap.json` on disk
- `nap3 ps` → model returns agent tree
- `nap3 poke` → main process writes to agent's pty input

### The agents (Claude Code sessions)

Each agent is a Claude Code session running in its own pty. The app manages the pty — spawning, input routing, output buffering. The agent sees a normal terminal.

Agents communicate through files:
- **prompt.md** — what the architect wants them to do (input)
- **response.md** — what they deliver (output)
- **questions.md** — when they're stuck (escalation)
- **`nap3 done`** — the completion signal (goes through CLI → socket → model)

Agents don't know about the model, the bridge, or the renderer. They just have a terminal, a prompt, and `nap3 done`.

## Marker files in detail

**`.agent.nap.json`** — agent identity and lifecycle:
```json
{
  "cc_session_uuid": "abc-123",     // THE identity — used for resume
  "role": "fs-eng",                  // architect, guardian, test-arch, fs-eng, test-eng
  "name": "002-fs-eng-feature",     // display name
  "nepic": "01-v1",                 // which nepic
  "created_at": 1711700000000,      // when created
  "started": true,                   // has launched a CC session
  "exited": true,                   // pty exited on its own (don't auto-resume)
  "archived": true,                  // dead session, needs successor
  "done": false                     // called nap3 done (persisted so it survives restart)
}
```

**`.napkin.nap.json`** — napkin status:
```json
{ "status": "doing" }
```
Valid values: `backlog`, `todo`, `doing`, `review`, `done`.

**`ui-state.json`** — which nepic was active:
```json
{ "activeNepicId": "01-v1" }
```

## The file watcher

While the app is running, it watches `30-napkins/` and `20-architects/` for changes. When a file changes on disk (an agent writes response.md, the person edits a napkin in their editor), the watcher triggers a debounced reload — the model re-reads the affected area and pushes an updated snapshot.

The debounce is 200ms — rapid changes collapse into one model update.

When the model itself writes a marker file (e.g., `nap3 set-status` updates `.napkin.nap.json`), it sets a flag to ignore the watcher echo. Otherwise it would re-read its own write and fire a redundant update.

## The permission system

When an agent runs a tool (Bash command, file write, etc.), Claude Code fires a `PermissionRequest` hook. The hook is configured in `.claude/settings.json` to call `nap3 hook permission-request`.

The flow:
1. Agent triggers tool → CC fires hook → `nap3 hook permission-request` runs
2. Hook reads the request from stdin, sends it to the app via socket
3. App marks the agent as "pending approval" in the model → bridge pushes → UI shows blinking dot
4. App pokes the guardian agent with the request details
5. Guardian reads the agent's prompt.md, judges, runs `nap3 permission-response --agent <id> --decision allow|deny`
6. App resolves the pending request → hook unblocks → CC proceeds or stops

If no guardian is running, the request shows as a modal in the UI. The person can approve/deny directly, or dismiss it to let CC's own permission dialog handle it.
