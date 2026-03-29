* reflection on nepic 02 + new direction for nepic 03

* what worked in nepic 02
  * the pipeline — test-arch → fs-eng → test-eng produces quality every time
    * // agree, that was good!
  * design sprint — UX designer's screenshots and journeys are the north star
    * // btw, do you have claude session id for the designer?
    * // we'll need their input on next epic
    * //AN: I don't have the CC session UUID — the designer was launched via old-style `nap start` before we had UUID tracking. their terminal was `003-ux-design-review`. if the CC session file still exists on disk (~/.claude/sessions/), you could grep for "003-ux-design-review" or "v2-final" to find it.
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
      * //AN: journey tests first. before building a feature, write the user story as a test:
        * //AN: "launch app → verify architect terminal exists → verify it's running claude"
        * //AN: this test FAILS before implementation, PASSES after. the implementation is done when the journey works.
        * //AN: we did the opposite: built components, tested components, assumed wiring would work.
        * //AN: the PM stories at the end were the right instinct — but 15 napkins too late.
        * //AN: for nepic 03: write journey tests FIRST, then implement to make them pass.
  * over-engineered state management
    * SQLite as centralized source of truth
      * // doesn't seem bad idea on it's own; can we dig deeper wdyt it's bad?
      * //AN: you're right, it's not bad on its own. the problem: SQLite is source of truth for STATUS, but filesystem is source of truth for EXISTENCE (agent dirs). when a dir exists but SQLite has no row — what's the status? when SQLite has a row but no dir — orphaned or branch-switched? these questions required reconciliation. if status lived in the same place as existence (the filesystem, e.g. meta.json), there's nothing to reconcile.
    * filesystem as separate source of truth for content
      * // again, if you just additively put them together, it should work, right?
      * // why this approach was flawed? what exactly made it non-straightforward?
      * //AN: the additive model was sound in principle. the flaw was in INTERACTIONS. when an agent is created, you write to BOTH (SQLite row + agent dir). when status changes, you update BOTH (SQLite + symlink). when app restarts, you read BOTH and merge. each interaction is simple, but there are ~15 of them, and each must be consistent. we got ~12 of 15 right. the 3 we got wrong broke the journeys. the issue isn't the model — it's that every write operation touches two systems, and we didn't have transactional guarantees or explicit invariants for each operation.
    * reconciliation to sync them on startup
      * // i think i did a bad job at this, i had simple additive model in mind
      * // but looks like it got much more complicated than that
      * //AN: the reconciliation code itself is simple (scratch/41). the complication came from upstream: sessions being created without proper dirs, status transitions happening without updating both systems, the appIsClosing flag adding a conditional path. reconciliation can't fix what upstream broke — it can only detect mismatches.
    * appIsClosing flag to prevent status clobbering
      * // well, you have to detect if it's children exiting because the app signaled them
      * // or is it their own exit and we shouldn't auto-resume them next time
      * //AN: you're right, this IS a real requirement. it's not incidental complexity. the distinction "app closed vs agent died" is fundamental to resume. the flag is a legitimate solution. where I went wrong was calling it "architecture fighting itself" — it's actually: "when you persist ephemeral state (process alive/dead), you need to distinguish the cause of death."
      * // i think file-like entries with [terminal] is a very powerful thing, and
        * // this allows to go and resume those sessions manually
        * // manually resumed means that they are auto-resumed on next start too
        * //AN: this is a great model. the [terminal] entry in the card becomes the resume action. clicking it = "I want this agent back." once resumed, its meta file says "has UUID, should resume" — so next restart auto-resumes it too. the user's click is the signal, not a status flag.
    * four status types (running/done/exited/new)
      * // i wasn't aware of what mental model and assumptions go boyond this state machine
      * // probabaly we should have been discussing that
      * // at which point this notion appeared?
      * //AN: `new` appeared in napkin 1600 (agent lifecycle redesign, scratch/60). the original v1 had three: running/done/exited. `new` was added for `nap init` — a session pre-created in SQLite before the app ever launches. the assumption: "session exists in db but pty never started."
      * // at which point do you think it would worth escalating this to me?
      * //AN: when writing scratch/60, when I added the fourth status and the state machine diagram. I should have stopped and said: "we're adding a new status to a state machine we haven't fully modeled — let's map out all transitions together before implementing." instead I designed it, you reviewed the napkin, but we didn't stress-test the state machine with scenarios.
        * // and discussing together collaboratively?
        * //AN: yes. the state machine should have been a collaborative design, not a napkin review. walking through: "what if the app crashes mid-resume? what if two sessions have the same name? what if nap init runs but nap open never does?" — these are the questions that would have found the gaps.
        * // i think this is one of reasons what is causing reconciliation difficulties
          * // e.g. when there are a lot of stale things in sql
          * //AN: exactly. stale rows come from: sessions created by nap init (status 'new'), sessions from double invocations, sessions from crashed app (status stuck at 'running'). each of these is a combination the state machine didn't explicitly handle.
          * // and the new idea of basically having a lot of ephemeral state in-memory
            * // and just letting it go when the app finishes
            * // and modelling the new version around this assumption
            * //AN: this eliminates the stale row problem entirely. in-memory state dies with the app. the only persistent state is meta.json files that the user/agent explicitly created. no stale rows because there are no rows — just files.
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
        * //AN: this is the simplest model. the convention-based approach (any dir with .agent.nap.json is an agent) eliminates the need for SQLite to track agent existence. the app just walks dirs, finds marker files, renders cards. no registration step, no creation API — drop a dir with a marker file and you're an agent.
        * // one thing that is brittle and tightly coupled now is we expect certain agents to exist for napkin, and we show their statuses in minified view;
        * // but we can show statuses of all napkin agents (however order/roles/etc they are ordered)
        * //AN: right. currently the NapkinBrowser tries to match session names to agent dir names — if they don't match, the agent shows as orphaned. the simpler approach: just show whatever's in `agents/` dir. each agent has its own .agent.nap.json with role/status. the card shows dots for ALL agents it finds. no matching, no expectations.
        * // i think we really had this (almost), but the impl got complicated
        * // so really curious how simpler or differently we could have approached this?
        * //AN: the complication came from trying to MATCH agents across two systems (filesystem dirs vs SQLite sessions). if agent identity lives in one place (the dir + its meta file), matching is unnecessary. you don't need to figure out "which SQLite row corresponds to which dir" — the meta file IN the dir is the row.
          * // i'm still open to sqlite, to w/e basically; but just want to make sure we're not making it much more complex than it's needed
          * //AN: SQLite is fine as a CACHE or for fast queries. the problem was using it as source of truth for state that also needs to exist in the filesystem. if meta.json is truth and SQLite is a cache that gets rebuilt on startup from meta files, that's actually clean. you get fast queries AND filesystem-first persistence.
    * dual-truth model with conflict resolution rules
      * // were there a single thinking thread about how to organize resolution rules that we've reviewd together?
      * //AN: yes — scratch/41-persistence-model.nap.md, iterated from scratch/40. we established 5 principles:
        * //AN: 1. filesystem defines what exists
        * //AN: 2. SQLite annotates what exists
        * //AN: 3. reconciliation is additive, never destructive
        * //AN: 4. "what exists?" → filesystem. "what's the status?" → SQLite
        * //AN: 5. they never compete on the same question
        * //AN: principle 5 was where reality diverged. every WRITE operation (create agent, change status, resume session) touches both systems. they DO compete — not on reads, but on writes. we modeled read-time separation but not write-time coordination.
    * this is distributed systems architecture for a single-user desktop app
      * // if it is set of simple assumptions and rules that we stick and that works its fine
        * // e.g. one that is simpler is:
          * // all persistent state in filesystem meta files
          * // all ephemeral state in memory / sqlite
          * // app restart deletes ephemeral state
          * // and then everything emerges from these, and is real simple to think about
          * //AN: this is cleaner than what we had. three rules, no ambiguity about which system owns what. the key improvement: ephemeral state DIES on restart — you don't have to carefully preserve it or reconcile it. you rebuild it from the persistent layer (meta files).
          * // but 1) we need to compe up with these
            // and do some mental testing if the model is sound
            * //AN: agreed. let's do this in the next napkin version — write out candidate rules, then walk through scenarios: "user creates agent → closes app → reopens → what happens?"
            * // 2) we need to capture them in a way that agents understand
            * //AN: yes. the rules need to be in the onboarding, not discovered during implementation.
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
        * //AN: you're right. it's not technical debt — the code is well-written. it's product debt. each component works, but the product (the user experience of init → open → work → close → resume) was never the unit of testing. we tested bricks, not the house.
        * // and lack of designing around user journeys
        * //AN: exactly. the process was: napkin → spec → agents build → tests verify component. it should have been: user story → journey test (fails) → napkin → agents build → journey test (passes).
        * // so component and workflow-driven design worked well for having robustness and quality on components and mid-integration level
        * //AN: yes. the pipeline produces quality components. that's proven. the gap is: who verifies that the components compose into a working product?
        * // but how should we change the process to account for user stories too?
        * //AN: two ideas:
          * //AN: 1. start each milestone with journey tests — Playwright tests that simulate the user flow. they fail before implementation. implementation is done when they pass.
          * //AN: 2. after every 3-4 napkins, do a "journey review" — literally try to use the app as a user would. find the breaks before building more on top.
    * last third of the nepic was fixing what the first two thirds broke
  * session lifecycle complexity
    * every feature touched the session status code
    * edge cases multiplied: what if SQLite says X but filesystem says Y?
    * the appIsClosing flag exists because we had to prevent one system from corrupting another
    * this complexity is a symptom — the architecture is fighting itself
    * // this is too emotional and vague, you should be more specific when saying such things; how appIsClosing implies architecture fighting? i think you're just being handwavy
    * //AN: you're right. let me be specific. the appIsClosing flag exists because: (1) pty onExit fires for ALL pty deaths — both "app closing" and "agent died on its own." (2) without the flag, clean quit marks every session as 'exited' in SQLite. (3) on next launch, resume can't find any 'running' sessions. the flag is a legitimate solution to a real problem: distinguishing cause of process death. I was wrong to frame it as "architecture fighting" — it's a necessary distinction when you persist process lifecycle state.
      * // edge cases are fine if we're having clear model on how they should work
      * //AN: agreed. the issue wasn't edge cases — it was that we didn't have a clear model upfront. we discovered the rules by hitting bugs (like the resume-never-finds-running bug).
      * // and then effectively they are not edge-cases
      * // app restart is main workflow, agents exiting are main workflow, etc etc
        * // how they are edge cases?
        * //AN: they're not edge cases. I was wrong to call them that. they're primary workflows. what made them FEEL like edge cases was that we designed for the "app is running, agents are working" steady state and treated restart/exit as afterthoughts. but restart and exit ARE the product.

