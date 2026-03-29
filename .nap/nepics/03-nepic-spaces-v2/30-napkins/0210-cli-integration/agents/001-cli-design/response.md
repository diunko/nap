# NAP v3 CLI Design

## Design philosophy

Three users, three levels of complexity:

- **Human**: `nap init`, `nap open`, occasionally `nap ps`. Wants zero friction.
- **Architect agent**: `nap start`, `nap nap`, `nap status`, `nap create napkin`, `nap ps`, `nap log`, `nap peek`, `nap kill`. The power user. Every flag matters.
- **Worker agent**: `nap done`. That's it. One command, no args.

The CLI is a thin socket client. Every command except `init` and `open` sends an ndjson request to the running app's unix socket (`.nap/sock`) and prints the response. The model owns all writes. The CLI owns no state.

---

## Command reference

### nap init

Bootstrap a project. The one command that runs WITHOUT the app.

```
nap init [--name <name>] [--add-skills [--user]]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--name <name>` | cwd basename | Project display name |
| `--add-skills` | false | Copy napkin/napkin-format skills to .claude/skills/ |
| `--user` | false | With --add-skills: install to ~/.claude/skills/ instead |

**Who uses it:** Human, once.

**What it writes to disk:**

```
.nap/
  .gitignore                      ← sock\nui-state.json\n*.agent.nap.json\n
  00-org/                         ← copied from templates
    10-promise.nap.md
    20-workflow.nap.md
    30-skills.nap.md
    40-roles/
      architect.md
      test-arch.md
      fullstack-eng.md
      test-eng.md
  nepics/
    01-v1/
      10-docs/
      20-architects/
        001-architect/
          .agent.nap.json         ← see below
          prompt.md               ← from template
      30-napkins/
  ui-state.json                   ← { "activeNepicId": "01-v1" }
```

**The architect marker** (`.agent.nap.json`):
```json
{
  "cc_session_uuid": "<random-uuid>",
  "role": "architect",
  "name": "001-architect",
  "nepic": "01-v1",
  "created_at": 1711700000000,
  "started": false
}
```

**What changed from v2:**
- No SQLite. No `sqlite3` CLI dependency. No `nap.db`.
- No `40-board/` symlink directories. Status lives in `.napkin.nap.json`.
- `.gitignore` updated: drops `nap.db*`, adds `ui-state.json` and `*.agent.nap.json` (marker files are per-session state, not project history).
- Architect is a marker file stub, not a SQLite row.

**Why drop 40-board/:** In v3, the model reads `.napkin.nap.json` for status and pushes to the renderer. Symlinks are redundant. The kanban reads from the model, not the filesystem. Maintaining two representations (marker + symlink) for one fact (status) is a bug waiting to happen.

---

### nap open

Launch the Electron app for a project directory.

```
nap open [path]
```

| Arg/Flag | Default | Description |
|----------|---------|-------------|
| `path` | `.` | Project directory |

**Who uses it:** Human.

**What happens:** Finds electron binary, spawns detached `electron main.js --cwd <path>`. The app's STOP→RUN transition reads all markers and starts the architect if it hasn't been started yet (case C from 0200 napkin).

**What changed from v2:**
- Removed `--architect` flag. The architect is always pre-created by `nap init`. The app starts it automatically on first open (not started → `claude --verbose --session-id <uuid>`). On subsequent opens, it resumes (started + not exited → `claude --verbose --resume <uuid>`). No flag needed.
- Removed `--name` and `--command`. These controlled the first terminal. In v3, the first terminal IS the architect — its name and command come from the marker file and the resume logic.

**Why:** Simpler is better. `nap init` does setup, `nap open` opens. No flags to get wrong. The architect lifecycle is encoded in the marker, not in CLI arguments.

---

### nap start

Create an agent and spawn its process. Requires running app.

```
nap start [claude] <command|prompt> [--name <name>] [--napkin <slug>] [--role <role>] [--dir <path>] [--cwd <path>]
```

| Arg/Flag | Default | Description |
|----------|---------|-------------|
| `claude` | — | Keyword: start a Claude session. Auto-injects `--verbose --session-id <uuid>`. |
| `command\|prompt` | required | Shell command (bare) or Claude prompt (after `claude` keyword) |
| `--name <name>` | `agent-N` | Display name. Used in sidebar, `nap ps`, and name resolution. |
| `--napkin <slug>` | none | Ties agent to a napkin. Agent dir created at `30-napkins/<slug>/agents/<name>/`. |
| `--role <role>` | none | Metadata: `architect`, `test-arch`, `fs-eng`, `test-eng` |
| `--dir <path>` | derived | Override home directory (overrides `--napkin`-derived path) |
| `--cwd <path>` | project cwd | Working directory for the spawned process |

