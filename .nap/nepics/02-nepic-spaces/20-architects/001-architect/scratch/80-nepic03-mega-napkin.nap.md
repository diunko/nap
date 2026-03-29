* nepic 03 — nepic spaces v2: mega napkin

* what this nepic is about
  * same vision as nepic 02: structured project view, nepic spaces, agent management
  * different approach: model layer, simpler state, journey-first testing
  * not a polish — a rethink of the architecture based on hard lessons

* reference: all thinking that led here
  * `scratch/70-reflection-and-new-direction.nap.md` — reflection on nepic 02 with inline human + architect discussion
  * `scratch/72-reflection-and-new-direction.nap.md` — thinking exercises: journey testing + 2-state model
  * `scratch/73-reflection-and-new-direction.nap.md` — s→r transition as testable function, JSON fixtures
  * `scratch/63-agent-lifecycle.nap.md` — system design (still valid concepts, new implementation)
  * `scratch/64-agent-lifecycle-roadmap.nap.md` — roadmap (sequencing lessons apply)
  * `reference/main-flows.nap.md` — traced chains for all key actions
  * `reference/architecture-diagram.html` — actors and communication channels
  * `reference/t3code-testing-patterns-catalog.md` — testing patterns from t3code project
  * `stories/00-journeys.nap.md` — designer's emotional journey (J1-J5)
  * `stories/01-core-stories.nap.md` — PM stories with architect //A: review comments


* the core architectural change: model layer

  * what failed in nepic 02
    * state split across main (SQLite) and renderer (zustand) with ad-hoc IPC sync
    * every mutation touched two systems — ~15 interactions, got ~12 right
    * no single place where business logic lived and could be tested
    * 232 tests pass but user journeys don't work

  * the new approach: explicit model layer
    * two models connected by a bridge — mirrors Electron's process boundary
      * main model: sessions, napkins, nepics, filesystem, pty lifecycle
      * renderer model: UI state, optimistic updates, terminal registry
      * bridge: typed IPC — main pushes state, renderer sends intents
    * main model is source of truth for application state
    * renderer is a view client with optimistic updates for responsiveness
    * the bridge is the contract between them

  * testability
    * main model: inject fake filesystem + fake pty → test business logic in vitest
    * renderer model: inject fake bridge pushes → test rendering logic in vitest
    * bridge: fake async IPC (two EventEmitters) → test full flow in vitest
    * real Electron: few e2e tests for "does xterm render, does pty actually spawn"
    * journey tests on the model — the fakes remove infrastructure, logic stays

  * how journeys are tested
    * not plan/executor pattern — too abstract
    * not pure functions — model has state and transitions
    * just: set up fake sources, call model methods, assert model state
    * ```
      mainModel.loadFromFilesystem(fixture)
      → assert: architect session exists with UUID
      rendererModel receives push
      → assert: sidebar shows architect card
      mainModel.launchAgent({ napkin: '0100', name: '001-test-arch' })
      → assert: new session in model, pty spawn requested
      ```
    * the model IS the testable surface for journeys

  * reference: VS Code does this
    * main owns file I/O, pty host, window management
    * renderer is a view client, requests data on demand
    * typed JSON-RPC between processes
    * each process owns its domain — no duplicated state


