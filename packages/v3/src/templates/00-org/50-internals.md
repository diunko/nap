# How it works under the hood

Optional reading for most agents. Required reading for the doctor and anyone debugging system-level issues.

## The two states

The app is either **STOPPED** (files on disk, nothing in memory) or **RUNNING** (model in memory, ptys alive).

**STOPPED:** Only these files exist. This is the complete persistent state.
- `.nap/00-org/` — workflow docs, role files (static, copied from templates on init)
- `.nap/nepics/<slug>/` — nepic dirs with napkins, agents, architects
- `.nap/ui-state.json` — which nepic was active, which terminal was focused
- `.nap/.gitignore` — ignores `sock` and `ui-state.json`
- `.agent.nap.json` — in each agent/architect dir (identity + lifecycle flags)
- `.napkin.nap.json` — in each napkin dir (status)

**RUNNING:** Everything above, plus in-memory model, pty processes, socket server at `.nap/sock`, renderer with xterm instances. When the app stops, all of this vanishes. Next start rebuilds from the files.

No database. No server state file. No reconciliation. Files are truth.

## Complete filesystem layout

```
project-root/
  .claude/
    settings.json                    ← CC settings, includes PermissionRequest hook if guardian enabled
    skills/                          ← napkin + napkin-format skills (if installed)

  .nap/
    .gitignore                       ← MUST contain: sock\nui-state.json
    ui-state.json                    ← { "activeNepicId": "01-v1" }
    sock                             ← unix socket (only while app running, gitignored)

    00-org/
      10-promise.nap.md              ← why we work this way
      20-workflow.nap.md             ← team, pipeline, communication
      30-structure.nap.md            ← filesystem layout, naming, extensions
      40-roles/
        architect.md
        guardian.md                  ← only if --guardian was used
        test-architect.md
        fullstack-eng.md
        test-eng.md
      50-internals.md                ← this file

    nepics/
      <NN>-<name>/                   ← e.g. 01-v1, 02-spaces
        10-docs/
          01-inputs.nap.md           ← seed mega-napkin (if --template was used)
        15-feedback/
          issues.md
          wishlist.md
        20-architects/
          001-architect/
            .agent.nap.json          ← REQUIRED
            prompt.md                ← REQUIRED
            onboarding/              ← optional, architect may create
            scratch/                 ← optional, architect's working area
          002-guardian/               ← only if guardian enabled
            .agent.nap.json
            prompt.md
            learned-policies.md      ← guardian writes here, grows over time
        30-napkins/
          <NNNN>-<name>/             ← e.g. 0100-feature
            .napkin.nap.json         ← REQUIRED for app to know status
            <slug>.nap.md            ← the napkin
            <slug>.spec.md           ← architect writes
            <slug>.stories.md        ← architect writes
            <slug>.test.md           ← TA writes
            agents/
              <NNN>-<role>-<subject>/  ← e.g. 001-test-arch-feature
                .agent.nap.json      ← REQUIRED for app to see this agent
                prompt.md            ← REQUIRED (architect writes before launch)
                response.md          ← agent writes when done
                questions.md         ← agent writes if stuck
```

## Marker file anatomy

### .agent.nap.json

Every agent and architect has one. This is their identity and lifecycle state.

```json
{
  "cc_session_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "role": "fs-eng",
  "name": "002-fs-eng-feature",
  "nepic": "01-v1",
  "created_at": 1711700000000,
  "started": false,
  "exited": false,
  "archived": false,
  "done": false
}
```

**Field by field:**

| Field | Type | Required | Meaning |
|---|---|---|---|
| `cc_session_uuid` | string (UUID) | YES | THE identity. Used for `--session-id` (first launch) and `--resume` (subsequent). If missing, agent can't have a CC session. |
| `role` | string | YES | One of: `architect`, `guardian`, `test-arch`, `fs-eng`, `test-eng`. Used for display, guardian judgment, name resolution. |
| `name` | string | YES | Display name. Must match directory name. Used for `nap3 start <name>`. |
| `nepic` | string | NO | Nepic slug. Derived from path if missing. |
| `created_at` | number (epoch ms) | YES | When the agent was created. Used for ordering in sidebar. |
| `started` | boolean | NO (default false) | Has this agent ever launched a CC session? `false` = never started, `true` = has been started at least once. On startup, app resumes agents where `started: true` and not `exited: true`. |
| `exited` | boolean | NO (default false) | Did the pty exit on its own (not from app shutdown)? `true` = don't auto-resume. User must manually restart. |
| `archived` | boolean | NO (default false) | Is this a dead session? Set when CC session can't be found (`--resume` fails with "No conversation found"). Archived agents show successor prompt on click. |
| `done` | boolean | NO (default false) | Did the agent call `nap3 done`? Persisted so it survives app restart. `done: true` + `exited: false` = agent finished work but session is still resumable. |