**Who uses it:** Architect agent (primary), Human (occasionally for ad-hoc agents).

**Flow:**
1. CLI → socket: `{ type: 'start', command, isClaude, name, napkinSlug, role, homeDir, cwd, parentId }`
2. Socket handler → `model.createAgent(napkinSlug, { name, role, cc_session_uuid: newUUID })`
3. Model writes `.agent.nap.json` to agent's home dir (creates dir if needed)
4. Socket handler → `ptySpawner.spawn(finalCommand)` — if `isClaude`, injects `--session-id <uuid>`
5. Model marks agent as started + running
6. Push snapshot → renderer shows new green dot
7. Socket → CLI: `{ sessionId, name }`

**parentId:** Automatically set from `NAP_SESSION_ID` env var. When the architect calls `nap start`, the new agent's parent is the architect. This is how the tree in `nap ps` works.

**Agent dir creation:** If `--napkin 0100 --name 001-test-arch` is given and `30-napkins/0100/agents/001-test-arch/` doesn't exist, `nap start` creates it. If it already exists (architect pre-created it with prompt.md), `nap start` writes the marker into the existing dir. Either way works.

**Typical architect usage:**
```bash
# Create agent dir and write prompt first
mkdir -p .nap/nepics/01-v1/30-napkins/0100-feature/agents/001-test-arch
# ... write prompt.md ...

# Then start
nap start claude "read .nap/nepics/01-v1/30-napkins/0100-feature/agents/001-test-arch/prompt.md and follow its instructions" \
  --name 001-test-arch --napkin 0100-feature --role test-arch
```

**Output:** `{"id":"<uuid>","name":"001-test-arch"}`

---

### nap done

Signal that the current agent has completed its work. Requires running app.

```
nap done
```

No arguments. No message. Period.

**Who uses it:** Worker agents, architect agent.

**How it works:**
1. Reads `NAP_SESSION_ID` from env (injected by the pty spawner)
2. CLI → socket: `{ type: 'done', sessionId }`
3. Socket handler → `model.setAgentDone(id)` — in-memory only, NOT persisted
4. Push snapshot → dot turns blue
5. The pty stays alive. Done is a signal, not an exit.

**Why no message:** Done messages were a v2 mistake. They arrive in the architect's terminal as if the human typed them. The architect can't distinguish `nap done "some text"` from the human typing. All agent-to-agent communication goes through files (response.md, questions.md). `nap done` is purely a completion signal.

**Error if not inside nap:** If `NAP_SESSION_ID` is not set, prints "not running inside nap" and exits 1.

---

### nap ps

List all agents in the active nepic. Requires running app.

```
nap ps [--json]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--json` | false | Output raw JSON instead of formatted tree |

**Who uses it:** Human, Architect agent.

**Default output (tree view):**
```
NAME                      STATUS     NAPKIN             ROLE
[Architect] 001-architect ● running                     architect
  001-test-arch           ● done     0100-feature       test-arch
  002-fs-eng              ● running  0100-feature       fs-eng
  003-test-eng            ◌ exited   0100-feature       test-eng
  004-test-arch           ● running  0200-persistence   test-arch
```

**What changed from v2:**
- Removed PID column. PIDs are internal — agents don't need them, humans don't use them.
- Removed SESSION column. CC session UUIDs are internal.
- Removed RESUMABLE column. Resume logic is automatic in v3 — there's nothing for the user to act on.
- Kept: NAME, STATUS, NAPKIN, ROLE. These are what the architect actually reads.
- Tree structure by parentId — same as v2.

---

### nap status

Set a napkin's pipeline phase. Requires running app.

```
nap status <napkin-slug> <status>
```

| Arg | Description |
|-----|-------------|
| `napkin-slug` | Exact slug, e.g. `0100-feature` |
| `status` | One of: `backlog`, `todo`, `doing`, `review`, `done` |

**Who uses it:** Architect agent (primary), Human (occasionally).

**Flow:**
1. CLI → socket: `{ type: 'napkin-status', napkinSlug, status }`
2. Socket handler → `model.setNapkinStatus(slug, status)` → writes `.napkin.nap.json`
3. Push snapshot → phase label changes in sidebar and kanban

**Output:** `0100-feature → doing`

**No symlinks.** v2 moved symlinks in `40-board/`. v3 writes `.napkin.nap.json` and that's it. The model is the kanban.

---

### nap nap

Wait for an agent to complete. Blocks until the agent signals done or exits. Requires running app.

```
nap nap <name> [--timeout <seconds>]
```

| Arg/Flag | Default | Description |
|----------|---------|-------------|
| `name` | required | Agent name (supports fuzzy resolution) |
| `--timeout <secs>` | 600 | Max wait time in seconds |

