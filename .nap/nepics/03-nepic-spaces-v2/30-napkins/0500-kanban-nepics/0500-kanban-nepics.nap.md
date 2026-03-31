* 0500 — kanban overlay + gutter + nepic switching

* the kanban quake console (Cmd+`)
  * overlay slides down from the top — terminal stays underneath
  * the board is a HUD, not a replacement
  * five columns: BACKLOG, TODO, DOING, REVIEW, DONE
  * cards show: napkin slug, agent dots, napkin bullets when expanded
  * collapsed by default — distribution across columns IS the information
  * click card name → expand to show napkin bullets + artifact badges
  * → button on each card → navigate to that napkin
    * board slides away
    * sidebar scrolls to card, blue flash
    * terminal switches to best agent (running > done > exited)
  * reference: designer screenshot 04, voiceover section "04 — kanban quake console"

* the gutter (left column, 60px)
  * nepic switcher — vertical column of icons
  * each nepic shows as a letter/icon derived from slug
  * active nepic highlighted with white bar
  * (+) at the bottom — where the next nepic would be
    * click → creates new nepic (nap3 create nepic)
    * scaffolds dirs + architect stub
    * switches to new nepic
  * reference: designer screenshot 01, voiceover "left gutter"

* nepic switching
  * click nepic in gutter → model swaps context
  * model loads different nepic dir → pushes new snapshot
  * sidebar shows that nepic's napkins + architects
  * terminal stays on current agent (or switches to new architect)
  * watcher restarts for new nepic dir
  * ui-state.json updated with new activeNepicId

* what to port from v2
  * Gutter.tsx — packages/v2/src/renderer/components/Gutter.tsx
    * slug → display letter extraction
    * click handler for nepic switching
    * (+) button
    * copy styles verbatim
  * KanbanOverlay.tsx — packages/v2/src/renderer/components/KanbanOverlay.tsx
    * five columns layout
    * card expansion with napkin bullets
    * → navigation button
    * Cmd+` keybinding (with fallback for macOS conflict)
    * copy styles verbatim
  * nepic switching logic — packages/v2/src/main/main.ts (nepic:switch handler)
    * adapt for v3 model: model.loadFromFilesystem(newNepicDir)

* model changes needed
  * model holds list of all nepics (read from .nap/nepics/ dir listing)
  * model.switchNepic(slug) → reload from different nepic dir
  * model.createNepic(slug, name) → scaffold dirs + architect stub (already exists from 0210)
  * AppSnapshot gains: nepics list, activeNepicId

* testing
  * small tests (vitest):
    * model.switchNepic loads different nepic, pushes new snapshot
    * kanban data derivation: napkins grouped by status with correct counts
    * nepic creation: dirs scaffolded, architect stub created
  * medium tests (Playwright):
    * Cmd+` → kanban overlay appears with correct columns
    * click → on kanban card → sidebar navigates to napkin
    * click nepic in gutter → sidebar shows different nepic's napkins
    * (+) button → new nepic created, switched to it

* done criteria
  * Cmd+` opens kanban overlay with five columns
  * napkin cards in kanban show dots + phase
  * expand card → see napkin bullets
  * → navigates to napkin (sidebar focus + terminal switch)
  * gutter shows nepic icons
  * click nepic → switches context (sidebar, watcher, model)
  * (+) creates new nepic with architect stub
  * all existing tests still pass
