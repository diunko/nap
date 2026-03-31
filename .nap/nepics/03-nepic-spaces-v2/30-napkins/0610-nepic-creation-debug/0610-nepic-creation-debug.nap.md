* 0610 — nepic creation flow: trace + debug
  * the (+) button in the gutter should create a new nepic and switch to it
  * the journey: click (+) → name input → dirs scaffolded → architect boots → fresh space
  * multiple bugs found during manual testing

* bug 1: creating new nepic marks old architect as done
  * problem: after creating nepic 02-ttt, the 01-v1 architect shows done=true, running=false
  * expected: old architect should stay as-is (running or whatever it was)
  * creating a new version should NOT affect the previous version
  * the old nepic should remain workable, switchable to and from

* bug 2: ENOTDIR on watcher after nepic creation
  * error: `ENOTDIR: not a directory, watch '/Users/.../ui-state.json/30-napkins'`
  * the watcher is treating ui-state.json as a nepic dir
  * probably: model.switchNepic or model.getNepics reads the nepics/ dir listing
    * and ui-state.json is in the nepics/ parent dir (.nap/)
    * or: nepicDir is being resolved wrong after creation

* bug 3: terminals don't activate on click after restart (old nepic)
  * problem: after close/reopen, clicking agents in the old nepic shows blank terminal with blinking cursor
  * no terminal content, no session — just empty black
  * BUT: exited agents DO activate on click (on-demand resume works)
  * so the issue is specifically with running/done agents that were resumed on startup
    * their ptys may be running but the xterm isn't connected to them?
    * or: the pty data isn't being routed to the right xterm instance?
  * this may be related to nepic switching — are ptys for the old nepic being killed when switching?

* bug 4: previous version should be fully workable
  * expected: switch back to old nepic → see all agents, click them, see their terminals
  * this is the designer's vision: "the previous nepics are right there"
  * switching nepics should swap the sidebar view, NOT kill old ptys
  * all ptys across all nepics should stay alive simultaneously
    * (or at minimum: resume on demand when switching back)

* improvement: debug panel should overlay, not resize terminal
  * problem: toggling debug panel pushes terminal width, triggers resize events, looks junky
  * fix: position debug panel absolute/fixed on top of terminal area
  * terminal stays constant width — no resize events, no jank
  * debug panel floats over the right side of the terminal

* bug 5: watcher doesn't pick up architect marker changes
  * problem: editing .agent.nap.json for a napkin agent → status updates live (good!)
  * but: editing architect's .agent.nap.json → nothing changes until restart
  * the watcher probably only watches 30-napkins/ dir, not 20-architects/
  * fix: watcher should cover both 30-napkins/ and 20-architects/

* fix: rename "acting" → "lead" in Sidebar.tsx
  * one-line change — display string only, no model/marker changes
  * "lead" = the architect whose terminal is default when switching to this nepic

* bug 6: architect not auto-started on app open
  * all agents with started=true + not exited should auto-resume
  * architect should not be treated differently from other agents
  * if architect is not resuming: check if computeResumeActions handles architects correctly
  * same three cases (A/B/C) apply to architects

* bug 7: new nepic's architect dir has no prompt.md
  * problem: (+) creates nepic with architect stub (.agent.nap.json) but no prompt.md
  * architect boots and has nothing to read
  * createNepic should copy prompt.md from templates (same as nap3 init does)
