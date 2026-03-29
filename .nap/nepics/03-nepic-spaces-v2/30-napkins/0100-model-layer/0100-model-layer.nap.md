* 0100 — model layer + hypothesis validation
  * prove that: main model + typed bridge + renderer = testable architecture
  * go/no-go for the entire nepic

* the model (src/main/model.ts)
  * owns: nepics, napkins, agents, sessions — the app's business state
  * loads from filesystem: walk dirs, read marker files (.agent.nap.json, .napkin.nap.json)
  * method: loadFromFilesystem(nepicDir) → populates internal state
  * method: getNapkins() → list of napkins with status + agents
  * method: getArchitects() → list of architect sessions
  * emits change events when state mutates
  * does NOT own ptys, xterm, electron, UI — those are consumers of the model
  * injectable filesystem: real fs in production, fake in tests

* marker files
  * .napkin.nap.json in each napkin dir: { status }
  * .agent.nap.json in each agent dir: { cc_session_uuid, role, name, created_at, exited? }
  * the model reads these — they ARE the persistent state
  * for 0100: model reads them on startup. writing them back is 0200.

* the bridge (src/main/bridge.ts + src/shared/bridge-types.ts)
  * main → renderer: pushState(snapshot) — full state snapshot on every change
    * snapshot: { napkins: [...], architects: [...], activeNepicId }
    * simple first — full snapshot, not granular diffs
  * renderer → main: sendIntent(action) — user actions
    * for 0100: only intent needed is setActiveTerminal(id)
  * in Electron: IPC (webContents.send / ipcRenderer.on)
  * in tests: two EventEmitters wired together — no Electron needed

* the renderer (src/renderer/)
  * receives snapshots from bridge, stores in zustand
  * renders sidebar: collapsed napkin cards (name + agent dots + phase)
  * NOT the full NapkinBrowser yet — no focused/extended views, no file trees
  * just: a list of napkins with colored dots proving data flows end to end
  * the three zoom levels, kanban, etc are 0400/0500

* what's NOT in 0100
  * real ptys — model has a pty spawner interface but we don't wire real terminals
  * close/reopen survivability — that's 0200
  * CLI integration (nap start, nap done) — that's 0300
  * sidebar zoom levels, extended view — that's 0400
  * marker file writing — model reads markers, doesn't write them yet

* testing — pipeline: TA → fs-eng → TE
  * TA designs test cases FIRST — before implementation
    * understands the hypothesis: can we test journeys on the model with fakes, no Electron?
    * designs fixture structure: what dirs, what marker files, what scenarios
    * defines the model's test surface: what to assert after loading
    * defines the bridge test: model emits → what should arrive at renderer
    * defines the playwright smoke: what's the minimum that proves the stack works
    * output: test cases document that shapes how the fs-eng builds the API
  * fs-eng builds everything: model, bridge, fakes, renderer
    * builds the test infrastructure too: fake filesystem, fake bridge, fixture helpers
    * these are architecture, not test code — they're part of the deliverable
    * writes 3-4 smoke tests to validate own work (model loads, bridge delivers, renderer shows)
    * the smoke tests prove the plumbing works end to end
  * TE takes TA's full test cases + fs-eng's infrastructure
    * implements the comprehensive test suite: all scenarios, edge cases, journey tests
    * this is what proves the hypothesis — not just "it works" but "it's testable"
  * two test layers:
    * small (vitest): model + bridge with fake sources — fast, no Electron
    * medium (playwright): one smoke test — real Electron, sidebar renders from markers

* done criteria
  * model loads marker files and exposes correct state
  * bridge delivers state from main to renderer
  * renderer sidebar shows napkin cards with agent dots
  * fs-eng smoke tests pass (3-4 tests proving the plumbing)
  * TE test suite passes (≥10 test cases covering all TA scenarios)
  * playwright smoke test passes (app boots, sidebar renders real data)
  * npm run typecheck:v3 passes
