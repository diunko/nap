* reflection on nepic 02 + new direction for nepic 03

* what worked in nepic 02
  * the pipeline — test-arch → fs-eng → test-eng produces quality every time
    * // agree, that was good!
  * design sprint — UX designer's screenshots and journeys are the north star
    * // btw, do you have claude session id for the designer?
    * // we'll need their input on next epic
    * //AN: don't have UUID — launched before UUID tracking
      * terminal was `003-ux-design-review`
      * grep `~/.claude/sessions/` for "003-ux-design-review" or "v2-final" to find it
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
      * //AN: journey tests first
        * write user story as a Playwright test BEFORE building
        * test fails initially — that's the point
        * implementation done when journey test passes
        * we did the opposite: built components, tested components, assumed wiring works
        * the PM stories at the end were right instinct — 15 napkins too late
        * for nepic 03: journey tests FIRST
          * // huh, how you practically do this? how you test before _anything_ is there?
            * // quick thought: is it more of _draft_ tests, 
              * // like playwrite files with comments of the intent (by TA)
            * // and later TE adds impl?
            * // or actually comments is just another manifestation of what we already doing
              * // with TA's test specs?
              * // then should it be just that TA also does a separate pass on user journeys?
              * // what i absolutely love about current TA's scenarios is that they are
                * // strategic to all integration surfaces
                * // and journey-based might be too brittle with journey changes
                * // but integration should still work as long as components are there
                  * // and they get refactored with the components and apis
                  * // and basically are a manifestation of contracts and apis in action
              * // so really curious how storie-based tests would play into this?
                * // still hate selector-based tests; do we absolutely have to use these?
              * // what approach could we use for story/journey tests? 
  * over-engineered state management
    * SQLite as centralized source of truth
      * // doesn't seem bad idea on it's own; can we dig deeper wdyt it's bad?
      * //AN: not bad on its own
        * the problem: SQLite owns STATUS, filesystem owns EXISTENCE
        * dir exists but no SQLite row → what's the status?
        * SQLite row but no dir → orphaned or branch-switched?
        * these questions required reconciliation
        * if status lived with existence (meta.json in the dir) → nothing to reconcile
          * // i think it's more about flawed assumptions on what the status is 
            * // and what it should preserve, 
            * // (basically misaligned from journeys/strories)
              * // and thus core stories treated as edge-cases 
    * filesystem as separate source of truth for content
      * // again, if you just additively put them together, it should work, right?
      * // why this approach was flawed? what exactly made it non-straightforward?
      * //AN: additive model sound in principle
        * flaw was in INTERACTIONS — every write touches BOTH systems
        * create agent: SQLite row + agent dir
        * change status: SQLite UPDATE + symlink move
        * ~15 such interactions, each must be consistent
        * got ~12 of 15 right — the 3 we missed broke the journeys
        * no transactional guarantees or explicit invariants per operation
          * // curious to dig deeper into these; let's include them in thought excercise
    * reconciliation to sync them on startup
      * // i think i did a bad job at this, i had simple additive model in mind
      * // but looks like it got much more complicated than that
      * //AN: reconciliation code itself is simple (scratch/41)
        * complication came from upstream
        * sessions created without proper dirs
        * status transitions without updating both systems
        * appIsClosing adding conditional path
        * reconciliation can't fix what upstream broke — only detects mismatches
          * // is it then that we were modelling the wrong system?
          * // it feels like we were modelling only running, when in fact we have:
            * // fresh
            * // running
            * // stop (and what survives)
            * // re-start
            * // and, in fact, it can be thought of just as:
              * // stopped, and any data preserved (empty=just a special case of this)
              * // running
              * // and two transitions s->r and r->s
              * // and then, on top of this, some implication / restriction on branches
                * // that we could just impose on branching strategy to keep core 2S + 2T consistent
    * appIsClosing flag to prevent status clobbering
      * // well, you have to detect if it's children exiting because the app signaled them
      * // or is it their own exit and we shouldn't auto-resume them next time
      * //AN: you're right — this IS a real requirement, not incidental
        * "app closed vs agent died" distinction is fundamental to resume
        * the flag is legitimate
        * I was wrong to call it "architecture fighting itself"
        * more accurately: persisting ephemeral state requires distinguishing cause of death
      * // i think file-like entries with [terminal] is a very powerful thing, and
        * // this allows to go and resume those sessions manually
        * // manually resumed means that they are auto-resumed on next start too
        * //AN: great model
          * [terminal] entry = resume action
          * click it = "I want this agent back"
          * meta file then says "has UUID, should resume"
            * // has uuid, that's one
            * // should resume = auto-resumes
            * // has exited cleanly = exited, manual action needed to resume
          * next restart auto-resumes it too
          * user's click is the signal, not a status flag
    * four status types (running/done/exited/new)
      * // i wasn't aware of what mental model and assumptions go boyond this state machine
      * // probabaly we should have been discussing that
      * // at which point this notion appeared?
      * //AN: `new` appeared in napkin 1600 (scratch/60)
        * v1 had three: running/done/exited
        * `new` added for `nap init` — session in SQLite before app launches
      * // at which point do you think it would worth escalating this to me?
      * //AN: when writing scratch/60 and adding the fourth status
        * should have said: "adding a status to a state machine we haven't modeled — let's map transitions together"
        * instead: designed it, you reviewed napkin, but didn't stress-test with scenarios
        * // and discussing together collaboratively?
        * //AN: yes — state machine should have been collaborative design
          * walk through: "app crashes mid-resume? two sessions same name? init but never open?"
          * these questions would have found the gaps
          * // what process step should we add here?
        * // i think this is one of reasons what is causing reconciliation difficulties
          * // e.g. when there are a lot of stale things in sql
          * //AN: exactly — stale rows from:
            * sessions created by nap init (status 'new')
            * double invocations
            * crashed app (status stuck at 'running')
            * each is a combination the state machine didn't handle
          * // and the new idea of basically having a lot of ephemeral state in-memory
            * // and just letting it go when the app finishes
            * // and modelling the new version around this assumption
            * //AN: eliminates stale row problem entirely
              * in-memory state dies with the app
              * persistent state = only meta.json files that user/agent explicitly created
              * no stale rows because there are no rows — just files
              * // i mean, having central persistent queryable source of truth for ephemeral is kinda nice
                * // e.g. kanban board and side-panel can query it
                * // i'm not really sure how to manage napkin statuses yet
                  * // when we move things on board from backlog to todo, 
                    * // does it look like we're doing a bunch of updates to meta files and commit them?
                    * // or is it an update to sqlite?
                    * // sqlite def has its advantages;
                      * // maybe if we model app state as running|stopped
                        * // and model transitions as r->s and s->r
                        * // and what do we do with what set of metadata 
                        * // maybe that's simple enough for everyone to follow?
                        * // not sure yet tbh
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
        * //AN: simplest model — convention-based
          * any dir with marker file (.agent.nap.json) = agent
          * app walks dirs, finds markers, renders cards
          * no registration, no creation API
          * drop a dir with a marker file → you're an agent
            * // sounds simple, but
              * // how can we think of it in terms of `nap start`? 
              * // is it that `nap start` creates a directory? and what about PID?
                * // and how that gets to ui? 
        * // one thing that is brittle and tightly coupled now is we expect certain agents to exist for napkin, and we show their statuses in minified view;
        * // but we can show statuses of all napkin agents (however order/roles/etc they are ordered)
        * //AN: right — current code tries to MATCH session names to agent dir names
          * if names don't match → orphaned
          * simpler: just show whatever's in agents/ dir
          * each has its own .agent.nap.json with role/status
          * card shows dots for ALL agents found — no matching, no expectations
        * // i think we really had this (almost), but the impl got complicated
        * // so really curious how simpler or differently we could have approached this?
        * //AN: complication came from matching across two systems
          * filesystem dirs vs SQLite sessions
          * if identity lives in one place (dir + meta file) → matching unnecessary
          * the meta file IN the dir IS the row
          * // i'm still open to sqlite, to w/e basically; but just want to make sure we're not making it much more complex than it's needed
          * //AN: SQLite fine as CACHE, not source of truth
            * meta.json = truth, SQLite = cache rebuilt on startup
              * // maybe, maybe
              * // are we running into cache invalidation then? 
              * // `nap start` and other tools: what do they update? 
              * // it just makes me think that App in-memory is the source of truth
                * // it has and api that everyone talks to
                * // and app pushes updates to systems that need to be updated
                * // if that's the case, we need well-designed api
                  * // and cli and ui are just consumers of that
                  * // i guess it's modeled like that already?
            * fast queries AND filesystem-first persistence
    * dual-truth model with conflict resolution rules
      * // were there a single thinking thread about how to organize resolution rules that we've reviewd together?
      * //AN: yes — scratch/41, iterated from scratch/40
        * five principles:
          * P1: filesystem defines what exists
          * P2: SQLite annotates what exists
          * P3: reconciliation additive, never destructive
          * P4: "what exists?" → filesystem. "what's the status?" → SQLite
          * P5: they never compete on the same question
        * P5 was where reality diverged
          * every WRITE touches both systems
          * they DO compete — not on reads, but on writes
          * we modeled read-time separation but not write-time coordination
    * this is distributed systems architecture for a single-user desktop app
      * // if it is set of simple assumptions and rules that we stick and that works its fine
        * // e.g. one that is simpler is:
          * // all persistent state in filesystem meta files
          * // all ephemeral state in memory / sqlite
          * // app restart deletes ephemeral state
          * // and then everything emerges from these, and is real simple to think about
          * //AN: cleaner than what we had
            * three rules, no ambiguity
            * key: ephemeral state DIES on restart
            * no careful preservation, no reconciliation
            * rebuild from persistent layer (meta files)
          * // but 1) we need to compe up with these
            // and do some mental testing if the model is sound
            * //AN: agreed — next napkin: candidate rules + scenario walkthrough
            * // 2) we need to capture them in a way that agents understand
            * //AN: rules in onboarding, not discovered during implementation
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
        * //AN: right — not technical debt, product debt
          * each component works
          * the product (init → open → work → close → resume) was never the unit of testing
          * we tested bricks, not the house
        * // and lack of designing around user journeys
        * //AN: process was: napkin → spec → agents build → tests verify component
          * should have been: story → journey test (fails) → napkin → agents build → journey test (passes)
        * // so component and workflow-driven design worked well for having robustness and quality on components and mid-integration level
        * //AN: pipeline produces quality components — proven
          * gap: who verifies components compose into a working product?
        * // but how should we change the process to account for user stories too?
        * //AN: two ideas:
          * 1. journey tests at start of each milestone — Playwright tests simulating user flow, fail before impl, pass after
          * 2. journey review every 3-4 napkins — human uses app for 10 min, finds breaks early
    * last third of the nepic was fixing what the first two thirds broke
  * session lifecycle complexity
    * every feature touched the session status code
    * edge cases multiplied: what if SQLite says X but filesystem says Y?
    * the appIsClosing flag exists because we had to prevent one system from corrupting another
    * this complexity is a symptom — the architecture is fighting itself
    * // this is too emotional and vague, you should be more specific when saying such things; how appIsClosing implies architecture fighting? i think you're just being handwavy
    * //AN: specific: appIsClosing exists because:
      * pty onExit fires for ALL pty deaths — app closing AND agent dying
      * without flag: clean quit marks every session 'exited'
      * on next launch: resume finds nothing
      * flag is legitimate — distinguishes cause of process death
      * I was wrong to frame as "architecture fighting" — it's a real requirement
      * // edge cases are fine if we're having clear model on how they should work
      * //AN: agreed — issue wasn't edge cases, was no clear model upfront
        * discovered rules by hitting bugs
      * // and then effectively they are not edge-cases
      * // app restart is main workflow, agents exiting are main workflow, etc etc
        * // how they are edge cases?
        * //AN: they're not — I was wrong
          * we designed for steady state (app running, agents working)
          * treated restart/exit as afterthoughts
          * but restart and exit ARE the product

