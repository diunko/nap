* reflection on nepic 02 + new direction for nepic 03

* what worked in nepic 02
  * the pipeline — test-arch → fs-eng → test-eng produces quality every time
    * // agree, that was good!
  * design sprint — UX designer's screenshots and journeys are the north star
    * // btw, do you have claude session id for the designer? 
    * // we'll need their input on next epic
  * napkin format — the brainstorming and capture process is genuinely powerful
    * // agree. I really liked NN-smth iteration scheme; 
    * // maybe that should be reflected in the ui, but for now let's keep those displayed as separate files
  * CC session UUIDs — pre-assigning via --session-id unlocks resume
  * poke fix — deep research into xterm/pty/Ink led to real fix

* what didn't work
  * 232 tests pass but the app doesn't work end-to-end
    * components tested in isolation, wiring never verified as flows
    * the tests prove each brick is solid but the house falls down
      * // this is important observation. How do you think we could fix it?
      * // answer inline here with //AN: comments (Architect Nova)
  * over-engineered state management
    * SQLite as centralized source of truth 
      * // doesn't seem bad idea on it's own; can we dig deeper wdyt it's bad?
    * filesystem as separate source of truth for content
      * // again, if you just additively put them together, it should work, right?
      * // why this approach was flawed? what exactly made it non-straightforward?
    * reconciliation to sync them on startup
      * // i think i did a bad job at this, i had simple additive model in mind
      * // but looks like it got much more complicated than that
    * appIsClosing flag to prevent status clobbering
      * // well, you have to detect if it's children exiting because the app signaled them
      * // or is it their own exit and we shouldn't auto-resume them next time
      * // i think file-like entries with [terminal] is a very powerful thing, and 
        * // this allows to go and resume those sessions manually
        * // manually resumed means that they are auto-resumed on next start too
    * four status types (running/done/exited/new)
      * // i wasn't aware of what mental model and assumptions go boyond this state machine
      * // probabaly we should have been discussing that
      * // at which point this notion appeared?
      * // at which point do you think it would worth escalating this to me?
        * // and discussing together collaboratively?
        * // i think this is one of reasons what is causing reconciliation difficulties
          * // e.g. when there are a lot of stale things in sql
          * // and the new idea of basically having a lot of ephemeral state in-memory
            * // and just letting it go when the app finishes
            * // and modelling the new version around this assumption
    * three tiers of session (bare/claude/napkin)
      * // this is ok, and i think i have an idea how to manage them in simpler way
      * // we've came up with it closer to the end
        * // basically, what if agent is a dir with ui window to its fs 
          * // some conventions on what entries to show in open state 
            * // states are: (collapsed, open, extended)
        * // napkin is a more complex card with multiple agents inside agents/ dir
        * // you can have any set of agents in the napkin
        * // and free-floating agents they have their home dir somewhere else, like in root of the nepic? 
        * // architect is nepic free-floating agent with special role
        * // but basically any dir in .nap with .agent.nap.json (or w/e we name it) is an agent dir
        * // one thing that is brittle and tightly coupled now is we expect certain agents to exist for napkin, and we show their statuses in minified view; 
        * // but we can show statuses of all napkin agents (however order/roles/etc they are ordered)
        * // i think we really had this (almost), but the impl got complicated
        * // so really curious how simpler or differently we could have approached this?
          * // i'm still open to sqlite, to w/e basically; but just want to make sure we're not making it much more complex than it's needed
    * dual-truth model with conflict resolution rules
      * // were there a single thinking thread about how to organize resolution rules that we've reviewd together? 
    * this is distributed systems architecture for a single-user desktop app
      * // if it is set of simple assumptions and rules that we stick and that works its fine
        * // e.g. one that is simpler is: 
          * // all persistent state in filesystem meta files
          * // all ephemeral state in memory / sqlite
          * // app restart deletes ephemeral state
          * // and then everything emerges from these, and is real simple to think about
          * // but 1) we need to compe up with these 
            // and do some mental testing if the model is sound
            * // 2) we need to capture them in a way that agents understand
        * // or we could do something on reconciliation
          * // but have to think it thorugh, and mental test, and capture
            * // and think what implications for the app and for testing and for everythign else that brings
  * too many napkins too fast
    * 16 features implemented sequentially
    * accumulated tech debt made each one harder
      * // what exactly went wrong? 
      * // i see each component designed well
      * // i don't think its "technical" debt
      * // i think it's more of lack of product thinking
        * // and lack of designing around user journeys
        * // so component and workflow-driven design worked well for having robustness and quality on components and mid-integration level
        * // but how should we change the process to account for user stories too?
    * last third of the nepic was fixing what the first two thirds broke
  * session lifecycle complexity
    * every feature touched the session status code
    * edge cases multiplied: what if SQLite says X but filesystem says Y?
    * the appIsClosing flag exists because we had to prevent one system from corrupting another
    * this complexity is a symptom — the architecture is fighting itself
    * // this is too emotional and vague, you should be more specific when saying such things; how appIsClosing implies architecture fighting? i think you're just being handwavy
      * // edge cases are fine if we're having clear model on how they should work
      * // and then effectively they are not edge-cases
      * // app restart is main workflow, agents exiting are main workflow, etc etc
        * // how they are edge cases?

* the core mistake
  * treated a single-user desktop app like a distributed system
    * // i don't think that this is the core mistake
    * // it's not the complexity that kills, it's unmodeled implied incidental complexity that kills
      * // things restarting and exiting are core to our problem, not incidental
  * two sources of truth (SQLite + filesystem) that need synchronizing
    * // what were principles that we were using for reconciliation and merge, can you recall please?
    * // if we write those explicitly, was it some flaws in principles? 
    * // or was it absense of principles? 
    * // let's try and write them out explicitly now and analyze what was it that we followed
  * complex startup: read db → reconcile with fs → resume sessions → handle orphans
  * the whole thing is fragile because any step in the chain can fail silently
    * // ?? what exactly do you mean by this?

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