**Who uses it:** Architect agent (primary).

**How it works:** Polls the socket every second for agent status. Exits 0 when status is `done` or `exited`. Exits 1 on timeout.

**What changed from v2:** No done message printed on completion. The architect reads `response.md` instead.

---

### nap create napkin

Create a new napkin. Requires running app.

```
nap create napkin <slug> [--status <status>]
```

| Arg/Flag | Default | Description |
|----------|---------|-------------|
| `slug` | required | Napkin slug, e.g. `0300-new-feature` |
| `--status` | `backlog` | Initial status |

**Who uses it:** Architect agent.

**This is NEW — not in v2.**

**Flow:**
1. CLI → socket: `{ type: 'create-napkin', slug, status }`
2. Socket handler → model creates `30-napkins/<slug>/` dir + `agents/` subdir
3. Model writes `.napkin.nap.json` with status
4. Push snapshot → new napkin appears in sidebar

**Why not just mkdir:** The model owns all marker writes while the app is running. `mkdir` would create the dir, and the watcher would eventually pick it up (200ms debounce), but without a `.napkin.nap.json` marker the status defaults to backlog and there's a race window. `nap create napkin` is atomic: one command, correct state, immediate UI update.

---

### nap poke

Send input text to a running agent's terminal. Requires running app.

```
nap poke <name> <message>
```

| Arg | Description |
|-----|-------------|
| `name` | Agent name (supports fuzzy resolution) |
| `message` | Text to send |

**Who uses it:** Human (only).

**How it works:** socket → find agent's pty → three-step delivery (text → Escape → CR). Ported from v2's message-queue.ts.

**NOT for agent-to-agent communication.** The receiving agent can't tell who sent the input. Agents communicate through files. Poke is for humans nudging a stuck agent.

---

### nap peek

Focus a terminal in the UI. Requires running app.

```
nap peek <name>
```

**Who uses it:** Architect agent, Human.

**How it works:** socket → tell renderer to `setActive(id)`. The UI switches to that agent's terminal.

---

### nap log

Dump an agent's terminal scrollback to stdout. Requires running app.

```
nap log <name>
```

**Who uses it:** Architect agent (primary — reads agent output without switching terminals).

**How it works:** socket → renderer → read xterm buffer → return lines. Same round-trip as v2.

---

### nap kill

Kill an agent's process. Requires running app.

```
nap kill <name>
```

**Who uses it:** Architect agent, Human.

**Flow:**
1. CLI → socket: `{ type: 'kill', name }`
2. Socket handler → `ptySpawner.kill(pid)` + `model.setAgentExitedById(id)`
3. Writes `exited: true` to marker
4. Push snapshot → dot turns gray

**Agent won't auto-resume on next app start** (exited flag is set).

---

### nap close — REMOVED

**v2 had `nap close` (kill + remove from session list). v3 drops it.**

**Why:** In v2 with SQLite, "remove" meant deleting the row. In v3, agents are directories with marker files. "Removing" an agent means... what? Deleting the directory? That destroys response.md, prompt.md, the entire agent record. Adding a `hidden: true` flag to the marker is complexity for a rare use case.

Use `nap kill` to stop agents. Agent directories are permanent records — they're the project's history. If the sidebar gets cluttered, that's a UI filtering problem, not a CLI problem.

---

## Context resolution

### Nepic context

**No `--nepic` flag.** The app tracks the active nepic in `ui-state.json`. All socket commands operate on the active nepic. The CLI doesn't need to know which nepic — the model does.

If the architect needs to work across nepics, the human switches in the UI. In practice, architects live and die within one nepic. Cross-nepic operations are a future problem.

### Napkin context

**Explicit via `--napkin <slug>`.** The architect always knows which napkin they're targeting. No cwd inference — too fragile, too magical.

```bash
# Always explicit
nap start claude "read prompt.md" --napkin 0100-feature --name 001-test-arch
nap status 0100-feature doing
nap create napkin 0300-new-feature
```

The napkin slug is the directory name under `30-napkins/`. It's short, human-readable, and unique within a nepic.

### Agent context (NAP_SESSION_ID)

Injected by the pty spawner as an environment variable. Used by `nap done` to identify the calling agent. Agents never need to pass their own identity — it's in the env.

---

## Name resolution strategy

Agent names are the primary CLI identifier. UUIDs are internal.

**Resolution order:**
1. **Exact match** — `001-test-arch` matches `001-test-arch`
2. **Suffix match** — `test-arch` matches `001-test-arch`
3. **Substring match** — `test` matches `001-test-arch`

