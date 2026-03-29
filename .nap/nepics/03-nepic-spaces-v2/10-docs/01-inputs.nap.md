* nepic 03 — nepic spaces v2: mega napkin

* what this is
  * same vision as nepic 02: structured project view, agent management, the designer's J1-J5
  * different approach: model layer as testable core, marker files for persistence, clean room build
  * not a refactor of v2 — a fresh implementation referencing v2's proven primitives
  * the hypothesis: a model layer with fake sources gives us journey-testable architecture

* reference
  * v2 code: current `src/` — proven terminal mgmt, pty lifecycle, socket/CLI, xterm
  * v2 design: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/`
    * `scratch/80-nepic03-mega-napkin.nap.md` — Nova's architectural thinking
    * `scratch/70,72,73-reflection-and-new-direction.nap.md` — human + Nova discussion
    * `reference/main-flows.nap.md` — traced chains for every action
    * `reference/t3code-testing-patterns-catalog.md` — patterns 1,4,5 apply
    * `stories/00-journeys.nap.md` — designer's emotional journey (north star)
    * `stories/01-core-stories.nap.md` — PM stories with //A: review
  * screenshots: `02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`


* the architectural bet
  * two models, one bridge
    * main model: owns sessions, napkins, nepics, filesystem reads, pty lifecycle decisions
    * renderer model: owns UI state, receives pushes from main, sends intents back
    * bridge: typed IPC — main pushes snapshots, renderer sends actions
    * the bridge IS the contract — test either side independently
  * testability through fakes
    * main model: inject fake filesystem + fake pty spawner → test in vitest, milliseconds
    * renderer model: inject fake bridge pushes → test derivations in vitest
    * bridge: two EventEmitters in-process → test full round-trip in vitest
    * Playwright: few tests for "does xterm actually render, does pty actually spawn"
  * t3code pattern 1 (fake service boundary): fake the filesystem and pty, test the model
  * t3code pattern 4 (pure derivation): model state → UI data as pure functions
  * t3code pattern 5 (fixture composition): real model + fake sources for journey tests


* persistence: the 2-state model
  * two system states
    * STOPPED — app not running, data on disk, nothing in memory
    * RUNNING — app running, ptys alive, model in memory
  * persistent (survives stop) — marker files on filesystem
    * agent: .agent.nap.json in agent dir
      * cc_session_uuid, role, name, created_at
      * exited: true when agent died on its own (skip auto-resume)
    * napkin: .napkin.nap.json in napkin dir
      * status: backlog / todo / doing / review / done
    * nepic: dir structure (implicit)
    * UI state: .nap/ui-state.json (active nepic, active terminal, sidebar visible)
    * artifacts: .nap.md, .spec.md, prompt.md, response.md (already filesystem)
  * ephemeral (dies on stop) — in-memory only
    * PIDs, pty handles, xterm instances
    * running/idle/done distinction — only while app is open
    * the model itself — rebuilt from marker files on s→r
  * s→r transition (app starts)
    * walk dirs → read marker files → build model
    * for each agent with UUID and not exited → resume via `claude --resume <uuid>`
    * for agents with UUID but no prior session → start fresh via `--session-id <uuid>`
    * done — no reconciliation, no SQLite read
  * r→s transition (app stops)
    * kill all ptys (ephemeral dies)
    * save UI state to disk
    * marker files already written during runtime — nothing to flush
  * agent exits while running
    * write exited: true to marker file
    * next start: skip auto-resume
    * user clicks [terminal] → clear exited flag → resumes next time
  * what this eliminates
    * SQLite as session source of truth
    * reconciliation logic
    * appIsClosing flag
    * 4-status state machine
    * stale/orphaned rows


* what carries over from v2 (copy, don't rewrite)
  * terminal management: xterm.js + Canvas addon + node-pty + DOM reparenting
  * socket server + ndjson protocol
  * CLI: nap.ts (talks to socket, no Electron deps)
  * CC session UUIDs: --session-id for new, --resume for existing
  * poke: three-step delivery (text → Escape → CR)
  * electron-vite config + preload pattern
  * message queue (per-terminal output buffering until renderer ready)

* what's new
  * model layer (src/model/) — business logic extracted, testable with fakes
  * typed bridge (src/bridge/) — explicit IPC protocol, both directions
  * marker files (.agent.nap.json, .napkin.nap.json) — persistence on filesystem
  * journey tests on model — vitest, fake sources, millisecond speed
  * clean src/ tree in packages/v3/


* directory structure
  * ```
    packages/
      v2/                ← current code, untouched, still builds
        src/
        tests/
        package.json
      v3/                ← fresh implementation
        src/
          main/
            main.ts          ← slim: lifecycle + wiring, delegates to model
            model.ts         ← app state, business logic, marker file I/O
            pty-manager.ts   ← copied from v2, adapted for model
            socket-server.ts ← copied from v2
            bridge.ts        ← typed IPC: pushes model state to renderer
          renderer/
            index.tsx
            store.ts         ← view client: receives bridge pushes, UI-local state
            components/
              Terminal.tsx    ← copied from v2
              NapkinBrowser.tsx
              Gutter.tsx
              KanbanOverlay.tsx
            terminal-registry.ts  ← copied from v2
          cli/
            nap.ts           ← copied from v2 (works as-is against socket)
          shared/
            protocol.ts      ← socket types (copied)
            bridge-types.ts  ← bridge protocol types (new)
            ndjson.ts        ← copied
            constants.ts     ← copied
        tests/
          model/           ← vitest: fake sources, journey tests on model
          bridge/          ← vitest: fake IPC, round-trip tests
          e2e/             ← playwright: real Electron, few smoke tests
        electron.vite.config.ts
        package.json
    ```
  * root package.json: npm workspaces
  * `npm run dev:v2` / `npm run dev:v3` / `npm test:v3`


* napkins (in sequence)

  * 0010 — monorepo setup
    * move current code to packages/v2/, keep it building and testable
    * create packages/v3/ skeleton with electron-vite, vitest, playwright configs
    * root package.json with npm workspaces
    * both `npm run dev:v2` and `npm run dev:v3` work (v3 shows empty Electron window)
    * both `npm run test:v2` and `npm run test:v3` pass (v3 has one trivial smoke test)
    * copy proven primitives into v3/src/: ndjson, constants, protocol types
    * no new functionality — just the scaffold that everything else builds on

  * 0100 — model layer + hypothesis validation
    * the POC: prove model + fakes + bridge works in Electron
    * main model reads marker files, holds state, pushes to renderer
    * renderer shows sidebar with napkins + agent dots from model
    * vitest: model tests with fake filesystem (s→r transition, agent lifecycle)
    * playwright: one test — boot app, verify sidebar renders from model
    * this is the go/no-go checkpoint
    * if this works: foundation is solid, keep building
    * if this doesn't: we know within one day, pivot

  * 0200 — close/reopen survivability (the nap)
    * journey: launch app → agents running → quit → reopen → everything's there
    * marker file writes on agent create, agent exit, status change
    * s→r reads markers, rebuilds model, resumes agents
    * no appIsClosing — ptys die, model rebuilt from markers
    * journey test on model: write markers → load → assert sessions
    * playwright: launch → create agent → quit → reopen → agent dot is back

  * 0300 — agent lifecycle through CLI
    * nap start → model creates agent, writes marker, spawns pty, pushes to renderer
    * nap done → model updates state, dot turns blue
    * nap ps → reads from model (or socket query)
    * nap status → writes marker file + updates model
    * the architect pipeline: start agent → nap nap → read response
    * journey tests: CLI → socket → model → renderer shows correct state

  * 0400 — sidebar: three zoom levels
    * collapsed: one line — name, dots, phase (the 40-napkin dashboard)
    * focused: artifacts + agents with dots (the working view)
    * extended: full file tree, [terminal], [diff], hover controls
    * agent dots under correct napkin card — match by name, not position
    * architect card pinned at top with acting/retired labels
    * Cmd+K filter, Cmd+E extend
    * the designer's screenshots are the spec

  * 0500 — kanban + nepic switching
    * kanban overlay (Cmd+`): five columns, cards with dots, → navigation
    * nepic creation: (+) button scaffolds dirs + markers, boots architect
    * nepic switching: gutter click swaps model context, renderer updates
    * the designer's screenshot 04 is the spec

  * 0600 — polish + edge cases
    * breadcrumb navigation in terminal header
    * scroll lock (Cmd+G double-press)
    * file link provider
    * hot reload
    * whatever breaks during human testing


* process rules (lessons from nepic 02)
  * journey test FIRST — write the failing test before the spec
  * the architect (me) traces every journey through code before writing prompts
  * state transitions are primary workflows, not edge cases
  * agents must call `nap done` — last line of every prompt, verbatim
  * bash commands one at a time — no && chaining
  * commit frequently
  * manual review every 2-3 napkins — human uses the app, finds breaks early
  * escalate when adding complexity — new state types, new transitions, discuss first


* milestones and checkpoints
  * after 0100: human runs v3 app, sees sidebar with real data → go/no-go
  * after 0200: human closes app, reopens, everything is there → survivability proven
  * after 0300: human does a real architect workflow (start agent, wait, read response) → pipeline works
  * after 0400: app looks like the designer's screenshots → the product exists
  * after 0500+: kanban, nepics, the full J1-J5 vision
