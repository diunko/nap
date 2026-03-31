* 0400 — sidebar zoom levels + filesystem watcher + debug panel tabs

* three zoom levels, one visual grammar
  * collapsed → focused → extended
  * same `*` bullets, same monospace, same dark theme at every level
  * architect and napkin cards: same component, different data
  * Cmd+E toggles focused ↔ extended on the selected card
  * Cmd+K filter bar at top of sidebar
  * Cmd+B sidebar toggle

* collapsed (what we have now — refine)
  * one line per card: `* name    ●●◌   phase`
  * dot colors by STATUS not role
    * green (#22c55e) = running, pulsing animation
    * blue (#3b82f6) = done
    * amber (#f59e0b) = nap
    * gray (#6b7280) = exited, hollow
  * click card → focused view
  * click agent dot → switch to that terminal

* focused — napkin card
  * card expands in place, no modal
  * artifacts as file entries
    * detect <slug>.nap.md as the main napkin file — render first/prominent
    * spec.md, test.md, journeys.md
    * click → open in editor (shell.openPath)
  * agents as entries with dots + role + status label
    * click agent → terminal switches to it
  * the rest of the sidebar stays visible below — density holds

* focused — architect card
  * same pattern as napkin focused: top-level contents of home dir
  * prompt.md, onboarding/, scratch/ as entries
  * one level deep — dirs show as collapsed entries
  * click file → open in editor
  * no dashboard, no project state — that's the kanban (0500)

* extended — both card types
  * full file tree, all levels deep
  * files with hover controls: ⎘ (copy path) + ↗ (open in editor)
  * dirs expand to show contents
  * [terminal] virtual entry for agents with live sessions — click to switch
  * NO [diff] — cut from this version (wishlist: worktrees)
  * reference: designer screenshots 02 (focused), 03 (extended), 01a (architect extended)

* filesystem watcher wired in app
  * model already handles watching (proven in 0150)
  * wire in main.ts: start watcher after model loads, feed changes to model
  * model re-reads marker files on change → pushes snapshot → sidebar updates live
  * when agent writes response.md → file appears in extended view immediately
  * when status changes via CLI → phase label updates in sidebar
  * debounce at 200ms (same as 0150)

* debug panel tabs
  * keep current styling — raw JSON, color-coded, monospace
  * add collapse toggle (button or Cmd+D)
  * add three tabs:
    * model state — current JSON view (what we have now)
    * filesystem state — what the watcher reads, dir/file tree as JSON
    * watcher events — live log of filesystem change events
  * if model and filesystem disagree → bug visible immediately
  * remember collapsed/expanded state across restarts (ui-state.json)

* what to port from v2
  * NapkinBrowser.tsx focused/extended rendering — packages/v2/src/renderer/components/NapkinBrowser.tsx
    * FileRow component with hover controls (lines 126-206)
    * NapkinCard focused/extended body (lines 426-549)
    * ArchitectCard focused/extended body (lines 310-356)
    * deriveNapkinCards, deriveArchitects functions — study but rewrite for v3 model shapes
  * copy styles verbatim — design tokens from v2

* testing
  * small tests (vitest):
    * model emits change on watcher event → bridge delivers updated snapshot
    * expanded card data derivation: correct files, correct nesting, correct agents
  * medium tests (Playwright):
    * click napkin card → focused view shows artifacts + agents
    * Cmd+E → extended view shows file tree
    * agent writes file → file appears in extended view (watcher integration)
    * Cmd+K → filter bar appears, typing filters cards
    * Cmd+B → sidebar toggles

* done criteria
  * three zoom levels work: collapsed → focused (click) → extended (Cmd+E)
  * napkin focused shows artifacts + agents with dots
  * architect focused shows top-level home dir contents
  * extended shows full file tree with hover controls
  * [terminal] entries clickable — switch to agent terminal
  * dot colors by status, pulsing on running
  * Cmd+K filter, Cmd+B toggle
  * filesystem watcher wired — live updates in sidebar
  * debug panel: collapse toggle + three tabs
  * all existing tests still pass
