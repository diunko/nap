* reflection on nepic 02 + new direction for nepic 03

* what worked in nepic 02
  * the pipeline — test-arch → fs-eng → test-eng produces quality every time
  * design sprint — UX designer's screenshots and journeys are the north star
  * napkin format — the brainstorming and capture process is genuinely powerful
  * CC session UUIDs — pre-assigning via --session-id unlocks resume
  * poke fix — deep research into xterm/pty/Ink led to real fix

* what didn't work
  * 232 tests pass but the app doesn't work end-to-end
    * components tested in isolation, wiring never verified as flows
    * the tests prove each brick is solid but the house falls down
  * over-engineered state management
    * SQLite as centralized source of truth
    * filesystem as separate source of truth for content
    * reconciliation to sync them on startup
    * appIsClosing flag to prevent status clobbering
    * four status types (running/done/exited/new)
    * three tiers of session (bare/claude/napkin)
    * dual-truth model with conflict resolution rules
    * this is distributed systems architecture for a single-user desktop app
  * too many napkins too fast
    * 16 features implemented sequentially
    * accumulated tech debt made each one harder
    * last third of the nepic was fixing what the first two thirds broke
  * session lifecycle complexity
    * every feature touched the session status code
    * edge cases multiplied: what if SQLite says X but filesystem says Y?
    * the appIsClosing flag exists because we had to prevent one system from corrupting another
    * this complexity is a symptom — the architecture is fighting itself

* the core mistake
  * treated a single-user desktop app like a distributed system
  * two sources of truth (SQLite + filesystem) that need synchronizing
  * complex startup: read db → reconcile with fs → resume sessions → handle orphans
  * the whole thing is fragile because any step in the chain can fail silently

* the new direction: metadata in the filesystem

  * the key insight: "nothing is running on startup"
    * eliminates the entire state machine problem
    * no need to track running/done/exited across restarts
    * on launch: walk dirs, read meta, resume. that's it.

  * metadata as files, not database rows
    * each agent dir gets a `meta.json` or `meta.yaml`
      * cc_session_uuid — for resume
      * role — architect, test-arch, fs-eng, test-eng
      * napkin_slug — which napkin this belongs to
      * created_at
      * any other metadata the app needs
    * each napkin dir gets a `meta.json`
      * status — backlog, todo, doing, review, done
      * created_at
    * the meta file IS the state — no second system to sync with

  * on startup (the whole resume logic):
    * walk `30-napkins/` → find napkin dirs → read meta.json → get statuses
    * walk `agents/` in each napkin → read meta.json → get UUIDs
    * walk `20-architects/` → read meta.json → get UUID
    * for each UUID: `claude --verbose --resume <uuid>`
    * done. no SQLite queries, no reconciliation, no orphan handling.

  * while app is running:
    * in-memory state: which ptys are alive, which terminal is active, UI state
    * when something changes (agent starts, finishes, status changes): write to meta.json
    * in-memory state dies with the app — rebuilt from meta files on next launch

  * what this eliminates
    * SQLite for session tracking (maybe keep for fast queries if needed, but as cache, not source of truth)
    * reconciliation logic
    * appIsClosing flag
    * status state machine across restarts
    * dual-truth conflict resolution

  * what this preserves
    * the pipeline (test-arch → fs-eng → test-eng)
    * CC session UUIDs for resume
    * the three-column layout and design
    * the filesystem watcher
    * the CLI (nap start, nap ps, nap status, etc.)
    * everything about how agents work — just simpler state tracking

  * properties of meta.json approach
    * git-friendly — you can commit meta files, see project state from the repo
    * inspectable — `cat agents/001-test-arch/meta.json` shows exactly what the app knows
    * no orphaned records — if a dir exists, the agent exists. if it doesn't, it doesn't.
    * no sync bugs — one source of truth, period
    * robust by design — not robust by careful programming

  * open questions
    * do we still need SQLite at all? maybe for UI state (which terminal was active)?
    * or: one `state.json` at the nepic level for UI state?
    * what about nap ps? currently reads SQLite — would read meta files instead?
    * performance: walking dirs + reading JSON vs SQLite query. with 40 napkins × 3 agents = 120 file reads. milliseconds. not a concern.
    * board symlinks — keep them? they're filesystem-native status tracking, aligns with meta.json approach
