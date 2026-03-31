* sidebar zoom — what we learned vs what we planned

* what the mega napkin said
  * three zoom levels, one visual grammar
  * collapsed → focused → extended
  * same `*` bullets at every level
  * architect and napkin cards treated uniformly

* what we actually built + used
  * collapsed cards work — name, dots, phase label
  * no focused/extended yet
  * debug panel emerged — live model state as color-coded JSON
    * human used it, found it valuable
    * not in any plan — born from debugging
    * preserve and improve, don't destroy

* what the bug bash revealed
  * architect card is special
    * not just another agent — it's the single pane of glass
    * designer said: "you don't scan ten terminals, you read the architect's latest output"
  * when you click architect, you want project state
    * all napkins with statuses
    * all agents with statuses
    * which running, which done, which need attention
    * it's a dashboard, not a file browser

* architect card vs napkin card — different when expanded
  * collapsed: identical (one line, dots, label) — same visual language
  * focused: different purpose
    * architect focused → project dashboard
      * napkin list with phase + agent count
      * running agents highlighted
      * which agents need attention
      * the debug panel data, but polished
    * napkin focused → artifacts + agents
      * nap.md, spec.md, test.md as file entries
      * agent entries with dots + role
      * clickable — click agent → terminal switches
  * extended: both show full file trees
    * architect extended → onboarding/, scratch/, prompt.md
    * napkin extended → [terminal], [diff], prompt.md, response.md, hover controls

* filesystem watcher ties in
  * without extended view → nothing to show when files change
  * watcher + extended view = live file updates visible
  * watcher already proven at model level (0150)
  * just needs wiring in main.ts + UI to display it

* does this change future plans?
  * 0400 scope grows slightly — architect dashboard is new
  * but model already has everything needed
    * getAllAgentsTree(), getStatus(), napkin statuses
    * bridge pushes complete snapshots
  * purely a renderer concern — how to render expanded states
  * 0500 (kanban + gutter) unchanged
  * debug panel pattern → evolves into architect dashboard
    * same data, better presentation

* what carries from v2 design
  * screenshot 02: focused napkin card with artifacts + agents
  * screenshot 03: extended view with [terminal], file entries, hover controls
  * screenshot 01a: architect extended with onboarding/, scratch/ directories
  * voiceover: "three card states, one visual language, bullets all the way down"

* riskiest UI bet
  * architect dashboard in focused view
    * new concept — not in designer's screenshots
    * designer showed architect extended as file tree (01a)
    * dashboard is our addition based on real usage
  * does the debug panel feeling survive polish?
    * raw JSON is useful because it's complete
    * polished dashboard might lose information density
    * maybe: polished by default, "raw" toggle for power users
