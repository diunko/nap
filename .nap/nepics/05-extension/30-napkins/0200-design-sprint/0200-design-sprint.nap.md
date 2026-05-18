# design sprint — extension side panel

* what: design the extension panel as a functioning HTML mock
  * like v2-unified.html (1117 lines, HTML+CSS+JS, interactive prototype)
  * not a wireframe — a thing you open in a browser and use
  * populate with real fixture content (space-pizza mini-book)

* why: take1 is a technical POC with placeholder UI
  * nav tree is a flat list of strings
  * no visual hierarchy, no reading experience
  * terminal has light theme (broken — should be dark)
  * layout doesn't match v0 scope (nav on wrong side, wrong proportions)
  * the reading experience IS the product — it needs design, not just plumbing

* the two contexts
  * nap.app: author/architect tool — manage agents, write napkins, run pipelines
  * extension: reviewer tool — read mini-books alongside GitHub PRs
  * different users, different jobs, shared visual language
  * extension adapts nap.app's design language for the reading context

* inputs for designer
  * fixture content: fixtures/{main,.nap}/ — space-pizza delivery API
    * 5-chapter mini-book with file:line links, // threads, code blocks
    * 3 agents, architect with scratch, 2 napkins with status labels
    * needs nepics/ restructure before sprint (trivial)
  * nap.app design mock: .nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-unified.html
  * nap.app light screenshot: .nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take1/session1/screenshots/nap-app.png
  * current extension state: .nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take1/session1/screenshots/extension-take1-state.png
  * workflow v2: .nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take2/workflow/02-workflow.nap.md
  * nap.app journeys (for design language): .nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/journeys.nap.md
  * nap.app designer prompt (for design sensibility): .nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/prompt.md

* constraints
  * side panel: ~500px wide at default, user can resize
  * layout: nav (right, collapsible ~120-150px) | content (left, fills rest)
  * content tabs: Editor (default) | Terminal (secondary, dark theme)
  * editor is the primary surface — reading a mini-book
  * terminal is the git tool — dark, dense, stays out of the way
  * lightBlue theme for editor + nav (bg #f0f4f8)
  * dark theme for terminal (bash-poc colors)
  * monospace throughout (Menlo/Monaco)

* deliverable
  * 4 diverse HTML mocks — different layout/styling approaches, same end goal
    * mock-a.html, mock-b.html, mock-c.html, mock-d.html
    * each self-contained (HTML+CSS+JS, open in browser)
    * each a different take on nav placement, density, chrome, reading feel
  * all interactive: tab switching, nav expand/collapse, link hover states
  * all populated with real space-pizza fixture content
  * save to: .nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/
