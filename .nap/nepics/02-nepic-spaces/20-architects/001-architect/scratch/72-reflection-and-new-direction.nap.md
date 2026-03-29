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
      * // yeah, this might be the right way;
        * // although having kinda faked ptys would make it more lightweight;
        * // though maybe for v2 of nepics let's at least have this?
          * // and maybe from there we can think of more efficient fast tests
          * // running tests in 5 workers is already fast enough
    * "napkin cards appear in sidebar" =
      * `page.evaluate(() => store.getState().napkins.length > 0)`
    * tests verify the COMPOSITION, not the components
      * // yeah, this does sound right for me;
      * // TA putting those tests together, basically, cover a lot of "big" scenarios that are just skipped now
        * // i mean, small, med, big in SDET terms

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
    * // this feels right; i also think we should have kind of technical version of journey for that napkin
      * // should we call it user story? or stories?
      * // so that tech person, referring to UX journey, decomposes the journey into smaller stories
        * // stories map to particular components interacting
        * // and then TA writes the suggested test sequence, 
        * // with hints at what components are interacting, 
          * // what kind of things to expect, what kind of observations we can do on what components

  * what about before first implementation?
    * TA writes journey test specs as .test.md (as now)
      * // need smth about writing up tech stories corresponding to particular ux journey
      * // who should be doing this? new role? one of existing? (TA?)
    * TE implements them — they FAIL (nothing built yet)
    * FS-eng builds — journey tests start PASSING
    * the test is the acceptance criteria
    * no different from current flow — just the test SCOPE changes (journey vs component)


