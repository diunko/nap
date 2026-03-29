* thinking exercises — product debt + state model

* exercise 1: journey testing — how it plays with current TA process

  * the question: how do you test journeys before anything exists?
    * not: write Playwright tests with selectors that break
    * more: what's the right framing that works with our existing TA process?

  * what TA already does well
    * strategic tests on integration seams — contracts, APIs
    * "does the socket round-trip work?" "does SQLite persist correctly?"
    * these survive refactors because they test interfaces, not implementations

  * what's missing: wiring tests
    * TA tests verify each API works
    * nobody tests: are the APIs CALLED in the right order with the right data?
    * a component can pass its contract test but never get called during startup
    * that's the gap — the wiring between tested components

  * journey tests = wiring tests, not UI tests
    * no selectors — same `page.evaluate` / `app.evaluate` pattern
    * "architect terminal exists and runs claude" =
      * `app.evaluate(() => ptys.size > 0 && firstPty.command.includes('claude'))`
    * "napkin cards appear in sidebar" =
      * `page.evaluate(() => store.getState().napkins.length > 0)`
    * tests verify the COMPOSITION, not the components

  * how it fits in the process
    * TA does TWO passes:
      * 1. integration seams (existing — contracts, APIs, component boundaries)
      * 2. journey wiring (new — "does init → open → architect actually work?")
    * journey tests are STABLE — they test "does the user see X?"
      * if components get refactored but the journey still works → test passes
      * if journey breaks because wiring changed → test catches it
    * integration tests are PRECISE — they test "does this API return Y?"
      * if API changes → test updates
      * if internal refactor but API same → test passes
    * both survive refactors for different reasons
      * journey: tests outcome, not mechanism
      * integration: tests contract, not implementation

  * what about before first implementation?
    * TA writes journey test specs as .test.md (as now)
    * TE implements them — they FAIL (nothing built yet)
    * FS-eng builds — journey tests start PASSING
    * the test is the acceptance criteria
    * no different from current flow — just the test SCOPE changes (journey vs component)


