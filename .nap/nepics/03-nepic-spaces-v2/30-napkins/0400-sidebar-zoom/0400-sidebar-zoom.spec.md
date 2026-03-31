## 0400 — sidebar zoom levels + filesystem watcher + debug panel tabs: spec

This spec gives you direction and constraints. Before writing any code, thoroughly study the v3 codebase (`packages/v3/src/` and `packages/v3/tests/`), the v2 NapkinBrowser component, and the designer's screenshots.

### Context

The sidebar currently shows collapsed cards (name, dots, phase). This napkin adds focused and extended zoom levels, wires the filesystem watcher in the Electron app, and extends the debug panel with tabs.

### Three zoom levels

**Collapsed** (refine what exists):
- Fix dot colors: status-based, not role-based. Green=#22c55e running (pulsing 2s ease-in-out), blue=#3b82f6 done, amber=#f59e0b nap, gray=#6b7280 exited (hollow).
- Click card → focused. Click agent dot → switch terminal.

**Focused** (new):
- Card expands in place. No modal, no separate view.
- Napkin focused: file entries (detect `<slug>.nap.md` as main, render first) + agent entries with dots/role/status. Click agent → terminal switches. Click file → `shell.openPath`.
- Architect focused: top-level contents of home dir. prompt.md, onboarding/, scratch/ as entries. One level deep — dirs show as collapsed entries.
- Rest of sidebar visible below the expanded card.

**Extended** (new):
- Cmd+E toggles focused ↔ extended.
- Full file tree, all nesting levels.
- Files with hover controls: ⎘ (copy path) + ↗ (open in editor).
- [terminal] virtual entry for agents with live sessions — click to switch.
- NO [diff] — cut from this version.

### What to port from v2

Study these files thoroughly — they have the exact rendering logic and styles:

- `packages/v2/src/renderer/components/NapkinBrowser.tsx`:
  - `FileRow` component (lines 126-206) — hover controls, copy path, open in editor
  - `NapkinCard` focused/extended body (lines 358-549) — artifacts, agents, [terminal]
  - `ArchitectCard` focused/extended body (lines 241-356) — home dir file tree
  - `deriveNapkinCards` function (lines 76-122) — study the logic, rewrite for v3 model shapes
  - `StatusDot` component (lines 210-237) — dot rendering with hollow/pulsing states
- Copy inline styles verbatim. See napkin's design tokens.

### Filesystem watcher in app

The model already handles watching (proven in 0150 with `startWatching`, debounce, write-then-watch suppression). Wire it in `main.ts`:

1. After model loads, call `model.startWatching(nepicDir)` with `NodeFileSystem`
2. Model's `onChange` already pushes snapshots through the bridge
3. When agent writes a file → watcher fires → model re-reads → snapshot pushed → sidebar updates

The `NodeFileSystem.watch()` implementation needs to wrap `fs.watch` with the same interface that `MemoryFileSystem.watch()` uses in tests. Check if `NodeFileSystem` already has `watch()` — if not, add it.

### Debug panel tabs

Keep current styling (raw JSON, color-coded, monospace, draggable width). Add:

1. **Collapse toggle** — button in panel header. Collapsed = just a thin bar. Remember state in ui-state.json.
2. **Three tabs:**
   - **Model** — current JSON view (what exists now)
   - **Filesystem** — the raw dir/file tree as JSON (what the watcher reads from disk)
   - **Events** — live log of watcher change events (append-only, most recent at top)
3. Tab selection remembered across restarts.

### Keyboard shortcuts

- Cmd+E — toggle focused ↔ extended on selected card
- Cmd+K — show/hide filter bar, focus input
- Cmd+B — toggle sidebar visibility
- Cmd+D — toggle debug panel (new)

### Model/bridge changes

The `AppSnapshot` may need to include file tree data for focused/extended views. Currently it pushes `NapkinState[]` with `agents: AgentState[]` but no file entries. Options:
1. Expand `NapkinState` to include file entries (like v2's `NapkinEntry` with `entries[]`)
2. Separate channel for file data (pushed by watcher)

Recommendation: option 1 — expand the snapshot. The model already reads the filesystem; include file entries in the napkin/architect state. The bridge pushes it all. Renderer just renders what it receives.

### What NOT to do

- Don't add [diff] — cut from this version (wishlist)
- Don't add kanban or gutter — that's 0500
- Don't redesign the debug panel styling — extend it
- Don't break existing tests