* exercise 2: the 2-state model

  * insight from your comments: we modeled 4 statuses for what is fundamentally 2 states
    * // what 4 statuses are you talking about?
      * // is it 4 statuses of an agent? then it doesn't contradict to 2 status of the app
        * // or smth else?
        * // if yes, 
          * // it's rather we should be deriving agent statuses from what we need to manage agents
          * // and how their lifecycle maps to 2 system statuses
            * // e.g. if we namespace it by SYSTEM:AGENT, it could be:
              * // S_RUNNING:A_EXITED // this we don't resume
              * // S_RUNNING:A_RUNNING -(system stop)-> S_STOPPED:A_RUNNING
                * // and this one we should resume
              * // idk, it's just an example, with maybe flawed notation and assumptions
              * // but i mean, we should work on figuring out the right approach
                * // both simple and powerful

  * the two states
    * STOPPED — app not running. data on disk. nothing in memory.
    * RUNNING — app running. ptys alive. in-memory state exists.

  * the two transitions
    * s→r (start): read persistent state → create ephemeral state
    * r→s (stop): ephemeral state dies. persistent state unchanged.
      * // on stop, we might need to adjust what's stored in persistent
      * // or we might design persistent in such a way that it's always right point to resume from

  * what is persistent? (survives stop)
    * agent identity: who am I? (dir + marker file: .agent.nap.json)
      * // future idea: CC has session name managed with /rename, can we also leverage it?
        * // when I say (future idea), don't have to dig into this too deep now, keep as idea
      * cc_session_uuid — for resume
      * role — architect, test-arch, fs-eng, test-eng
      * name — display name
      * created_at
      * // is it ok to keep implicit the following? 
        * // what napkin it belongs to: by just the dir location
        * // what additional metadata needs to be stored, if we want it explicit
          * // in agent meta json?
    * napkin identity: what feature? (dir + .napkin.nap.json or similar)
      * status — backlog, todo, doing, review, done
        * // yeah, this def should be stored, so it's persistent
    * nepic identity: what era? (dir structure)
      * // is it only from dir structure?
        * // it's more ok, as this is permanent (decided once on napkin creation)
    * artifacts: napkin files, specs, prompts, responses (already filesystem)
      * // what gets to open view vs expanded?
        * // maybe that's more UI layer, that gets to decide?
        * // then, how do we represent this in a way that on FE/UI component, 
          * // so that it's easy to change and manage on UI component?
          * // idk, smth like `<LinkChip napkin.smth.smth />`
            * // or smth like `napkin.agents.map(a=><AgentStatusIndicator {a}/>)`
    * UI state: which nepic was active, which terminal focused, sidebar visible
      * could be: state.json at nepic level, or meta file in .nap/

  * what is ephemeral? (dies on stop)
    * PIDs — which processes are alive // agree
    * pty objects — the actual terminal processes // agree
    * xterm instances — the renderer terminal objects // agree
    * which agents are "running" vs "idle" — this is runtime, not persistent
      * // agree for now; once everything is restored and has it's terminal,
        * // i can just go and manually say "pls continue" in each
        * // for now that's fine
          * // as long as we restore all napkins and terminals in right geometry
            * // (i mean statuses, order, child-parent, etc)
    * zustand store state — rebuilt from persistent layer on s→r
      * // is there anything persistent in sqlite?
    * socket server — recreated on start // agree

  * the s→r transition (app starts)
    * // okay, now this is the meat, let's follow it carefully!
    * walk filesystem: find nepics, napkins, agents by marker files
      * // sg; we build runtime model
        * // question: on running app, how do we keep model and fs aligned?
    * read each marker file → get UUIDs, roles, statuses
    * for each agent with UUID → spawn `claude --verbose --resume <uuid>`
    * build in-memory model: zustand store, pty map
      * // question about model<->fs<->(sqlite? if we have one)
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
      * // i guess also should really carefully trace each api method and implied transition
        * // and implied state change; and make sure it makes sense both in runtime and in stopped state
      * persistent layer (marker files) preserves what matters
      * s→r rebuilds in-memory truth from persistent layer

  * walking journeys through the 2-state model
    * J1: init → open → architect
      * `nap init`: creates dirs + marker files (all persistent, all filesystem)
      * `nap open`: s→r → read markers → find architect UUID → resume → terminal
        * // this implies that open treats differently agents that just inited (with nap init)
          * // and those that were started previously
          * // so the assumption that open doesn't handle non-started state doesn't hold
      * works? yes — no SQLite dependency, no reconciliation
        * // we should be very specific on field level in the stored state in these journeys;
        * // e.g. no uuids on start means what? we start fresh agent? 
          * // why it doesn't have uuid? bc of init or bc of crash at exit?
    * J4: close → reopen → everything there
      * // this is great draft start, i love structure, but we should go field-by-field
      * // across all stored / re-stored state
      * close: r→s → ptys die, in-memory dies, markers unchanged
        * // se should agree on notation. is it running->stopped? is it reopen->something? 
        * // this is system state. And what is agents/napkins state? also should have notation for that
      * reopen: s→r → read markers → resume all with UUIDs
        * // what about those without uuids? init can't put uuids right?
      * works? yes — markers untouched by stop
    * agent exits while running
      * in-memory: update store (gray dot)
      * persistent: write `exited: true` to marker
      * close + reopen: s→r → marker says exited → skip auto-resume
      * works? yes — one flag, one file write
    * switch nepics
      * in-memory: swap displayed data
      * persistent: save active nepic to state.json
        * // where? 
        * // where lead (we called it acting) architect is stored? 
          * // don't love acting, btw, better word? acting/retired kinda gets the point, 
          * // but need smth simpler maybe or more straightfoward (clear not from just mil connotation)
      * works? yes — just UI state, rebuilt on s→r
        * // need to think how this flows to ui
          * // guess we need to think how app model looks like
          * // should be discussing that too

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
        * // symlinks feel brittle;
          * // seem useful to navigate through editor;
          * // but when i'll be using board more i'm curious how much they'll be needed
          * // def not a source of truth;
          * // should be able to re-render symlinks based on smth else
    * UI state granularity: what goes in state.json?
      * // you mean this is global app state? 
      * active nepic, active terminal, sidebar visible — yes
      * scroll positions, expanded cards, filter text — maybe overkill
    * fs watcher + marker file writes: infinite loop?
      * app writes .agent.nap.json → watcher fires → update → loop?
        * // yeah, exactly! 
        * // what other cases? 
        * // esp ui updates        
        * // i'm a bit struggling to find real clear mental model here
          * // between agent uuids in files and walk->restore
            * // and fast update of ui-like fields (status, panel hidden, etc)
      * need: ignore own writes, or debounce, or separate mechanism
