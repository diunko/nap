## 0500 — kanban overlay + gutter + nepic switching: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study the v3 codebase, the v2 Gutter and KanbanOverlay components, and the designer's screenshots.

### Context

This is the final napkin of nepic 03. The sidebar with three zoom levels is done (0400). This adds the kanban quake console (Cmd+`), the left gutter for nepic switching, and the (+) button for creating new nepics. After this, the designer's screenshots are a live product.

### Kanban quake console (Cmd+`)

Overlay that slides down from the top. The terminal stays underneath — the board is a HUD, not a replacement.

Port from `packages/v2/src/renderer/components/KanbanOverlay.tsx`. Copy styles verbatim.

**Layout**: five columns: BACKLOG, TODO, DOING, REVIEW, DONE. Each column header shows the count.

**Cards**: each napkin appears as a card in its status column.
- Collapsed by default: slug + agent dots
- Click card name → expand to show napkin bullets (from `.nap.md`) + artifact badges
- → button on each card → navigate:
  - Board slides away
  - Sidebar scrolls to that napkin card, blue flash highlight
  - Terminal switches to the "best" agent (priority: running > done > exited)

**Data**: the model already has napkin statuses and agents. The kanban just renders them grouped by status. No new model methods needed — derive from the snapshot.

**Keybinding**: Cmd+` via Electron menu accelerator. Also add a fallback `window.addEventListener('keydown')` for when macOS system shortcut conflicts (same pattern as v2 — see `packages/v2/src/renderer/index.tsx` lines 157-164).

### Gutter (left column, 60px)

Port from `packages/v2/src/renderer/components/Gutter.tsx`. Copy styles verbatim.

**Layout**: vertical column left of the sidebar. Each nepic is a clickable icon/letter.

**Icon derivation**: extract a display letter from the nepic slug. E.g. `01-v1` → `V`, `02-spaces` → `S`. The v2 Gutter has this logic.

**Active indicator**: white left bar on the active nepic.

**(+) button**: at the bottom of the gutter. Click → prompts for nepic name (simple `window.prompt` or inline input) → calls `nap3 create nepic` via socket → model creates nepic → gutter updates → switches to new nepic.

### Nepic switching

Click nepic in gutter → model swaps context:
1. `model.switchNepic(slug)` — loads different nepic dir, re-reads markers, rebuilds state
2. Watcher restarts for new nepic dir
3. Bridge pushes new snapshot → sidebar shows new napkin's napkins + architects
4. `ui-state.json` updated with new `activeNepicId`

The model needs:
- `switchNepic(slug: string)` method — re-runs `loadFromFilesystem` for the new nepic dir
- Nepic list in the snapshot (so gutter knows what to render)
- `AppSnapshot.nepics: NepicInfo[]` with `{ id, slug, name }`

### What to port from v2

Study these files:
- `packages/v2/src/renderer/components/Gutter.tsx` (194 lines) — icon derivation, click handler, (+) button, styles
- `packages/v2/src/renderer/components/KanbanOverlay.tsx` — five columns, card expansion, → navigation, Cmd+` toggle
- `packages/v2/src/renderer/index.tsx` lines 152-164 — Cmd+` fallback keydown handler
- `packages/v2/src/main/main.ts` lines 606-626 — nepic:switch IPC handler (adapt for model)

Copy inline styles verbatim. The designer's screenshot 04 is the reference for the kanban. Screenshot 01 shows the gutter.

### Design carry-over

All visual styles from v2. Exact color tokens:
- Gutter background: #1e1e1e (same as terminal)
- Gutter active bar: white (#ffffff) left border
- Kanban overlay: semi-transparent dark background
- Kanban columns: same card styling as sidebar
- (+) button: subtle, not prominent

### Bridge/store changes

- `AppSnapshot` gains `nepics: NepicInfo[]`
- Store gains: `kanbanVisible`, `toggleKanban()`, `nepics`, `switchNepic(id)`
- `switchNepic` in store: sends intent through bridge → main switches model → new snapshot pushed

### What NOT to do

- Don't redesign the kanban or gutter — copy v2's visual design
- Don't add nepic management beyond create + switch (no rename, delete, reorder)
- Don't break existing tests
- Don't change the debug panel or sidebar zoom — those are done (0400)