* the core mistake
  * treated a single-user desktop app like a distributed system
    * // i don't think that this is the core mistake
    * // it's not the complexity that kills, it's unmodeled implied incidental complexity that kills
    * //AN: agreed, restating:
      * core mistake: implementing before explicitly modeling state rules
      * had data ownership principles (scratch/41) but not state transition rules
      * never wrote: "here are all (app state × agent state) combinations"
      * discovered rules empirically by hitting bugs
      * // things restarting and exiting are core to our problem, not incidental
      * //AN: correct — restart and exit are first-class concerns
  * two sources of truth (SQLite + filesystem) that need synchronizing
    * // what were principles that we were using for reconciliation and merge, can you recall please?
    * //AN: from scratch/41:
      * P1: filesystem defines what exists (structure + content)
      * P2: SQLite annotates what exists (statuses, UUIDs, timestamps)
      * P3: reconciliation additive, never destructive
      * P4: "what exists?" → filesystem. "what's the status?" → SQLite
      * P5: filesystem changes can't corrupt SQLite. SQLite loss can't corrupt filesystem.
      * // why it was hard and unobvious for agents to write code in such a way, that it actually restarts agents when i stop and start the app?
        * // orphaned state, what is that? really unobvious; 
        * // some terminals and ssessions lost;
        * // some duplication (sessions with same names); 
        * // it looks as restart is causing a lllooot of unplanned for churn
          * // not designed for: "so what happens when we restart this thing?"
    * // if we write those explicitly, was it some flaws in principles?
    * //AN: principles sound for READS
      * flaw: don't address WRITES
      * every write touches both systems
      * principles say how to READ, not how to WRITE
    * // or was it absense of principles?
    * //AN: absence of WRITE principles — we had read principles
    * // let's try and write them out explicitly now and analyze what was it that we followed
    * //AN: done in 72 (exercise 2) — each write operation traced with failure modes
  * complex startup: read db → reconcile with fs → resume sessions → handle orphans
  * the whole thing is fragile because any step in the chain can fail silently
    * // ?? what exactly do you mean by this?
    * //AN: specific example:
      * startup: initDatabase → reconcile → loadUiState → resumeArchitect → startWatcher → createWindow
      * if reconcile finds 0 napkins (wrong path, dir doesn't exist)
        * everything downstream renders empty sidebar
        * no error, no crash — just blank
      * "silently" = failure mode is "nothing appears" not "error tells you what's wrong"
      * fix: explicit guards at each step
        * "no napkins found + no architect → something is wrong, surface it"

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
