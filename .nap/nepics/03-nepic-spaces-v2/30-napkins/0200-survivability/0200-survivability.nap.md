* 0200 — close/reopen survivability
  * the designer's J4: "you come back, the dots changed"
  * the app survives quit → reopen. no data loss. no orphaned state.
  * this is where v2 broke. every transition must be explicit.

* the two system states (recap from mega napkin)
  * STOPPED: app not running. marker files on disk. nothing in memory.
  * RUNNING: app running. ptys alive. model in memory. renderer showing state.

* model entity shapes — the full picture
  * every entity is self-contained: carries its own identity + parent container IDs
  * React components access fields directly: napkin.status, agent.role, etc.
  * the bridge pushes these shapes as-is — no transformation needed in renderer

  * NepicState
    * id — slug (e.g. "03-nepic-spaces-v2"), serves as unique ID
    * slug — same as id, the directory name
    * name — display name
    * path — absolute path to nepic dir
    * architects — AgentState[] (this nepic's architects)

  * NapkinState
    * id — slug (unique within nepic, e.g. "0100-explore")
    * slug — directory name
    * nepicId — containing nepic's id (navigate up)
    * status — backlog / todo / doing / review / done
    * path — absolute path to napkin dir
    * agents — AgentState[] (nested, complete)
    * bullets — string[] (extracted from .nap.md, for kanban expanded view — later)

  * AgentState
    * id — cc_session_uuid (THE identity, assigned on creation, never changes)
    * name — display name (e.g. "001-test-arch")
    * role — architect, test-arch, fs-eng, test-eng
    * nepicId — containing nepic's id (navigate up)
    * napkinId — containing napkin's slug (null for architects)
    * parentName — parent agent name (null for root agents)
    * parentId — parent agent UUID (reliable linking, null for root)
    * createdAt — timestamp
    * started — true once pty has run with this UUID
    * exited — true if agent died on its own (NOT set on app quit)
    * running — pty currently alive (ephemeral, derived from pty existence)
    * done — called nap done (ephemeral, in-memory only)
    * homePath — absolute path to agent's home dir

* marker files — what's persisted to disk
  * per agent: .agent.nap.json
    * cc_session_uuid, role, name, napkin, nepic
    * parent, parent_id
    * created_at, started, exited
    * (running and done are NOT persisted — they're ephemeral)
  * per napkin: .napkin.nap.json
    * status, nepic
  * global: ui-state.json
    * activeNepicId, activeTerminalId, sidebarVisible

* ephemeral state (in-memory — dies on stop)
  * pty handles (node-pty process objects)
  * xterm instances (renderer terminal buffers)
  * agent.running — derived from pty existence, not stored
  * agent.done — set when nap done called, not persisted (agent resumes on next start)
  * zustand store — rebuilt from model on STOP→RUN
  * socket server — recreated on start
  * watcher — recreated on start

* STOP→RUN transition (app starts) — step by step
  * 1. read ui-state.json → know which nepic was active, which terminal focused
  * 2. walk nepic dir → read marker files → build model
    * for each napkin dir in 30-napkins/:
      * read .napkin.nap.json → get status (default: backlog if missing)
      * for each agent dir in agents/:
        * read .agent.nap.json → get uuid, role, name, exited flag
    * for each architect dir in 20-architects/:
      * read .agent.nap.json → get uuid, role, name
  * 3. three cases for each agent/architect (all agents have UUIDs — assigned at creation):
    * case A — started + NOT exited: resume
      * spawn pty: `claude --verbose --resume <uuid>`
      * agent is now RUNNING (pty exists)
    * case B — exited: skip
      * do NOT spawn pty
      * agent shows as EXITED in sidebar (gray dot, hollow)
      * user can click [terminal] to clear exited flag and resume on next start
    * case C — NOT started: first run (this is how nap init → nap open works)
      * spawn pty: `claude --verbose --session-id <uuid> "read prompt.md..."`
      * write started: true to marker after pty spawns
      * this covers: nap init creates architect stub with UUID → nap open starts it for the first time
  * 6. push model state to renderer via bridge
  * 7. renderer builds zustand store, renders sidebar, wires xterm instances to ptys
  * 8. restore active terminal from ui-state.json
  * that's it. no SQLite. no reconciliation. no appIsClosing flag.

* RUN→STOP transition (app stops) — step by step
  * 1. save ui-state.json (active nepic, active terminal, sidebar visible)
  * 2. stop watcher
  * 3. stop socket server
  * 4. kill all ptys
    * each pty.kill() sends SIGHUP to child
    * pty.onExit fires for each
    * we do NOT write exited: true — this is app quit, not agent death
    * we do NOT need appIsClosing flag — we simply don't write anything on quit
    * the marker files are already correct from runtime writes
  * 5. app.quit()
  * everything in memory (model, store, xterm, pty handles) dies naturally

* runtime transitions (while app is running)
  * agent created (nap start):
    * model.createAgent() → writes .agent.nap.json with new uuid
    * spawn pty: `claude --verbose --session-id <uuid> "prompt"`
    * push updated snapshot to renderer
    * sidebar shows new agent with green dot
  * agent calls nap done:
    * model marks agent as "done" (in-memory only — not persisted)
    * pty is still alive — agent just signaled completion
    * push snapshot → blue dot
  * agent process dies on its own (pty.onExit):
    * model.setAgentExited() → writes exited: true to marker
    * pty handle removed from memory
    * push snapshot → gray dot
    * on next STOP→RUN: this agent will NOT auto-resume
  * app kills agent (user closes terminal):
    * same as agent dies — write exited: true, clean up pty
  * napkin status change:
    * model.setNapkinStatus() → writes .napkin.nap.json
    * push snapshot → phase label changes

* what v2 got wrong and how we avoid it
  * v2: appIsClosing flag to prevent marking sessions as exited on quit
    * v3: we don't write ANYTHING on quit. markers already correct.
  * v2: 4 statuses (running/done/exited/new) in SQLite
    * v3: running = pty exists (ephemeral). exited = marker flag (persistent). done = in-memory flag. new = no uuid yet.
  * v2: reconciliation to sync SQLite with filesystem
    * v3: filesystem IS the truth. model reads it on start. nothing to reconcile.
  * v2: stale SQLite rows from crashed sessions
    * v3: impossible. marker files are written during runtime. if app crashes, markers reflect last good state. stale in-memory state simply vanishes.

* what to port from v2
  * pty-manager: node-pty spawn, onData buffering, onExit handling, resize
    * source: packages/v2/src/main/main.ts lines 155-222
    * adapt: onExit calls model.setAgentExited instead of SQLite update
    * adapt: no appIsClosing check — simply don't write on quit
  * terminal registry: xterm.js instances, DOM reparenting
    * source: packages/v2/src/renderer/terminal-registry.ts
    * copy as-is, it's standalone
  * Terminal component: container, resize, breadcrumb header
    * source: packages/v2/src/renderer/components/Terminal.tsx
    * adapt: receives terminal data from bridge snapshot, not from zustand directly
  * output buffering + ready signaling
    * source: packages/v2/src/main/main.ts (outputBuffers, readyTerminals)
    * port the pattern into pty-manager
  * preload: add pty IPC methods (pty:create, pty:write, pty:resize, pty:ready, pty:data, pty:exit)
    * source: packages/v2/src/main/preload.ts

* what's new (not in v2)
  * model drives pty decisions: "which agents to resume" comes from model, not SQLite query
  * no appIsClosing — quit is just "kill ptys, done"
  * exited flag in marker file instead of SQLite status column
  * bridge pushes terminal lifecycle events (created, exited, data) alongside model snapshots

* testing
  * pipeline: TA → fs-eng → TE
  * small tests (vitest, model + fakes):
    * STOP→RUN: fake filesystem with markers → model loads → correct resume decisions
    * RUN→STOP: model state → save ui-state → new model loads → same persistent state
    * agent created → marker written → model updated
    * agent exits → exited flag written → model updated
    * agent exits → next STOP→RUN → agent NOT resumed
    * app quit → NO exited flags written (the key difference from v2)
    * done signal → in-memory only → not persisted → next STOP→RUN resumes agent
  * medium tests (Playwright, real Electron):
    * launch app with fixture → agents resume (real ptys) → sidebar shows running dots
    * launch → quit → reopen → sidebar shows same agents
    * launch → agent exits → quit → reopen → exited agent NOT resumed
    * equivalence: same assertions as small tests

* done criteria
  * app starts: reads markers, resumes agents with real ptys, sidebar shows running dots
  * app quits: no marker mutations, ptys die, clean exit
  * app reopens: same agents, same napkins, same state as before quit
  * agent exits on its own: marker updated, not resumed on next start
  * nap done: dot turns blue, agent still resumes on next start (done is not exited)
  * small + medium tests cover all transitions
  * all existing 0100/0150 tests still pass
