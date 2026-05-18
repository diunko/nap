# extension side panel — design spec

* what: adapt nap.app's nav+map for Chrome extension side panel
  * not a redesign — a port with context-specific adaptations
  * the app already solved the hard problems (density, hierarchy, scanning)
  * the extension adapts for: right-side placement, no gutter, review context

* the hierarchy (from nap.app)
  * nepics (gutter) | nav (sidebar) | map (editor) | territory (terminal/code)
  * extension keeps: nav + map
  * extension drops: gutter (single nepic from URL), territory pane (GitHub IS the territory)
  * extension adds: terminal as a tab (escape hatch, not primary surface)

* layout
  * `[editor/terminal]  [resize-handle]  [nav]`
  * editor on left (fills remaining width) — this is the map, the reading surface
  * nav on right (240px default, draggable 180–600px) — Chrome side panel constraint
  * no gutter — extension enters via URL with napkin already specified
  * terminal lives as a tab in the editor area, not a separate pane

* nav tree — faithful port of Sidebar.tsx
  * the `*` bullet is the structural element
    * dimmed color (--nap-text-muted, #6d7a8a)
    * 10px wide, centered — consistent across files, dirs, agent entries
    * agents replace `*` with colored dots (the key visual innovation)
  * card system (not expand/collapse triangles)
    * collapsed: header only — `* slug [dots] status`
    * focused: header + body (files + agents)
    * extended: header + body + agent files + [terminal] entries
    * click header → toggle focused
  * agents at same indent level as files
    * `agents/` directory is NOT shown — agents are flattened up one level
    * reduces indent depth, saves horizontal space
    * agent row: `[dot] name/ status` where dot encodes role+status
  * file rows
    * main file (e.g. 0100-delivery-pipeline.nap.md): bold, --nap-text color
    * .md files: --nap-link color (#1e50c0)
    * dirs: --nap-text-secondary color, name ends with `/`
  * "show all" toggle at bottom reveals other napkins (collapsed by default)

* agent dots — from dot-style.ts
  * two dimensions in one element (Tufte principle)
    * COLOR = role (encodes pipeline position)
      * test-arch: #f59e0b (orange)
      * fs-eng: #22c55e (green)
      * test-eng: #6b7280 (gray)
      * architect: #3b82f6 (blue)
      * guardian: #a855f7 (purple)
    * SHAPE = status
      * filled circle: running or waiting
      * dashed border + checkmark SVG: done
      * hollow circle: exited or archived
  * dots appear in two places
    * napkin card header: small dots summarizing all agents
    * agent rows in card body: larger dot replacing the `*` bullet

* focused card accent — the border-left decision
  * in app: border-left on sidebar (far side from content, between gutter and sidebar)
  * in extension: border-left on nav (between editor and nav)
  * kept border-left because:
    * border-right gets lost against screen edge (no breathing room)
    * border-left has visual context (editor content on the other side)
  * `border-left: 3px solid var(--nap-accent)` (#2563eb)
  * padding: `0 12px 0 9px` (9px left accounts for the 3px border)

* resize handle — the "blue vs gray" resolution
  * single handle: `#nav-drag` on nav's left edge
  * problem discovered: if handle hovers blue (same as accent), it merges with focused card accent
  * solution: handle hovers `var(--nap-text-muted)` (#6d7a8a) — gray = structural, blue = semantic
  * handle width: 4px (1px wider than 3px accent — different enough to read as separate element)
  * principle: blue = semantic (selection, focus, meaning). gray = structural (chrome, handles, affordances)

* tab bar — from TabBar.tsx
  * editor tab + terminal tab (minimum)
  * ephemeral vs permanent distinction
    * single-click in nav → ephemeral tab (italic, reuses slot)
    * double-click or edit → permanent tab (normal font, own slot)
  * styling matches app exactly
    * active tab: --nap-bg background, --nap-text color
    * inactive tab: transparent bg, --nap-text-muted color
    * close button: hidden by default, appears on hover
    * tab height: 32px, font-size: 12px, max-width: 180px
    * border-right between tabs: 1px solid --nap-border

* editor surface — simulates Monaco with napkin-markdown tokenizer
  * font: 14px Menlo/Monaco/Consolas (matches ContentPane.tsx:194)
  * word wrap on, no line numbers, no minimap
  * padding: 12px top/bottom, 16px left/right
  * token colors from themes.ts lightBlue:
    * headings: #1a1a2e, bold
    * bullet markers: #7a8a9a (dimmed)
    * bold markers: #7a8a9a (dimmed), content bold
    * inline code: #a0522d on #e0e8f0 bg
    * code blocks: full-line #e0e8f0 bg
    * // comments: #16a34a (green)
    * //DU: comments: #16a34a (green, known prefix)
    * //A: comments: #2563eb (blue, known prefix)
    * //TA: comments: #d97706 (orange, known prefix)
    * links: #1e50c0, underlined
    * link brackets/urls: dimmed --nap-text-dim
    * list markers (-, 1.): dimmed #7a8a9a

* terminal surface
  * dark theme from bash-poc: bg #1e1e1e, fg #e5e5e5
  * prompt: #22c55e (green)
  * accessed via Terminal tab — whole content area goes dark
  * this is the escape hatch, not the primary surface
  * use case: git status, git log, git commit at end of review

* header bar
  * 32px height, --nap-bg-secondary background
  * left: napkin name (bold, --nap-text)
  * right: [fetch latest] button, settings gear, nav toggle hamburger
  * minimal — most chrome weight is in the tab bar, not the header

* theme — lightBlue from themes.ts
  * bg: #f0f4f8
  * bg-secondary: #e6eaee (nav, tab bar, header)
  * bg-tertiary: #dce0e4 (focused card bg)
  * bg-hover: #e1e5e9
  * border: #c4cad0
  * text: #2e3440
  * text-secondary: #4c566a
  * text-muted: #6d7a8a
  * text-dim: #94a0b0
  * accent: #2563eb
  * link: #1e50c0

* what's different from the app (and why)
  * nav on right (Chrome constraint, not choice)
  * no gutter (extension has one nepic context from URL)
  * no kanban overlay (extension is for reading, not project management)
  * no side-by-side editor+terminal (extension is narrower — tabs instead)
  * no Cmd+E toggle in mock (interactive only — real implementation should have it)
  * resize handle color: gray not blue (avoids clash with accent in right-side context)

* what's the same as the app (intentionally)
  * every CSS variable name and value
  * card structure, indent levels (16px, 32px), gap (6px)
  * AgentDot rendering (filled/dashed-check/hollow, role colors, SVG checkmark)
  * FileRow structure (* bullet + name + optional controls)
  * TabBar styling (italic ephemeral, active bg, close on hover)
  * font stack, sizes, line heights
  * the `*` as THE structural element throughout
