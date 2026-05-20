# focus mode — one card or everything

* two nav modes, one toggle
  * focus mode: one card visible (napkin or architect), everything else hidden
  * show-all mode: full nav — architects on top, separator, napkins below (same as app)
  * toggle between them: button in header + Ctrl+Shift+F shortcut

* focus mode (default on first open)
  * URL specifies napkin → that napkin expanded, nothing else visible
  * clean, distraction-free — reviewer reads what the author intended
  * the card fills the nav — all its files, agents, subdirectories visible

* show-all mode
  * architects section at top (expandable cards, same pattern as napkins)
  * separator
  * napkins in natural order (numeric sort)
  * click any card to expand/collapse
  * exactly like the app's sidebar

* switching between modes
  * focus → show-all: click focus icon in header (or Ctrl+Shift+F)
    * nav expands to show everything, focused card stays expanded
  * show-all → focus: click focus icon (or Ctrl+Shift+F)
    * whatever card is currently expanded becomes the focused card
    * everything else disappears
  * the toggle always knows which card you're on

* focus follows clicks
  * URL napkin is the entry point — expanded on first load
  * after that, the user navigates freely
  * in show-all mode: click 0200 → 0200 expands, 0100 collapses
  * switch to focus → only 0200 visible
  * focus is not pinned to the URL — it follows the last expanded card
  * works for napkins and architects equally

* header layout
  * `[napkin-name]  [fetch latest]  [refresh PR]  [focus toggle]  [settings]  [nav toggle]`
  * focus toggle icon: changes appearance based on mode
    * focus mode: icon suggests "expand" (show more)
    * show-all mode: icon suggests "collapse" (focus in)
  * nav toggle (hamburger): hides/shows the entire nav panel

* store state
  * `focusMode: boolean` — true = focus, false = show-all
  * `focusedCardSlug: string | null` — whichever card is expanded
  * both persisted (Zustand persist)
  * on first load: focusMode = true, focusedCardSlug from URL napkin path

* card states — binary, same for napkins and architects
  * collapsed: header only — `* name [dots] status`
  * expanded: full tree, unlimited depth — all files, subdirectories, agents
  * one click toggles. no focused/extended split in the extension (yet).
  * the app has three tiers (collapsed/focused/extended via maxDepth) — we can add that later

* architects in the nav
  * parsed by nav-tree.ts (already handles 20-architects/)
  * rendered as cards: same pattern as napkins — `*` + name + dot + status label
  * expanded: prompt.md, scratch/ with contents, response.md, whatever exists
  * architect dot: role color (blue), status shape (filled/dashed-check/hollow)
  * in show-all mode: above napkins with separator
  * in focus mode: only visible if the architect card is the focused one

* what changes
  * Sidebar.tsx: render architects section, focus/show-all filtering
  * store.ts: add focusMode to state + actions (toggleFocusMode)
  * index.tsx / HeaderBar: focus toggle button + Ctrl+Shift+F shortcut
  * remove "show others" / "hide others" toggle at bottom of nav (replaced by header button)

* what doesn't change
  * card expand/collapse behavior (expandCard action)
  * nav tree parser (already produces architect sections)
  * file click → editor (same openDoc flow)
  * terminal, editor, link routing — unaffected