* exercise 2: the 2-state model

  * insight from your comments: we modeled 4 statuses for what is fundamentally 2 states

  * the two states
    * STOPPED — app not running. data on disk. nothing in memory.
    * RUNNING — app running. ptys alive. in-memory state exists.

  * the two transitions
    * s→r (start): read persistent state → create ephemeral state
    * r→s (stop): ephemeral state dies. persistent state unchanged.

  * what is persistent? (survives stop)
    * agent identity: who am I? (dir + marker file: .agent.nap.json)
      * cc_session_uuid — for resume
      * role — architect, test-arch, fs-eng, test-eng
      * name — display name
      * created_at
    * napkin identity: what feature? (dir + .napkin.nap.json or similar)
      * status — backlog, todo, doing, review, done
    * nepic identity: what era? (dir structure)
    * artifacts: napkin files, specs, prompts, responses (already filesystem)
    * UI state: which nepic was active, which terminal focused, sidebar visible
      * could be: state.json at nepic level, or meta file in .nap/

  * what is ephemeral? (dies on stop)
    * PIDs — which processes are alive
    * pty objects — the actual terminal processes
    * xterm instances — the renderer terminal objects
    * which agents are "running" vs "idle" — this is runtime, not persistent
    * zustand store state — rebuilt from persistent layer on s→r
    * socket server — recreated on start

  * the s→r transition (app starts)
    * walk filesystem: find nepics, napkins, agents by marker files
    * read each marker file → get UUIDs, roles, statuses
    * for each agent with UUID → spawn `claude --verbose --resume <uuid>`
    * build in-memory model: zustand store, pty map
    * render UI from in-memory model
    * that's it. no SQLite read, no reconciliation.

  * the r→s transition (app stops)
    * kill all ptys (they're ephemeral)
    * save UI state to disk (state.json)
    * in-memory state dies naturally
    * persistent state (marker files) was already written during runtime
    * nothing to "flush" or "reconcile"

  * what about "agent exited while running"?
    * agent dies on its own (not app closing). what happens?
    * in-memory: remove from pty map, update store (dot turns gray)
    * persistent: write `exited: true` to marker file
    * your model: "has uuid = auto-resume, exited cleanly = manual action needed"
      * marker file gains an `exited` field
      * s→r checks: has UUID AND NOT exited → auto-resume
      * user clicks [terminal] → clears exited flag → next restart auto-resumes

  * what about SQLite?
    * your comment: "central persistent queryable source for ephemeral is kinda nice"
    * kanban board needs to query "all napkins by status"
    * proposal: SQLite as CACHE
      * on s→r: walk filesystem → build SQLite from marker files
      * while running: SQLite is the fast query layer
      * on r→s: SQLite can be WIPED or left stale
        * next s→r rebuilds it anyway
      * no sync bugs: SQLite is DERIVED, not truth
      * no reconciliation: if wrong, just rebuild
    * `nap status 0100 doing`:
      * writes to marker file (persistent — this is the truth)
      * updates SQLite (ephemeral — for in-session queries)
      * only the marker write matters for persistence

  * what about `nap start`?
    * `nap start claude "prompt" --napkin 0100 --name 001-test-arch`
    * CLI → socket → main process
    * main creates dir: `30-napkins/0100/agents/001-test-arch/`
    * main writes: `.agent.nap.json` with UUID, role, name
    * main spawns pty: `claude --verbose --session-id <uuid>`
    * main updates in-memory: pty map, store, SQLite cache
    * IPC → renderer: new agent card appears
    * PID in-memory only — not in marker file
    * on restart: marker says "I exist, UUID is X" → resume

  * "app in-memory as source of truth with API"
    * this IS the current model at runtime
      * zustand store + pty map = truth while running
      * socket API + IPC = how consumers talk to it
    * 2-state model clarifies: what happens when this truth DIES?
      * persistent layer (marker files) preserves what matters
      * s→r rebuilds in-memory truth from persistent layer

  * walking journeys through the 2-state model
    * J1: init → open → architect
      * `nap init`: creates dirs + marker files (all persistent, all filesystem)
      * `nap open`: s→r → read markers → find architect UUID → resume → terminal
      * works? yes — no SQLite dependency, no reconciliation
    * J4: close → reopen → everything there
      * close: r→s → ptys die, in-memory dies, markers unchanged
      * reopen: s→r → read markers → resume all with UUIDs
      * works? yes — markers untouched by stop
    * agent exits while running
      * in-memory: update store (gray dot)
      * persistent: write `exited: true` to marker
      * close + reopen: s→r → marker says exited → skip auto-resume
      * works? yes — one flag, one file write
    * switch nepics
      * in-memory: swap displayed data
      * persistent: save active nepic to state.json
      * works? yes — just UI state, rebuilt on s→r

  * what this eliminates
    * 4-status state machine → 1 persistent flag (exited: true/false)
    * appIsClosing flag → unnecessary (ephemeral just dies)
    * reconciliation → unnecessary (rebuild from filesystem)
    * dual-truth sync → unnecessary (one truth: filesystem)
    * stale SQLite rows → impossible (SQLite rebuilt, not preserved)

  * open questions
    * kanban status changes: marker file writes commit-friendly?
      * 20 napkins backlog → todo = 20 file writes + git commit
      * vs SQLite: 20 UPDATEs, fast, not readable on disk
      * board symlinks as status? (already filesystem-native)
    * UI state granularity: what goes in state.json?
      * active nepic, active terminal, sidebar visible — yes
      * scroll positions, expanded cards, filter text — maybe overkill
    * fs watcher + marker file writes: infinite loop?
      * app writes .agent.nap.json → watcher fires → update → loop?
      * need: ignore own writes, or debounce, or separate mechanism
