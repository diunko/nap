# response — 001-fs-eng-design-impl

## status: paused (stashed, not built yet)

User asked me to stop after research/planning phase and run the proper pipeline. All work is in `git stash@{0}`.

## what's done

### research (complete)
- read all org docs (promise, workflow, structure, role)
- read all project context (app-ux, du-thoughts, design-spec, workflow, mock-e screenshot)
- read mock-e.html (the design target) — every line, every CSS rule
- read all existing extension source: side-panel.ts (873 lines), nav-tree.ts, theme.ts, link-routing.ts, fs-adapter.ts, git-command.ts, shell.ts, napkin-markdown.ts, content.ts, background.ts
- read all tests: nav-tree.test.ts, link-routing.test.ts, theme.test.ts, ux-e2e.spec.ts + fixtures.ts
- read v3 desktop app: Sidebar.tsx (746 lines), TabBar.tsx (98 lines), dot-style.ts (60 lines), ContentPane.tsx (678 lines), themes.ts (280 lines)
- read bash-poc dark terminal palette

### stashed changes
- `fixtures/.nap/` — moved content into `nepics/01-v1/` wrapper (matches prod layout)
- `fixtures/README.md` — updated to reflect new structure
- `packages/extension/side-panel.html` — replaced entirely with mock-e layout + CSS
  - layout flipped: `[editor/terminal] [resize-handle] [nav]`
  - header bar with napkin name, fetch latest, settings gear, nav toggle
  - tab bar from mock-e (ephemeral italic support, close on hover)
  - nav sidebar on right (240px, drag handle on left edge, gray hover)
  - card system CSS (napkin-card, focused accent, card-header/body, file-row, dir-row, agent-row)
  - agent dot CSS (filled/hollow/dashed with SVG checkmark)
  - terminal dark theme from bash-poc (bg #1e1e1e, not the old light theme)
  - settings overlay, notification bar (kept from prototype)

## what's NOT done (the actual build)

### architecture decision (agreed with user)
Decompose side-panel.ts into modules instead of one monolithic file:

1. **`dot-style.ts`** (new) — pure `getDotStyle({ role, running, done, exited, archived }) → { color, shape }`
   - ported from v3's `packages/v3/src/shared/dot-style.ts`
   - role → color mapping, status → shape mapping
   - archived/exited override role color to gray

2. **`nav-renderer.ts`** (new) — card system DOM rendering
   - takes NavNode[] from existing parseNavTree, returns DOM elements
   - napkin cards: collapsed/focused/extended states
   - agent dots using dot-style.ts
   - file rows: is-link (.md), is-main (.nap.md), dir (/)
   - agents flattened (skip agents/ dir, hoist children up one level)
   - show-all toggle for other napkins
   - ~250 lines estimated

3. **`tab-manager.ts`** (new) — ephemeral/permanent tab lifecycle
   - Tab interface: { id, path, ephemeral, type }
   - single-click → ephemeral (italic, reuses slot)
   - double-click or edit → permanent (normal font, own slot)
   - close on hover, terminal tab always present
   - emits callbacks for side-panel.ts to wire
   - ~120 lines estimated

4. **`side-panel.ts`** — slimmed to orchestration
   - Monaco + terminal setup (proven, keep as-is)
   - wires nav-renderer → openFile
   - wires tab-manager → switchTab
   - resize handle, settings, auth, auto-save, link provider (keep)

### key design adaptations from v3 → extension (must get right)
- layout flipped (nav right, editor left) — CSS done in stash
- no gutter — "show all" toggle replaces it
- terminal always dark (#1e1e1e) — not theme-dependent like v3
- resize handle hovers gray (#6d7a8a) not blue — avoids merge with focused card accent
- agents flattened in renderer (parser keeps agents/ section, renderer hoists)
- `*` is THE structural element — no triangles anywhere
- Cmd+E for focused↔extended toggle (not in mock but design spec says implement it)

### e2e test updates needed
- ux-e2e.spec.ts selectors need updating:
  - `#settings-btn` — still exists (same id)
  - `.tab[data-tab="editor"]` — still works
  - `#nav-tree` — still exists
  - `.nav-entry.expandable` → will become `.napkin-card .card-header` (card system)
  - `.nav-file` → will become `.file-row .fname` (new class names)

## questions for architect
none — design is clear, architecture is agreed with user