* the core mistake
  * treated a single-user desktop app like a distributed system
    * // i don't think that this is the core mistake
    * // it's not the complexity that kills, it's unmodeled implied incidental complexity that kills
    * //AN: agreed. restating: the core mistake was implementing before explicitly modeling the state rules. we had data ownership principles (scratch/41) but not state transition rules. we never wrote: "here are all the (app state × agent state) combinations and what happens in each." we discovered the rules empirically.
      * // things restarting and exiting are core to our problem, not incidental
      * //AN: correct. restart and exit are first-class concerns, not edge cases to handle later.
  * two sources of truth (SQLite + filesystem) that need synchronizing
    * // what were principles that we were using for reconciliation and merge, can you recall please?
    * //AN: from scratch/41-persistence-model.nap.md:
      * //AN: 1. filesystem defines what exists (structure + content)
      * //AN: 2. SQLite annotates what exists (statuses, UUIDs, timestamps)
      * //AN: 3. reconciliation is additive, never destructive (never delete rows/files)
      * //AN: 4. "what exists?" → filesystem. "what's the status?" → SQLite
      * //AN: 5. filesystem changes can't corrupt SQLite. SQLite loss can't corrupt filesystem.
    * // if we write those explicitly, was it some flaws in principles?
    * //AN: the principles are sound for READ operations. the flaw: they don't address WRITES. every write touches both systems. "create agent" = INSERT SQLite row + mkdir agent dir. "change status" = UPDATE SQLite + move symlink. the principles say how to READ (which system to ask), but not how to WRITE (what order, what if one fails, what's the invariant).
    * // or was it absense of principles?
    * //AN: absence of WRITE principles. we had read principles.
    * // let's try and write them out explicitly now and analyze what was it that we followed
    * //AN: yes — let's do this in the next version (72). write out: what we actually did on each write operation, what could go wrong, what invariant we assumed.
  * complex startup: read db → reconcile with fs → resume sessions → handle orphans
  * the whole thing is fragile because any step in the chain can fail silently
    * // ?? what exactly do you mean by this?
    * //AN: specific example: the startup sequence is initDatabase → reconcile → loadUiState → resumeArchitect → startWatcher → createWindow. if reconcile finds 0 napkins (because nepic path is wrong, or 30-napkins/ doesn't exist yet), everything downstream renders empty sidebar. no error, no crash — just blank. "silently" means: the failure mode is "nothing appears" rather than "error message tells you what's wrong." the fix would be: explicit guards/assertions at each step. "if no napkins found and no architect found, something is wrong — surface it."

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