**Agent lifecycle through marker fields:**

```
Created:     { started: false, exited: false, done: false, archived: false }
                ↓  nap3 start
Started:     { started: true,  exited: false, done: false, archived: false }
                ↓  agent calls nap3 done
Done:        { started: true,  exited: false, done: true,  archived: false }
                ↓  pty process exits
Exited:      { started: true,  exited: true,  done: true,  archived: false }
                ↓  CC session expires / can't be found
Archived:    { started: true,  exited: true,  done: true,  archived: true  }
                ↓  user clicks "invoke successor"
Successor:   new .agent.nap.json with fresh UUID, started: true, done: false
```

**Special cases:**
- Agent crashed (pty died without `nap3 done`): `{ started: true, exited: true, done: false }` — will not auto-resume
- Agent alive but idle (CC waiting for input): `{ started: true, exited: false, done: false }` — will auto-resume
- Never launched: `{ started: false }` — `nap3 start <name>` sets started + spawns pty

### .napkin.nap.json

Every napkin dir should have one. Contains status.

```json
{
  "status": "doing"
}
```

Valid values: `backlog`, `todo`, `doing`, `review`, `done`.

If missing: app treats the napkin as `backlog` by default. The napkin dir still shows in the sidebar (directory existence = napkin existence) but status will be unknown.

### ui-state.json

At `.nap/ui-state.json`. Written by the app on shutdown. Read on startup.

```json
{
  "activeNepicId": "01-v1"
}
```

If missing: app uses the last nepic alphabetically.

### .claude/settings.json (guardian hook)

At project root (not inside .nap/). CC reads this automatically for all sessions in this project.

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "nap3 hook permission-request"
          }
        ]
      }
    ]
  }
}
```

If guardian dir exists but this config is missing: guardian was scaffolded but hook not wired. Permissions won't flow to guardian.

## What happens on app startup (step by step)

1. Read `ui-state.json` → determine active nepic (or default to last)
2. Walk `nepics/<active>/30-napkins/` → list napkin dirs
3. For each napkin dir: read `.napkin.nap.json` → get status. Read dir contents → build file tree.
4. For each napkin: walk `agents/` subdir → list agent dirs
5. For each agent dir: read `.agent.nap.json` → get identity + lifecycle flags. Read dir contents → build file tree.
6. Walk `nepics/<active>/20-architects/` → same as agents
7. Build model in memory: napkins with agents, statuses, file trees
8. Start file watcher on `30-napkins/` and `20-architects/` (debounced 200ms)
9. Start socket server at `.nap/sock`
10. For each agent where `started: true AND exited: false AND NOT archived`:
    - Spawn `claude --verbose --resume <cc_session_uuid>`
    - If resume fails fast (pty exits within ~5s with "No conversation found"): mark `archived: true`, show successor prompt
11. Create Electron window, push model snapshot to renderer via bridge

**If something is missing at any step:** The app doesn't crash. Missing markers → defaults. Missing dirs → skipped. The app shows what it can find.

## What happens on app shutdown

1. Kill all pty processes (SIGHUP)
2. Save `ui-state.json` (active nepic)
3. Close socket server, remove `.nap/sock`
4. Memory dies

**What does NOT happen:** No marker files are modified on shutdown. No "save state." The markers were already written during runtime. An agent that was running when the app closed will have `started: true, exited: false` — and will auto-resume next startup.

## The CLI and what it touches on disk

Every `nap3` command that modifies state goes through the socket to the running app. The app's model handles the actual file writes. Exception: `nap3 init`, `nap3 setup`, and `nap3 doctor` work without the app running.

| Command | Files created/modified |
|---|---|
| `nap3 init` | Creates entire `.nap/` tree from templates. Writes `.agent.nap.json` for architect. No socket needed. |
| `nap3 init --guardian` | Also creates `002-guardian/` dir + marker, writes `.claude/settings.json` |
| `nap3 init --template <name>` | Also copies seed.nap.md to `10-docs/01-inputs.nap.md` |
| `nap3 setup --guardian` | Creates guardian + hook config. Idempotent. No socket needed. |
| `nap3 setup --skills` | Copies skill files to `.claude/skills/`. No socket needed. |
| `nap3 setup --import` | Scans for unmarked agents/napkins, creates markers. No socket needed. |
| `nap3 create napkin <slug>` | Creates dir + `.napkin.nap.json` + `agents/` dir. Via socket. |
| `nap3 create agent <napkin> <name> <role>` | Creates agent dir + `.agent.nap.json` (started: false). Via socket. |
| `nap3 start <name> [prompt]` | Sets `started: true` in marker. Spawns pty with `--session-id <uuid>`. Via socket. |
| `nap3 done` | Sets `done: true` in model (persisted to marker). Via socket. Agent calls this from inside its pty. |
| `nap3 set-status <slug> <status>` | Writes `.napkin.nap.json`. Via socket. |
| `nap3 stop <name>` | Kills pty. Sets `exited: true` in marker. Via socket. |
| `nap3 poke <name> <msg>` | Writes to pty stdin (three-step: text → Esc → CR). Via socket. |
| `nap3 key <name> <key>` | Writes raw bytes to pty stdin. Via socket. |
| `nap3 ps` | Reads from model. No file changes. Via socket. |
| `nap3 doctor` | Spawns claude with baked-in diagnostic prompt. No socket, no app needed. |

## The socket protocol

Unix socket at `.nap/sock`. NDJSON (newline-delimited JSON). Request-response pattern.

Every request has `{ type, id, ... }`. Every response has `{ id, ok, ... }` or `{ id, error, message }`.

The one exception: `hook-permission-request` hangs until resolved. Uses a pending registry with keepalive pings.

## The file watcher

Watches `30-napkins/` and `20-architects/` recursively while app is running.

When a file changes:
1. Watcher fires with event type and filename
2. Debounce timer starts (200ms) — batches rapid changes
3. After debounce: model re-reads the affected area from disk
4. Model pushes updated snapshot to renderer

**Write-echo suppression:** When the model writes a marker file (e.g., `nap3 set-status`), it sets a `hasPendingWrite` flag. When the debounce fires and the flag is set, the model skips the re-read (it already has the correct state in memory). Flag clears after debounce.

## The permission flow

Full path for a tool permission request:

```
Agent runs tool
    → CC fires PermissionRequest hook
    → spawns: nap3 hook permission-request
    → reads stdin (JSON: tool_name, tool_input, session_id)
    → sends socket request to app
    → app sets agent.pendingApproval in model
    → bridge pushes snapshot → renderer shows blinking dot + modal
    → app pokes guardian with structured message
    → guardian reads prompt.md, judges, runs: nap3 permission-response --agent <id> --decision allow|deny
    → app resolves pending request
    → hook unblocks, prints decision to stdout
    → CC reads decision, proceeds or stops
