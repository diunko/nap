* NAP v3 CLI design

* the rule
  * the model owns all marker file writes while the app is running
  * the CLI never writes markers directly (except nap init)
  * all commands except init and open require a running app (socket at .nap/sock)

* three users, three surfaces
  * human — nap init, nap open, occasionally nap ps. zero friction.
  * architect agent — nap create, nap start, nap nap, nap status, nap ps, nap log, nap peek, nap kill
  * worker agent — nap done. that's it.

* entity lifecycle: create → populate → start
  * create: the entity exists on the filesystem (dir + marker)
  * populate: architect writes prompt.md, any other files
  * start: pty spawns, agent is running
  * these are three distinct operations — don't collapse them
  * starting without a prompt is legitimate (Claude sits waiting for input)

* commands

  * nap init
    * runs WITHOUT the app — the one exception
    * writes: .nap/, 00-org/, nepics/01-v1/, architect stub, ui-state.json
    * architect stub: .agent.nap.json with UUID, started: false
    * no SQLite. no sqlite3 dependency. JSON marker files only.
    * flags: --name <name>, --add-skills [--user]
    * // roles, prompts, architect prompt

  * nap open [path]
    * // i don't think path is needed?
      * // probably should walk up to .nap dir and launch there?
      * // or say not a nap directory, just like git
    * launches Electron app with --cwd
    * STOP→RUN reads markers, starts architect if not started (case C)
    * no flags — architect lifecycle encoded in marker, not CLI args
    * v2 had --architect, --name, --command — all removed (unnecessary with marker-based architect)

  * nap create agent <name> --napkin <slug> --role <role>
    * // nepic too? what if app is running in one nepic, and architect from the other still working on it?
      * // should default to current one? (according to app settings)
    * socket → model creates agent dir + .agent.nap.json
    * agent now exists in model — visible in sidebar (not started, no dot? gray?)
    * architect then populates: writes prompt.md, other files
    * does NOT spawn pty — that's nap start's job
    * open question: what does "created but not started" look like in the UI?

  * nap create napkin <slug> [--status backlog]
    * // same about nepic here too?
    * socket → model creates napkin dir + .napkin.nap.json
    * pushes snapshot → new napkin appears in sidebar
    * default status: backlog

  * nap start <agent-name>
    * starts an already-created agent — resolves name to existing entity
    * // btw makes me think: when and how these commands fail? what are error messages? 
      * // should be real clear about why fail
    * socket → model spawns pty, sets started + running
    * if isClaude: claude --verbose --session-id <uuid>
    * if agent has prompt.md, convention: "read prompt.md and follow its instructions"
    * if no prompt.md: Claude just sits waiting — legitimate state
    * open question: does nap start accept a raw command/prompt override?
      * // in any case, first message to claude should be sent from cli
        * // it points to what to read etc
        * // yes, this is brittle point; so far architects carry it out well
        * // we'll think _later_ how we can make it more intuitive / less verbose, or is it ok
      * option A: nap start <name> — always uses convention (read prompt.md)
        * // should be --name <name> ? 
        * // but i guess i see what you mean that it's always created so no ad-hoc commands? 
        * // idk, let's discuss, i think i'm noticing i'm confused here
      * option B: nap start <name> [prompt] — optional prompt override
      * option C: nap start <name> [--command <cmd>] — explicit flag
    * open question: ad-hoc agents (not pre-created)?
      * maybe: nap start without a name creates an ephemeral agent?
      * or: always create first, even for quick stuff?
      * // idk, we should think of some real straightforward way to do it

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

  * nap status <napkin-slug> <status>
    * // status of what? not clear that it's only about emm napkin
    * statuses: backlog, todo, doing, review, done
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

  * nap kill <name>
    * // guess i'd prefer nap stop? kill doesn't sound nice 
    * kills pty + writes exited: true to marker
    * agent won't auto-resume on next app start

  * nap close — REMOVED
    * v2's "kill + remove from list" doesn't work when agents are dirs
    * agent dirs are permanent records. use nap kill to stop. UI filters for clutter.
    * // having agents always sitting in the list? 
      * // it's either awailable through [terminal] in napkin->agent extended view,
        * // with session restored there
      * // idk, for free-floating or architect should be "archive" option
      * // but guess that's overcomplicating, can live without that for mvp / v3

* context resolution
  * nepic: no --nepic flag. app tracks active nepic. CLI doesn't need to know.
    * // again, what if arch from other nepic keeps working?
    * // having it is real simple, why constrain by active only
    * // it's ok for active to be default
  * napkin: explicit --napkin <slug> on create. no cwd inference — too fragile.
  * agent identity: NAP_SESSION_ID env var. injected by pty spawner. agents never pass their own identity.

* btw, what about nap create nepic?  (can have alias epic)?
  * // useful for human; also human can ask architect create it and put together onboarding package
    * // for the next architect

* name resolution
  * exact → suffix → substring
  * zero matches: error
  * one match: use it
    * // i'm concerned about just using non-exact matches; 
    * // maybe give helpful text in the error, with copyable command: 
      * // did you mean:
        * // X? // on separate line, so it's easy do double-click and copy all
  * multiple: error with candidates list
  * napkin slugs: exact only, no fuzzy

* nap init writes (v3)
  * .nap/.gitignore — sock, ui-state.json, *.agent.nap.json
  * .nap/00-org/ — from templates
  * .nap/nepics/01-v1/10-docs/
  * .nap/nepics/01-v1/20-architects/001-architect/
    * .agent.nap.json { cc_session_uuid, role: "architect", name, created_at, started: false }
    * prompt.md (from template)
  * .nap/nepics/01-v1/30-napkins/
  * .nap/ui-state.json { activeNepicId: "01-v1" }
  * NO 40-board/ — status lives in .napkin.nap.json, symlinks are dead

* what changed from v2
  * added: nap create agent, nap create napkin
  * removed: nap close, done messages, --architect on open, 40-board/ symlinks
  * simplified: nap ps columns (4 instead of 6), nap open flags (none)
  * persistence: JSON markers instead of SQLite
  * nap start: now targets pre-created agents, not raw commands

* open questions
  * nap start signature — how does it accept command/prompt? (see above)
    * // see coupple comments there
  * ad-hoc agents — create-then-start even for quick stuff?
    * // idk; maybe remove for now
  * "created but not started" visual — what does the sidebar show?
    * // riiight; maybe have start button? woudl start empty claude
  * should .agent.nap.json be gitignored? (per-session state vs project history)
    * // riiight; well, uuids are claude sessions; guess should be commited
      * // ideally, maybe session history should live in kinda parallel storage like in LFS
        * // where these things are pointing to and sessions shared through git
        * // not now
        * // for now let's just keep committing them