**Rules:**
- If zero matches: error `"no agent matching '<name>'"`
- If exactly one match: use it
- If multiple matches: error with list of candidates
  ```
  ambiguous name 'test': matches 001-test-arch, 003-test-eng
  ```
- Napkin slugs are always exact match — no fuzzy (they're short and unique)

**Same as v2's name-resolver.ts** — port it, adapt to use model instead of SQLite.

---

## Socket protocol changes

Extend v2's ndjson protocol. Don't break existing message types.

**New request types:**
- `create-napkin`: `{ type: 'create-napkin', id, slug, status? }` → `{ id, slug }`
- All existing types (`start`, `done`, `ps`, `kill`, `peek`, `log`, `poke`, `status`, `napkin-status`) carry forward

**Modified request types:**
- `start`: add `napkinSlug`, `role`, `homeDir` fields (already present in v2 code)

**All requests carry a correlation `id`** — same pattern as v2.

---

## What changed from v2 — summary

| Area | v2 | v3 |
|------|----|----|
| Init persistence | SQLite via `sqlite3` CLI | JSON marker files |
| Board status | Symlinks in 40-board/ | .napkin.nap.json |
| `nap open` flags | `--architect`, `--name`, `--command` | None (path only) |
| `nap done` args | `[message]` | None |
| `nap ps` columns | NAME, PID, STATUS, NAPKIN, SESSION, RESUMABLE | NAME, STATUS, NAPKIN, ROLE |
| `nap close` | Exists | Removed |
| `nap create napkin` | Does not exist | New |
| `nap create agent` | Does not exist | Not needed (nap start handles both) |
| .gitignore | `nap.db`, `nap.db-shm`, `nap.db-wal`, `sock` | `sock`, `ui-state.json`, `*.agent.nap.json` |
| Status help text | "updates SQLite and board symlinks" | "updates napkin marker" |

---

## Decisions and reasoning

### Why no `nap create agent`

The 0210 napkin floated this: create an agent dir + marker without spawning. The use case: architect sets up the dir, writes prompt.md, then starts separately.

In practice, the architect already writes prompt.md to the filesystem (it's not a marker file — it's an artifact). `nap start` creates the marker and spawns in one step. If the agent dir already exists (architect pre-created it), `nap start` writes the marker into the existing dir.

Two-step create-then-start adds a command, a socket message type, and a new model state (agent exists but has no pty and hasn't been started). All for a workflow that's already handled by filesystem writes + `nap start`.

### Why remove `--architect` from `nap open`

In v2, `--architect` was the only way to get an architect running on first launch. In v3, `nap init` creates the architect stub with a UUID and `started: false`. On STOP→RUN, the app detects this and starts it automatically (case C: `--session-id <uuid>`). The flag is unnecessary.

This also means `nap open` is idempotent: first run starts the architect, subsequent runs resume it. No flag to remember.

### Why remove done messages

v2 allowed `nap done "some text"` which injected text into the architect's terminal. Two problems:
1. The architect can't distinguish agent messages from human input
2. It encouraged chatty done signals instead of structured response.md files

v3 enforces the file-based communication contract: agents write response.md, call `nap done` (bare signal), architect reads response.md after `nap nap` returns. Clean separation.

### Why drop 40-board/ and symlinks

v2 tracked napkin status in two places: SQLite (the truth) and symlinks (the filesystem representation). v3 has one source: `.napkin.nap.json`. The model reads it, the kanban renders from the model. Symlinks add a second representation that must be kept in sync — exactly the kind of complexity v3 exists to eliminate.

The board directories were useful in v2 for humans browsing the filesystem. In v3, the human uses the kanban overlay (Cmd+`). If someone really needs to see status from the terminal, `nap ps` covers it.

### Why PID is gone from `nap ps`

PIDs are process-level details that neither architects nor humans act on. The architect says `nap kill 001-test-arch`, not `nap kill 12345`. Showing PIDs clutters the output without adding actionable information.

### Why no `--nepic` flag anywhere

The active nepic is UI state. The human sees it in the gutter. The architect works within it. Cross-nepic commands would mean the CLI needs to understand nepic resolution, the socket needs nepic routing, and the model needs cross-nepic queries. All for a use case that doesn't exist in the journeys.

If we ever need it, adding `--nepic` later is backward-compatible.

### Why napkin slugs are exact match only

Napkin slugs are short (`0100-feature`), typed by architects who know exactly what they're targeting, and appear in `nap ps` output. Fuzzy matching on slugs would be surprising — `nap status 01 doing` accidentally matching `0100-feature` when you meant `0110-something` is worse than typing the full slug.

Agent names get fuzzy matching because the architect types them dozens of times and they follow a naming convention (`001-test-arch`, `002-fs-eng`) where prefix/suffix matching is natural.
