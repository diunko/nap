* 0210 — CLI integration
  * all entity management goes through the running app
  * CLI → socket → model → marker writes
  * one writer (the model), one exception (nap init)

* the rule
  * the model owns all marker file writes while the app is running
  * the CLI never writes markers directly (except nap init)
  * all CLI commands require a running app (socket at .nap/sock)
  * this means: no creating napkins, agents, or changing status outside the app

* nap init (the exception)
  * runs WITHOUT the app — creates the project from scratch
  * writes: .nap/ dir, 00-org/, nepic dirs, marker files, ui-state.json
  * creates architect stub: .agent.nap.json with UUID, started: false
  * creates first napkin dir structure if needed
  * does NOT start the app — user runs `nap open` after
  * v2 used sqlite3 CLI to create the db — v3 just writes JSON files

* nap open
  * launches the Electron app with --cwd
  * STOP→RUN transition reads everything nap init wrote
  * architect gets started (case C: not started → --session-id)

* commands that go through socket → model (app must be running)

  * nap start <command> [--name, --napkin, --role]
    * socket → model.createAgent() → writes .agent.nap.json
    * model assigns UUID, sets started: false
    * model spawns pty → sets started: true, running: true
    * pushes snapshot → renderer shows new agent with green dot
    * returns { id, name } to CLI

  * nap done
    * agent calls this from inside its pty (reads NAP_SESSION_ID env)
    * socket → model.setAgentDone(id) → in-memory only (done is ephemeral)
    * pushes snapshot → dot turns blue
    * pty stays alive — done is a signal, not an exit

  * nap ps
    * socket → model.getAllAgents() → returns full agent list
    * includes: name, role, status (running/done/exited), napkin, parent, uuid
    * tree view: group by parentId
    * no SQLite — reads from model's in-memory state

  * nap status <napkin-slug> <status>
    * socket → model.setNapkinStatus(slug, status)
    * writes .napkin.nap.json
    * pushes snapshot → phase label changes in sidebar/kanban

  * nap nap <name> [--timeout]
    * polls socket for agent status until done or exited
    * same as v2 — poll loop with sleep

  * nap poke <name> <message>
    * socket → find agent's pty → three-step delivery (text → Escape → CR)
    * port from v2 — message-queue.ts

  * nap peek <name>
    * socket → tell renderer to focus that terminal
    * IPC to renderer: setActive(id)

  * nap kill <name>
    * socket → model.setAgentExited + ptySpawner.kill
    * writes exited: true to marker

  * nap log <name>
    * socket → renderer → read xterm buffer → return lines
    * same round-trip as v2

  * nap close <name>
    * kill + remove from model (but marker stays on disk — agent existed)

  * nap create napkin <slug> [--status backlog]
    * NEW command (not in v2)
    * socket → model creates napkin dir + .napkin.nap.json
    * pushes snapshot → new napkin appears in sidebar

  * nap create agent <napkin-slug> <name> [--role]
    * NEW command — creates agent dir + marker WITHOUT spawning pty
    * useful for: architect sets up agent dir, writes prompt.md, then calls nap start separately
    * or: combined into nap start (which creates + spawns in one step)
    * open question: do we need this separate from nap start?

* socket protocol changes
  * v2 protocol types in shared/protocol.ts — extend, don't break
  * add: create-napkin request/response
  * add: create-agent request/response (if we keep it separate from start)
  * nap start already exists — add napkin/nepic/parent fields to StartRequest
  * nap done already exists — works via NAP_SESSION_ID env
  * all requests carry an id for correlation — same pattern as v2

* what to port from v2
  * socket server: packages/v2/src/main/socket-server.ts
    * ndjson protocol over unix socket — copy the server
    * adapt handlers: call model methods instead of SQLite
  * CLI: packages/v2/src/cli/nap.ts
    * already copied into v3 during 0010 — update handlers to match new protocol
  * message queue (poke): packages/v2/src/main/message-queue.ts
    * three-step delivery pattern — copy as-is
  * name resolver: packages/v2/src/main/name-resolver.ts
    * fuzzy matching for agent names — copy, adapt to use model instead of SQLite

* nap init specifics for v3
  * v2's nap init:
    * calls sqlite3 CLI to create db with schema + initial rows
    * copies templates (00-org, nepic structure)
    * hardcodes SQL with string interpolation
  * v3's nap init:
    * NO sqlite — writes JSON marker files instead
    * creates: .nap/00-org/ (from templates), .nap/nepics/01-v1/ structure
    * writes: .agent.nap.json for architect (uuid assigned, started: false)
    * writes: ui-state.json (activeNepicId pointing to first nepic)
    * writes: .napkin.nap.json for any initial napkins (if template includes them)
    * copies templates for 00-org, skills if --add-skills

* testing
  * small tests (vitest, model + fakes):
    * socket request → model method → correct state change + marker write
    * nap start flow: createAgent + spawn + started flag
    * nap done: agent marked done, not persisted
    * nap status: napkin marker updated
    * nap kill: agent marked exited
    * resume decisions still correct after CLI-initiated state changes
  * medium tests (Playwright):
    * launch app → nap start via socket → agent appears in sidebar
    * nap done → dot turns blue
    * nap status → phase label changes
    * nap ps returns correct tree
    * nap init → nap open → architect starts → sidebar shows it

* done criteria
  * nap init creates a valid v3 project (marker files, no SQLite)
  * nap open → app starts → architect runs
  * nap start creates agent, spawns pty, sidebar updates
  * nap done turns dot blue
  * nap ps shows agent tree from model
  * nap status updates napkin phase
  * nap poke delivers message to agent
  * nap nap blocks until agent completes
  * all commands work through socket → model path
  * all existing tests still pass
