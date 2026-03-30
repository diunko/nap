* nepic 03 progress checkpoint — 2026-03-31

* what was accomplished
  * 8 napkins shipped, 22 bug fixes, 135 tests (114 small + 21 medium)
  * the app works end-to-end: init → open → architect runs → agents spawn → done → restart → everything survives
  * first real project built with v3: raft-viz (4 napkins, 13 agents, all done)
  * the human used it, restarted it, it worked. "it's fucking working"

* napkins completed
  * 0010 — monorepo setup (v2 + v3 side by side, nap2/nap3 binaries)
  * 0100 — model layer + hypothesis validation (model, bridge, fakes, vitest journey tests)
  * 0150 — model stress test (async, watching, write-back, lifecycle, small/medium equivalence)
  * 0200 — survivability (real ptys, 3-case STOP→RUN, close/reopen, Terminal component)
  * 0210 — CLI integration (socket server, all commands, nap init rewrite, nap3 binary)
  * 0220 — project templates (5 templates, --template/--list-templates/random flags)
  * bug bash — 22 fixes including 2 critical (nap-wait race, done persistence)
  * nap3 dev — DX command for hot-reload dev workflow

* architecture proven
  * model layer with injectable filesystem — testable with fakes in vitest
  * typed bridge (IPC) — main pushes snapshots, renderer sends intents
  * 2-state persistence — marker files, ephemeral dies on stop, no reconciliation
  * small/medium test equivalence — same journeys tested both ways
  * design tokens carried from v2 — dark theme, monospace, bullet language

* critical lessons learned (from bug bash)
  * tests that encode wrong assumptions pass green — test requirements, not implementation
  * synchronous mocks hide async races — need timing-sensitive tests for concurrent operations
  * state matrix testing — all flag combinations (started × done × exited × running) must be explored
  * interactive journey tests missing — click → intent → model → pty → snapshot → render
  * specs must explicitly state persistence for every flag

* what's left (from mega napkin + known issues)

  * 0300 was originally CLI integration — done as 0210 instead

  * 0400 — sidebar three zoom levels
    * collapsed: one line — name, dots, phase (HAVE THIS — basic version)
    * focused: artifacts + agents with dots (NOT YET)
    * extended: full file tree, [terminal], [diff], hover controls (NOT YET)
    * Cmd+K filter (NOT YET)
    * Cmd+E extend (NOT YET)
    * Cmd+B sidebar toggle (NOT YET)
    * dot colors by status not role (BUG — running shows role color)
    * pulsing animation on running dots (NOT YET)

  * 0500 — kanban + nepic switching
    * kanban overlay Cmd+` (NOT YET)
    * gutter with nepic icons (NOT YET)
    * (+) button for nepic creation (NOT YET)
    * nepic switching (NOT YET — model supports it, UI doesn't)

  * 0600 — polish
    * scroll lock Cmd+G (PARTIAL — follow mode exists)
    * nap3 log (STUB — returns empty)
    * file link provider (DONE)
    * hot reload (DONE — nap3 dev)

  * things NOT in mega napkin but needed for real use
    * filesystem watcher wired in Electron context (model handles it, not connected in app)
    * architect prompt template for non-template init (generic brainstorm prompt)
    * nap3 create nepic tested end-to-end through UI

* agent roster this session
  * 001-fs-eng-monorepo — 0010
  * 001-test-arch-model — 0100 TA
  * 002-fs-eng-model — 0100 build
  * 001-test-arch-stress — 0150 TA
  * 002-fs-eng-stress — 0150 build
  * 001-test-arch-survivability — 0200 TA
  * 002-fs-eng-survivability — 0200 build (needed follow-up poke for medium tests)
  * 001-cli-design-v2 — 0210 CLI design (iterated 3 versions with human)
  * 002-test-arch-cli — 0210 TA
  * 003-fs-eng-cli — 0210 build
  * 004-fs-eng-nap3 — nap3 binary rename
  * 001-fs-eng-templates — 0220 build
  * 002-fs-eng-debug-v3 — bug bash (22 fixes, 2 critical bugs found + fixed)
