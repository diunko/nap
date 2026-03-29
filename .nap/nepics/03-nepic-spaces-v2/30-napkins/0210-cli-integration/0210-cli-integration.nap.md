* 0210 — CLI integration
  * wire the CLI to the model through the socket server
  * approved CLI design: agents/001-cli-design/03-cli-design.nap.md — that's the spec for command syntax, flags, output format
  * this napkin is about the plumbing: socket server, model methods, CLI handlers, nap init

* what exists in v3 today
  * model: loads markers, creates agents, sets status, watches filesystem, pushes snapshots
  * bridge: typed IPC, main→renderer snapshots, renderer→main intents
  * pty: NodePtySpawner, coordinators (startAgents, stopApp)
  * CLI: copied from v2, not yet adapted for v3 model
  * socket server: NOT yet ported — this is the main gap

* the wiring: CLI → socket → model → marker + snapshot

  * socket server (port from v2, adapt for model)
    * source: packages/v2/src/main/socket-server.ts
    * ndjson protocol over unix socket at .nap/sock — same as v2
    * each handler calls model methods instead of SQLite
    * start in main.ts before creating window — same as v2

  * socket handlers (one per CLI command):
    * create-napkin → model.createNapkin(slug, status, nepicId)
    * create-agent → model.createAgentStub(napkinSlug, name, role, nepicId)
    * create-architect → model.createArchitectStub(name, nepicId)
    * create-nepic → model.createNepic(slug, displayName) — scaffolds dirs, creates architect stub
    * start → model starts pre-created agent by name, spawns pty
    * done → model.setAgentDone(sessionId) — in-memory only
    * ps → model.getAllAgents() — returns tree
    * set-status → model.setNapkinStatus(slug, phase)
    * status → model.getStatus(query) — read-only inspect
    * nap (wait) → poll agent status until done/exited
    * poke → find pty, three-step delivery
    * peek → IPC to renderer: focus terminal
    * log → IPC to renderer: read xterm buffer
    * stop → kill pty + model.setAgentExited

  * new model methods needed:
    * createNapkin(slug, status?, nepicId?) — creates dir + .napkin.nap.json
    * createAgentStub(napkinSlug, name, role, nepicId?) — creates dir + marker, no pty
    * createArchitectStub(name, nepicId?) — creates dir in 20-architects/ + marker
    * createNepic(slug, displayName) — scaffolds full nepic structure + architect stub
    * getStatus(query) — read-only inspect for status command
    * startAgentByName(name, prompt?, nepicId?) — finds agent, spawns pty, sets started+running
    * getAllAgentsTree() — returns agents grouped by parent for ps tree view

  * name resolution (port from v2, adapt)
    * source: packages/v2/src/main/name-resolver.ts
    * exact match within active nepic (or specified --nepic)
    * names unique within nepic — enforced at create time
    * on failure: return candidates for "did you mean" suggestions

  * message queue for poke (port from v2)
    * source: packages/v2/src/main/message-queue.ts
    * three-step delivery: text → Escape → CR
    * copy as-is, wire to ptySpawner

* nap init rewrite
  * v2 uses sqlite3 CLI binary — v3 writes JSON marker files
  * creates: .nap/, 00-org/ (from templates), nepics/01-v1/ structure
  * architect stub: .agent.nap.json with UUID + started: false
  * prompt.md from template
  * ui-state.json with activeNepicId
  * .gitignore: sock, ui-state.json
  * NO 40-board/ — status in markers only
  * NO SQLite — no nap.db, no sqlite3 dependency

* nap open changes
  * drop path arg — walk up from cwd to find .nap/ (like git)
  * drop --architect, --name, --command flags
  * just: find project root, launch Electron with --cwd

* CLI rewrite
  * rewrite packages/v3/src/cli/nap.ts to match approved CLI design
  * new commands: create (napkin, agent, architect, nepic), set-status, status (inspect)
  * renamed: kill → stop
  * removed: close
  * simplified: open (no flags), done (no args), ps (4 columns)
  * all create commands output JSON to stdout
  * error messages: clear, helpful, "did you mean" on name miss

* what to port from v2
  * socket server: packages/v2/src/main/socket-server.ts — ndjson over unix socket
  * name resolver: packages/v2/src/main/name-resolver.ts — adapt for model
  * message queue: packages/v2/src/main/message-queue.ts — three-step poke
  * constants: socket path resolution, walk-up discovery — packages/v2/src/shared/constants.ts
  * nap init template copying logic — packages/v2/src/cli/nap.ts lines 384-466

* testing
  * pipeline: TA → fs-eng → TE
  * small tests (vitest, model + fakes):
    * socket handler unit tests: request in → model method called → correct response
    * name resolution: exact match, collision error, "did you mean" suggestions
    * create flows: createNapkin, createAgentStub, createArchitectStub, createNepic
    * startAgentByName: finds agent, spawns pty, sets flags
    * nap init: writes correct files to fake filesystem
  * medium tests (Playwright):
    * launch app → nap start via real socket → agent appears in sidebar
    * nap done via real socket → dot turns blue
    * nap set-status via real socket → phase label changes
    * nap ps via real socket → returns correct tree
    * nap create napkin via real socket → napkin appears in sidebar
    * nap init → nap open → architect starts → sidebar shows it
    * nap stop → agent stops, doesn't resume on next start

* done criteria
  * socket server running, all CLI commands work through it
  * nap init creates a valid v3 project (markers, no SQLite)
  * nap open finds project root, launches app, architect starts
  * nap create {napkin, agent, architect, nepic} all work, output JSON
  * nap start spawns pre-created agents
  * nap done / nap ps / nap set-status / nap stop all work
  * nap poke delivers messages
  * nap nap blocks until completion
  * name resolution with helpful error messages
  * small + medium tests cover all commands
  * all existing 0100/0150/0200 tests still pass