* the 2-state model for persistence

  * two system states
    * STOPPED — app not running, data on disk, nothing in memory
    * RUNNING — app running, ptys alive, in-memory state exists

  * two transitions
    * s→r (start): read persistent state → create ephemeral state
    * r→s (stop): ephemeral state dies, persistent state unchanged (or minimally adjusted)

  * what is persistent (survives stop)
    * agent identity: dir + marker file (.agent.nap.json)
      * cc_session_uuid, role, name, created_at
      * exited flag (true = agent died on its own, don't auto-resume)
    * napkin identity: dir + marker file (.napkin.nap.json)
      * status: backlog / todo / doing / review / done
    * nepic identity: dir structure
    * artifacts: .nap.md, .spec.md, prompt.md, response.md (already filesystem)
    * UI state: state.json (active nepic, active terminal, sidebar state)

  * what is ephemeral (dies on stop)
    * PIDs, pty objects, xterm instances
    * running/idle distinction — only matters while app is open
    * zustand store — rebuilt from persistent layer on s→r
    * SQLite — if used, rebuilt as cache from marker files on s→r

  * agent exit while running
    * agent dies on its own → write exited: true to marker file
    * on next start: skip auto-resume for exited agents
    * user clicks [terminal] → clears exited → auto-resumes next time

  * what this eliminates from nepic 02
    * 4-status state machine → 1 persistent flag (exited)
    * appIsClosing flag → unnecessary (ephemeral just dies)
    * reconciliation → unnecessary (rebuild from filesystem)
    * dual-truth sync → one truth (filesystem markers)
    * stale SQLite rows → impossible (cache rebuilt each launch)

  * open: SQLite as cache
    * kanban needs queryable status data
    * option: rebuild SQLite from markers on startup, use for fast queries while running
    * SQLite is derived, not source of truth — can be wiped anytime
    * or: skip SQLite entirely, query markers directly (fast enough for 100s of agents)


* journey-first testing

  * the process change
    * before: napkin → spec → agents build → component tests verify
    * after: story → journey test on model (fails) → spec → agents build → journey test passes

  * what TA does
    * pass 1: integration seams (contracts, APIs) — existing, still valuable
    * pass 2: journey wiring ("does init → open → architect actually work?") — new

  * journey tests = wiring tests, not UI tests
    * no selectors
    * test the model: "does the model have the right sessions after startup?"
    * test the bridge: "does the renderer receive the right state?"
    * use `page.evaluate` / `app.evaluate` for the few real Electron tests

  * two test layers
    * model tests (many, fast, vitest): fake sources → model → assert state
    * e2e tests (few, slow, Playwright): real Electron → assert observable behavior

  * reference: t3code patterns
    * fake service boundaries (pattern 1) → fake filesystem, fake pty for model tests
    * pure derivation functions (pattern 4) → model state → UI data derivation
    * fixture composition (pattern 5) → real model + fake sources for journey tests
    * in-memory SQLite (pattern 3) → if we keep SQLite cache


* monorepo structure

  * npm workspaces, no lerna, no nx
    ```
    packages/
      v2/              ← current code, still builds and runs
        src/
        tests/
        electron.vite.config.ts
        package.json
      v3/              ← fresh start
        src/
          main/
          renderer/
          cli/
          shared/
          model/       ← the new layer
        tests/
        tests-model/   ← journey tests on model
        electron.vite.config.ts
        package.json
    ```
  * v2 stays runnable — for reference, debugging, comparing behavior
  * v3 develops independently — fresh src tree, fresh tests
  * shared deps hoisted to root
  * `npm run dev:v2` / `npm run dev:v3` / `npm test:v2` / `npm test:v3`


* what carries over from nepic 02 (working, proven)

  * terminal management — xterm.js + Canvas + node-pty + DOM reparenting
  * socket server + CLI — ndjson protocol, all commands
  * CC session UUIDs — pre-assign via --session-id, resume via --resume
  * poke fix — three-step delivery (text → Escape → CR)
  * design sprint — UX designer's screenshots, voiceover, HTML mocks
    * `02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`
    * `02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`
  * the pipeline — test-arch → fs-eng → test-eng
  * napkin format + skills
  * `nap init` + templates in `src/templates/`

* what gets rewritten

  * state management — from dual-truth (SQLite + filesystem) to model layer with marker files
  * startup/resume — from complex reconciliation to simple walk-and-resume
  * session tracking — from SQLite sessions table to .agent.nap.json marker files
  * renderer store — from independent state manager to view client of main model
  * IPC — from ad-hoc sends to typed bridge protocol
  * napkin browser — from assembling data from 3-4 sources to rendering main's pushed model


* what's new

  * model layer (`src/model/`) — the business logic extracted from main.ts
  * typed bridge — explicit protocol between main model and renderer model
  * marker files (.agent.nap.json, .napkin.nap.json) — persistent identity on filesystem
  * journey tests on model — fake sources, real logic, vitest speed
  * `nap start claude "prompt"` — tier detection (already implemented, carry forward)
  * `nap ps` tree view — parent-child display (already implemented, carry forward)


* milestones (suggested, Kai and human should refine)

  * M0: monorepo setup
    * move current code to packages/v2/
    * create packages/v3/ skeleton
    * both build and test independently

  * M1: model layer + marker files
    * main model: sessions, napkins from marker files
    * s→r transition: walk dirs → build model
    * r→s transition: kill ptys, model persists via markers
    * journey tests: init → load → resume (on model, no Electron)

  * M2: bridge + renderer
    * typed IPC bridge: main pushes model state to renderer
    * renderer model: receives state, manages UI-local state
    * three-column layout with real data from model (not from ad-hoc IPC)
    * journey tests: launch agent → renderer shows card

  * M3: full lifecycle
    * close → reopen → everything there (journey test)
    * agent exit → exited flag → manual resume (journey test)
    * nepic switch → model swaps, renderer updates (journey test)
    * kanban from model state

  * M4: CLI integration
    * nap start / done / status work against new model
    * nap init creates marker files
    * nap ps reads from model

  * human reviews at each milestone — 10 min manual testing


* lessons to carry forward (process)

  * journey tests FIRST — before building, write the test that proves it works
  * state transitions are primary workflows, not edge cases
  * write principles explicitly, stress-test with scenarios before implementing
  * the architect should escalate when adding complexity (new status types, new state machines)
  * manual journey review every 3-4 features — human uses the app, finds breaks early
  * agents forget nap done — always last line of prompt, always
  * bash commands one at a time — no && chaining (auto-approve friendly)
  * commit frequently — don't let agents accumulate uncommitted work