```

If guardian not running: modal shows in UI, person can approve/deny directly.
If person dismisses modal: hook times out, CC shows its own permission dialog.

## Common failure patterns

**Agent dir exists but no `.agent.nap.json`:**
App doesn't see this agent. It's invisible. Fix: `nap3 setup --import` creates markers for unmarked agents.

**Marker has `started: true` but UUID is missing:**
Agent was somehow created without a UUID. Can't resume. Fix: generate a new UUID, set `started: false`, re-launch with `nap3 start`.

**Agent has `response.md` but `done: false`:**
Agent wrote its output but didn't call `nap3 done`. The architect is still blocked on `nap3 nap`. Fix: manually set `done: true` in marker, or poke the agent to run `nap3 done`.

**Guardian dir exists but no hook in `.claude/settings.json`:**
Guardian was scaffolded but permissions don't flow to it. CC shows its own permission dialog instead. Fix: `nap3 setup --guardian` writes the hook config.

**`ui-state.json` references a nepic that doesn't exist:**
App falls back to last nepic alphabetically. Not a crash, but confusing. Fix: update activeNepicId or delete ui-state.json (app recreates on shutdown).

**Napkin dir without `.napkin.nap.json`:**
App shows the napkin (directory = existence) but with default status `backlog`. Board/kanban may show wrong state. Fix: `nap3 set-status <slug> <actual-status>` or `nap3 setup --import`.

**Multiple architects in `20-architects/` with same role:**
Succession. First architect's context ran out, second was created. Check markers: the one with `exited: false` or most recent `created_at` is the active one. Both appearing is correct if one is archived/retired.

**Socket file `.nap/sock` exists but app isn't running:**
Stale socket from a crash. CLI commands will fail with "connection refused." Fix: delete `.nap/sock`. App creates a fresh one on next `nap3 open`.

**Agent stuck in `started: true, exited: false, done: false` but no pty alive:**
App crashed while agent was running. On next startup, app will try to resume. If CC session is still valid, it works. If expired, agent gets marked `archived: true` and shows successor prompt.
