# implement approved design (mock-e)

* what: build the extension side panel to match mock-e exactly
  * mock-e is the approved design — the implementation target
  * the current side-panel.html is a throwaway prototype — don't patch it, replace it
  * start from mock-e's HTML/CSS, wire Monaco + wterm + LightningFS into it

* the design to implement
  * mock: `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html`
  * screenshot (side by side with GitHub): `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e-screenshot.png`
  * design spec (every decision documented): `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/design-spec.nap.md`

* layout: `[editor/terminal] [resize-handle] [nav]`
  * editor on left (fills remaining width) — the reading surface
  * nav on right (240px default, draggable 180–600px)
  * single resize handle on nav's left edge, gray hover (#6d7a8a), 4px
  * header bar: napkin name + [fetch latest] + settings gear + nav toggle

* nav tree — port of nap.app's Sidebar.tsx card system
  * `*` is the structural element, not triangles
  * card system: collapsed header → focused (body with files + agents) → extended
  * agents flattened to same indent as files (agents/ dir skipped)
  * agent dots: color = role, shape = status (filled/dashed-check/hollow)
  * file rows: `*` bullet + name, .md in link color, main file bold
  * "show all" toggle for other napkins
  * focused card: blue left border accent (#2563eb, 3px)

* tab bar — port of nap.app's TabBar.tsx
  * ephemeral tabs (italic, single-click reuses)
  * permanent tabs (double-click or edit)
  * close on hover, active tab bg
  * Terminal tab always present

* editor surface — Monaco with napkin-markdown tokenizer
  * links always underlined + colored (not just on hover)
  * token colors from design spec (headings, bullets, //, //DU:, //A:, code blocks)
  * word wrap, no minimap, no line numbers

* terminal — dark theme (bash-poc colors)
  * bg #1e1e1e, fg #e5e5e5, prompt green #22c55e
  * NOT light theme — the current light terminal is wrong
  * whole content area goes dark when terminal tab active

* what carries over from take1
  * Monaco boots in extension CSP — proven, keep the worker config
  * LightningFS shared instance — proven architecture
  * fs-adapter, git-command, shell — working code, keep as-is
  * content.ts (trigger button, nav messages) — keep
  * background.ts (sidePanel.open handler) — keep
  * auto-save, refresh-on-focus — keep
  * link routing (routeLink, buildGitHubUrl, navigateGitHubTab) — keep
  * settings overlay — keep (move into the design's layout)
  * nav tree parser (parseNavTree pure function) — keep logic, replace rendering

* what gets replaced
  * side-panel.html — replace entirely with mock-e's layout + CSS
  * nav tree rendering — replace flat list with card system
  * tab bar — replace simple toggle with TabBar.tsx-style
  * terminal theme — replace light with dark
  * wterm CSS variables — replace lightBlue palette with bash-poc dark palette
