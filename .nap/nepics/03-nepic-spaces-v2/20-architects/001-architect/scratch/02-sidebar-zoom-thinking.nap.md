* sidebar zoom — what we learned vs what we planned

* what the mega napkin said
  * three zoom levels, one visual grammar
  * collapsed → focused → extended
  * same `*` bullets at every level
  * architect and napkin cards treated uniformly
    * // and i agree with the first;
    * // architects "pinned" on top, slightly separated from all cards
    * //A: agreed — pinned + separated is already implemented, keep it

* what we actually built + used
  * collapsed cards work — name, dots, phase label
  * no focused/extended yet
  * debug panel emerged — live model state as color-coded JSON
    * // i think it should stay, but not get in the way of day-to-day;
      * // so have to have means to collapse it
    * //A: add collapse toggle (Cmd+D or button). remember state across restarts.
    * human used it, found it valuable
    * not in any plan — born from debugging
    * preserve and improve, don't destroy

* what the bug bash revealed
  * architect card is special
    * not just another agent — it's the single pane of glass
    * designer said: "you don't scan ten terminals, you read the architect's latest output"
    * // no, this would be to heavy and impractical;
    * // i don't want to corrupt architect's context with those convos
    * // at least, not for this version
    * //A: I was wrong here. architect's context is precious — don't waste it on status queries.
      * //A: the sidebar + kanban already show project state. architect should be left alone to work.
  * when you click architect, you want project state
    * // no i don't
      * // i want to see architect's artifacts (all files in scratch or research)
    * //A: correction accepted. architect focused = file browser (top-level contents of home dir).
      * //A: same pattern as napkin focused, just different files (scratch/, onboarding/, prompt.md).
    * all napkins with statuses
    * all agents with statuses
    * which running, which done, which need attention
    * it's a dashboard, not a file browser

* architect card vs napkin card — different when expanded
  * collapsed: identical (one line, dots, label) — same visual language
    * // ok
  * focused: different purpose
    * architect focused → project dashboard
      * // no, not a dashboard, definitely
      * // dashboard is kanban board
      * //A: agreed. dashboard = kanban (0500). architect focused = file browser.
      * napkin list with phase + agent count
      * running agents highlighted
      * which agents need attention
      * the debug panel data, but polished
      * // to be honest, i don't know what should we show
        * // on architect in focused mode
        * // expanded is clear
        * // focused idk
          * // we don't have nap.md for architect
      * //A: proposal — focused = top-level contents of architect home dir, one level deep
        * //A: prompt.md, onboarding/, scratch/ as entries
        * //A: same visual pattern as napkin focused (files + dirs)
        * //A: extended goes deeper into subdirs (all files)
    * napkin focused → artifacts + agents
      * nap.md, spec.md, test.md as file entries
        * // how do we know which file is main napkin.nap.md?
        * // maybe we should make that prominent in the workflow
        * //A: the convention is <slug>.nap.md — could detect and render first/bold
        * //A: but there's a deeper question here about napkin versioning:
          * //A: napkins need iteration — inline comments + new versions
          * //A: versions are prefixed numbers (70, 72, 73 — we used this with Nova)
          * //A: the current version should be clean input for agents
          * //A: old versions with comments should be preserved but not confusing
          * //A: maybe: scratch/ dir per napkin for iterations?
            * //A: 0100-feature/scratch/01-napkin.nap.md (first draft)
            * //A: 0100-feature/scratch/02-napkin.nap.md (with comments)
            * //A: 0100-feature/0100-feature.nap.md (canonical, clean)
          * //A: but this adds workflow complexity — maybe later edition
          * //A: for now: happy path = canonical napkin is clean, comments live in git history
      * agent entries with dots + role
      * clickable — click agent → terminal switches
  * extended: both show full file trees
    * architect extended → onboarding/, scratch/, prompt.md
    * napkin extended → [terminal], [diff], prompt.md, response.md, hover controls
      * // let's remove [diff] from the current version completely
      * // we'll get back to more controls and things here when
        * // when we'll work with worktrees
      * //A: agreed. [diff] cut. only [terminal] as virtual entry for now.

* filesystem watcher ties in
  * // should we umm add this to debug panel tab?
    * // raw data from fs watcher?
  * //A: yes — debug panel gets tabs:
    * //A: tab 1: model state (current JSON view, what we have now)
    * //A: tab 2: filesystem state (what the watcher reads — the raw dir/file tree as JSON)
    * //A: tab 3: watcher event log (live stream of change events — like a log tail)
    * //A: tab 1 = what the app thinks. tab 2 = what's on disk. tab 3 = what changed when.
    * //A: if tab 1 and tab 2 disagree, you see the bug immediately.
  * without extended view → nothing to show when files change
  * watcher + extended view = live file updates visible
  * watcher already proven at model level (0150)
  * just needs wiring in main.ts + UI to display it

* does this change future plans?
  * 0400 scope grows slightly — architect dashboard is new
    * //A: correction — architect is NOT a dashboard, it's a file browser.
    * //A: scope is actually simpler than I thought: same component for both, just different data.
  * but model already has everything needed
    * getAllAgentsTree(), getStatus(), napkin statuses
    * bridge pushes complete snapshots
  * purely a renderer concern — how to render expanded states
  * 0500 (kanban + gutter) unchanged
  * debug panel pattern → evolves into architect dashboard
    * same data, better presentation
    * //A: correction — debug panel stays as debug panel. gets tabs + collapse. doesn't become dashboard.

* what carries from v2 design
  * screenshot 02: focused napkin card with artifacts + agents
  * screenshot 03: extended view with [terminal], file entries, hover controls
  * screenshot 01a: architect extended with onboarding/, scratch/ directories
  * voiceover: "three card states, one visual language, bullets all the way down"

* riskiest UI bet
  * architect dashboard in focused view
    * //A: this risk is eliminated — no dashboard. just file browser. proven pattern.
    * new concept — not in designer's screenshots
    * designer showed architect extended as file tree (01a)
    * dashboard is our addition based on real usage
  * does the debug panel feeling survive polish?
    * // i like it how it is now; great work from the team, keep it up!
    * // no need to polish it more, just let's add controls and additional info
    * // we can run small brainstorming what goes there
    * // but for now i prefer to keep the styling
    * // and add somehow handy things i mentioned
    * //A: clear direction. keep styling. add: collapse toggle, three tabs (model/filesystem/events).
    * //A: no visual redesign. extend, don't replace.
    * raw JSON is useful because it's complete
    * polished dashboard might lose information density
    * maybe: polished by default, "raw" toggle for power users
