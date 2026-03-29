* NAP v3 CLI design (v2)

* the rule
  * the model owns all marker file writes while the app is running
  * the CLI never writes markers directly (except nap init)
  * all commands except init and open require a running app (socket at .nap/sock)

* three users, three surfaces
  * human — nap init, nap open, occasionally nap ps. zero friction.
  * architect agent — nap create, nap start, nap nap, nap status, nap ps, nap log, nap peek, nap stop
  * worker agent — nap done. that's it.

* entity lifecycle: create → populate → start
  * create: entity exists on filesystem (dir + marker). CLI outputs JSON summary.
  * populate: architect writes prompt.md, any other files into the created dir
  * start: pty spawns, agent is running
  * three distinct operations — don't collapse them
  * starting without a prompt is legitimate (Claude sits waiting for input)

* JSON output on create
  * all nap create commands output structured JSON to stdout
  * agent: { id, name, role, dir, napkin, nepic }
  * architect: { id, name, role, dir, nepic }
  * napkin: { slug, status, dir, nepic }
  * nepic: { slug, name, dir, architectId, architectDir }
  * useful for both agents (parse) and humans (read)

* commands

  * nap init
    * runs WITHOUT the app — the one exception
    * writes: .nap/, 00-org/ (roles, workflow, skills), nepics/01-v1/, architect stub, ui-state.json
    * architect stub: 20-architects/001-architect/ with .agent.nap.json + prompt.md from template
    * role files: architect.md, test-arch.md, fullstack-eng.md, test-eng.md
    * no SQLite. no sqlite3 dependency. JSON marker files only.
    * flags: --name <name>, --add-skills [--user]

  * nap open
    * no path arg — walks up from cwd to find .nap/, like git
    * if no .nap/ found: "not a nap project (run nap init)"
    * launches Electron app with --cwd pointing to discovered project root
    * STOP→RUN reads markers, starts architect if not started (case C)
    * no flags — architect lifecycle encoded in marker, not CLI args

  * nap create agent <name> --napkin <slug> --role <role> [--nepic <slug>]
    * socket → model creates 30-napkins/<slug>/agents/<name>/ + .agent.nap.json
    * --nepic defaults to active nepic. explicit when cross-nepic architect is still working.
    * agent exists in model — visible in sidebar, not started yet
    * architect then populates: writes prompt.md, other files into the output dir
    * does NOT spawn pty — that's nap start's job
    * outputs JSON: { id, name, role, dir, napkin, nepic }

  * nap create architect <name> [--nepic <slug>]
    * separate command — architects live in 20-architects/, not under napkins
    * socket → model creates 20-architects/<name>/ + .agent.nap.json
    * --nepic defaults to active nepic
    * architect then populates: onboarding package, prompt.md
    * outputs JSON: { id, name, role, dir, nepic }
    * used for: architect succession (002-nova), manual architect creation

  * nap create napkin <slug> [--status backlog] [--nepic <slug>]
    * socket → model creates 30-napkins/<slug>/ + agents/ + .napkin.nap.json
    * --nepic defaults to active nepic
    * pushes snapshot → new napkin appears in sidebar
    * outputs JSON: { slug, status, dir, nepic }

  * nap create nepic <slug> --name <display-name>
    * socket → model creates nepics/<slug>/ with full structure
    * auto-creates 001-architect stub in 20-architects/
    * sets activeNepicId to the new nepic
    * outputs JSON: { slug, name, dir, architectId, architectDir }
    * used by: human (from terminal), architect (setting up next version)

  * nap start <name> [prompt] [--nepic <slug>]
    * starts an already-created agent or architect by name
    * resolves name to existing entity in model
    * [prompt] — optional first message to Claude
      * this is what tells Claude to read prompt.md, follow instructions, etc.
      * if omitted: Claude starts with no initial message, sits waiting for input
      * the architect crafts this string — it's the bootstrap
    * socket → model spawns pty, sets started + running
    * claude agents: claude --verbose --session-id <uuid> [prompt]
    * bare commands: future consideration (not needed for v3 — everything is Claude)
    * outputs JSON: { id, name, pid }

  * nap done
    * no arguments. no message. the signal, not the payload.
    * reads NAP_SESSION_ID from env
    * socket → model.setAgentDone(id) — in-memory only, not persisted
    * pty stays alive. done is a signal, not an exit.
    * all communication goes through files (response.md, questions.md)

  * nap ps [--json]
    * tree view grouped by parent
    * columns: NAME, STATUS, NAPKIN, ROLE
    * removed from v2: PID, SESSION, RESUMABLE (internal details, not actionable)

  * nap status <napkin-slug> <phase>
    * renamed second arg from "status" to "phase" to reduce confusion
    * `nap status` with no args: could show project overview (TBD, not v3)
    * phases: backlog, todo, doing, review, done
    * socket → model.setNapkinStatus → writes .napkin.nap.json
    * no symlinks — v2's 40-board/ is dead

  * nap nap <name> [--timeout <seconds>]
    * polls socket until done or exited
    * default timeout: 600s
    * no done message on completion (architect reads response.md)

  * nap poke <name> <message>
    * human-only tool — sends input to agent's terminal
    * three-step delivery: text → Escape → CR
    * NOT for agent-to-agent communication

  * nap peek <name>
    * socket → renderer focuses that terminal

  * nap log <name>
    * socket → renderer → xterm buffer → stdout

  * nap stop <name>
    * stops pty + writes exited: true to marker
    * agent won't auto-resume on next app start
    * (renamed from v2's "kill" — less aggressive, more accurate)

* error messages
  * every command that can fail should say WHY clearly
  * not running: "nap is not running (run nap open)"
  * not found: "no agent named 'test-arch'\n\ndid you mean:\n  001-test-arch\n  004-test-arch"
  * already started: "agent '001-test-arch' is already running"
  * not created: "no agent named 'foo' — create it first with nap create agent"
  * already exists: "agent '001-test-arch' already exists in napkin 0100-feature"
  * bad status: "unknown phase 'wip' — use: backlog, todo, doing, review, done"

* context resolution
  * nepic: --nepic flag on all create commands + nap start. defaults to active nepic.
    * why: architect from old nepic may still be alive and spawning agents
    * simple to add, prevents real cross-nepic bugs
  * napkin: explicit --napkin <slug> on create agent. no cwd inference.
  * agent identity: NAP_SESSION_ID env var. injected by pty spawner.

* name resolution
  * always exact match
  * on failure: helpful suggestions with copyable names
    * "no agent named 'test-arch'\n\ndid you mean:\n  001-test-arch\n  004-test-arch"
    * each suggestion on its own line — easy to double-click and copy
  * napkin slugs: exact only

* nap init writes (v3)
  * .nap/.gitignore — sock, ui-state.json
  * .nap/00-org/ — from templates (roles, workflow, skills, promise)
  * .nap/nepics/01-v1/10-docs/
  * .nap/nepics/01-v1/20-architects/001-architect/
    * .agent.nap.json { cc_session_uuid, role, name, created_at, started: false }
    * prompt.md (from template)
  * .nap/nepics/01-v1/30-napkins/
  * .nap/ui-state.json { activeNepicId: "01-v1" }
  * NO 40-board/ — status lives in .napkin.nap.json
  * .agent.nap.json committed to git (session identity is project history)

* what changed from v2
  * added: nap create agent, nap create architect, nap create napkin, nap create nepic
  * removed: nap close, done messages, --architect on open, 40-board/ symlinks, path arg on open
  * renamed: nap kill → nap stop
  * simplified: nap ps columns (4 not 6), nap open (no flags)
  * persistence: JSON markers instead of SQLite
  * nap start: targets pre-created agents, prompt is optional first message
  * all create commands: JSON output to stdout

* resolved from v1
  * create→populate→start lifecycle (not collapsed)
  * architects get own command (nap create architect, not --role flag on create agent)
  * --nepic on all create commands, defaults to active
  * nap open walks up like git (no path arg)
  * exact name matching with helpful suggestions on failure
  * nap stop instead of nap kill
  * JSON output on all create commands
  * no ad-hoc agents for v3 — always create first
