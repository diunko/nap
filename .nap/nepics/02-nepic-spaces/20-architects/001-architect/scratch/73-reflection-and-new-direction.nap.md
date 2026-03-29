* testing approach — state transitions as testable functions

* the key idea: s→r transition as a mapping
  * source state: files on disk (marker files, dirs, state.json)
  * target state: in-memory model (what the app shows, what ptys to spawn)
  * the transition IS the function under test
  * not necessarily pure — may do side effects (spawn ptys, create xterm instances)
  * but the DECISION of what to do is derivable from the source state
    * "given these files, what sessions should exist?" — pure
    * "spawn the pty" — side effect, happens after the decision

* separating decision from execution
  * decision function (testable, pure-ish):
    * input: filesystem snapshot (dirs, marker files, state.json)
    * output: plan — what to resume, what to show, what's active
    * ```
      filesOnDisk → {
        sessionsToResume: [{ uuid, name, role, command }],
        napkinsToShow: [{ slug, status, agents }],
        uiState: { activeNepic, activeTerminal, sidebarVisible }
      }
      ```
  * execution (side effects, not pure):
    * take the plan, spawn ptys, build store, render
    * this part is hard to unit test — but it's SIMPLE
    * the complexity lives in the decision, not the execution

* how to test the decision
  * JSON fixtures as source state
    * a fixture = a directory tree represented as JSON
    * ```json
      {
        "30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json": {
          "cc_session_uuid": "abc-123",
          "role": "test-arch",
          "name": "001-test-arch"
        },
        "20-architects/001-kai/.agent.nap.json": {
          "cc_session_uuid": "def-456",
          "role": "architect",
          "name": "Kai"
        },
        "state.json": {
          "activeNepic": "01-v1",
          "activeTerminal": "001-kai"
        }
      }
      ```
  * run the decision function against the fixture
  * assert on the plan:
    * "should resume 2 sessions: abc-123 (test-arch) and def-456 (architect)"
    * "architect should be the active terminal"
    * "0100-explore should show 1 agent dot"
  * no Electron, no Playwright, no filesystem, no pty
  * vitest, milliseconds

* fixture composition for journey testing
  * a journey = sequence of state transitions
  * fixture 1: fresh project after `nap init`
    * marker files exist, no CC sessions on disk yet
    * decision: architect session with UUID, status 'new' → should start with --session-id
  * fixture 2: project after working session, app closed
    * marker files with UUIDs, architect was running
    * decision: resume all with --resume
  * fixture 3: agent exited on its own, app closed after
    * marker file has `exited: true`
    * decision: skip this agent, resume others
  * fixture 4: switch nepics
    * two nepic dirs, state.json says nepic 02 is active
    * decision: show nepic 02's napkins, resume nepic 02's architect
  * each fixture is a JSON file — readable, diffable, committable

* what about the r→s transition (app closing)?
  * also a mapping: in-memory state → files on disk
  * but simpler — most persistent state was already written during runtime
  * the only new write: state.json (UI state)
  * decision: "what UI state to save?" — pure
  * execution: write state.json — one file write

* what about runtime events (agent starts, finishes, exits)?
  * each is a small transition: old in-memory state → new in-memory state
  * some also write to disk (marker file update on agent exit)
  * these are derivations too:
    * agent calls nap done → store update (dot color) + marker file unchanged
    * agent process dies → store update (gray dot) + marker file: `exited: true`
    * new agent started → store update (new dot) + marker file created
  * testable with: current store state + event → expected new store state + expected disk writes

* SQLite in-memory for tests
  * if we keep SQLite as cache:
    * tests use `:memory:` SQLite — same schema, no disk, no cleanup
    * each test gets fresh instance — no cross-test contamination
    * the pattern from t3code: swap filename to `:memory:`, run same migrations
    * we struggled with ABI conflicts (better-sqlite3 compiled for Electron vs system Node)
      * `:memory:` doesn't fix ABI — still need native module
      * but: if SQLite is just a cache rebuilt from markers, maybe we don't test SQLite directly
      * test the decision function (pure) instead of the cache layer

* how this plays with our TA process
  * TA designs test cases as before — seams, integration boundaries
  * NEW: TA also designs state fixtures for s→r transition
    * "given this filesystem state, what should the app do?"
    * the fixture IS the test case — data in, plan out
  * TE implements: pure function tests with JSON fixtures (vitest, fast)
  * TE also implements: Playwright tests for execution verification (does the pty actually spawn?)
  * two layers:
    * decision tests (many, fast, pure, JSON fixtures) — catch logic bugs
    * execution tests (few, slow, real Electron) — catch wiring bugs

* what this changes from nepic 02
  * nepic 02: tested components in isolation, assumed composition works
  * nepic 03: test the COMPOSITION as a function, verify execution separately
  * the decision function IS the composition test
    * it takes ALL inputs (filesystem state) and produces ALL outputs (the plan)
    * if the function is correct, the only remaining bugs are in execution (pty spawn, IPC)
    * execution bugs are rare and easy to catch with a few Playwright tests
