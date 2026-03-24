* agent lifecycle — system design

* three tiers
  * tier 1: bare terminal — `nap start 'command'`
  * tier 2: claude session — `nap start claude "prompt"`
  * tier 3: napkin agent — `nap start claude "prompt" --napkin <slug> --name <name>`
  * each tier adds metadata on top of the previous
  * Cmd+T → tier 2 (claude). Cmd+Shift+T → tier 1 (bare)
  * napkin agents invoked by architect via CLI


* the session object

  ```
  Session {
    // identity
    id: uuid
    name: string
    role: string | null          // architect, test-arch, fs-eng, test-eng

    // state
    status: running | done | new | exited
    pid: number | null
    exitCode: number | null

    // claude (tier 2+)
    ccSessionUuid: uuid | null   // null = tier 1
    command: string              // prompt for claude, full command for bare

    // placement (tier 3)
    napkinSlug: string | null    // null = not in a napkin
    homeDir: string | null       // relative path to agent's dir

    // relationships
    parentId: uuid | null
    nepicId: uuid
    cwd: string

    // timestamps
    createdAt: number
    exitedAt: number | null
    lastResumedAt: number | null
    launches: number             // incremented on each resume
  }
  ```


* state machine

  ```
  [create] → new
  [launch pty] → running
  [nap done] → done (pty stays alive)
  [pty exits, app running] → exited (terminal state)
  [app closes] → NO TRANSITION (status frozen)
  [app opens, status != exited, has uuid] → running (pty re-created)
  ```

  * `exited` is the only terminal state
  * `done` is NOT terminal — agent is idle but resumable
  * app close/open is invisible — not a state transition


* data flow

  ```
  sources → SQLite → store → components

  CLI (nap start)     ──┐
  pty events (exit)    ──┤──→ SQLite ──→ IPC ──→ zustand store ──→ React
  nap done             ──┤                              ↑
  fs watcher           ──┘                     home dir entries
  ```

  * CLI writes to SQLite via socket → main process
  * pty events update SQLite in main process directly
  * fs watcher produces home dir tree (NapkinSnapshot shape)
  * store merges: SQLite metadata + filesystem entries = rich agent model
  * components read from store only — never query SQLite or check PIDs


* what's persisted vs runtime

  ```
  SQLite (survives restart):
    identity, status, ccSessionUuid, napkinSlug, homeDir,
    parentId, nepicId, timestamps, launches, exitCode

  runtime (assembled on launch):
    pid, hasTerminal, home.entries (from fs watcher),
    displayName (computed), resumable (derived), parentName (lookup)
  ```


* resume on app launch

  ```
  read sessions from SQLite
    │
    ├─ has ccSessionUuid AND status != 'exited'
    │   → resumable
    │   ├─ role = 'architect' (most recent) → auto-resume, pin at top
    │   └─ all others → auto-resume in background
    │
    ├─ has ccSessionUuid AND status = 'exited'
    │   → show in UI, manual resume on click
    │
    └─ no ccSessionUuid (tier 1)
        → show in history, not resumable
  ```

  * resume = spawn `claude --verbose --resume <uuid>`
  * new pty, same CC conversation — agent picks up where it left off
  * the feel: you close, you open, everything is there


* the appIsClosing mechanism

  ```
  window-all-closed event
    → set appIsClosing = true
    → killAllPtys()
      → each pty onExit fires
        → if appIsClosing: skip status update
        → if NOT appIsClosing: set status = 'exited', store exitCode
  ```

  * this is what makes close/open invisible
  * without it: every session → 'exited' → nothing resumes


* home directory model

  * every agent CAN have a home dir (tier 2 with --dir, tier 3 always)
  * the sidebar card = window into home dir
  * entries are a tree, same shape as NapkinSnapshot:
    ```
    { type: file, name, absPath }
    { type: dir, name, absPath, entries[] }
    { type: agent, name, absPath, entries[], status, hasTerminal }
    ```
  * napkin agents: home = `30-napkins/<slug>/agents/<name>/`
  * architects: home = `20-architects/<NNN-name>/`
  * free-floating: home = `--dir <path>` or null (card shows [terminal] only)
  * fs watcher watches: `30-napkins/` + `20-architects/`
  * same component renders all cards


* napkin containment

  * napkin = feature scope, unit of work
  * `--napkin <slug>` sets: napkinSlug + homeDir (conventional path)
  * sidebar: agent nested under napkin card
  * napkin extended view: `agents/` children promoted as `type: agent`
    * each decorated with status, hasTerminal from session data
  * multiple agents per napkin is normal
    * multiple TAs, multiple fs-engs — all show as dots on collapsed card


* `nap start` CLI

  ```
  tier 1: nap start 'npm test'
  tier 2: nap start claude "explore the codebase"
  tier 2: nap start claude "explore" --role architect --dir 20-architects/001-Nova
  tier 3: nap start claude "read prompt.md" --napkin 0100 --name 001-test-arch
  tier 3: nap start claude "read prompt.md" --napkin 0100 --name 001-test-arch --role test-arch
  ```

  * `claude` as first arg → tier 2+ (adds --verbose --session-id auto)
  * `--napkin` → tier 3 (sets homeDir, napkinSlug, nests under card)
  * `--role` → metadata (architect, test-arch, fs-eng, test-eng)
    * role=architect: auto-resumed on launch, pinned in sidebar
  * `--dir` → explicit home dir (overrides convention)
  * `--name` → display name


* `nap ps`

  * reads SQLite only — no PID polling
  * SQLite kept current by process events (pty onExit, nap done)
  * shows all metadata:

  ```
  NAME            PID    STATUS   NAPKIN   ROLE        SESSION       RESUMABLE
  Nova            12347  running  -        architect   8e91c...      yes
  001-test-arch   -      done     0100     test-arch   a4f2b...      yes
  002-fs-eng      -      exited   0100     fs-eng      b7c3d...      manual
  shell           12345  running  -        -           -             no
  ```


* architect

  * just a session with `role = 'architect'`
  * created by: `--role architect` on nap start, or by nap init, or by (+) button
  * home: `20-architects/<NNN-name>/`
  * auto-resumed on launch: most recent where role='architect' + status != 'exited'
  * pinned at top of sidebar
  * handoff: old stays in SQLite (resumable), new created
  * same card, same model, same resume mechanics as any agent
