# nap.app reader — three-pane layout + Monaco

* the shift
  * today: nav + terminal (two columns, terminal-centric)
  * target: nav + left content + right content (three columns)
  * left = thinking surface (.nap files: napkins, chapters, specs, scratch)
  * right = working surface (agent terminals, source code)
  * reading flow: left to right — read the napkin, glance right to see the agent or the code

* layout
  * nav stays what it is (sidebar, entity tree, agent dots, phases)
  * left content pane: Monaco, markdown mode, .nap files
  * right content pane: terminals (xterm, existing) + code (Monaco, later)
  * resize handles between all three columns
  * both panes always visible (fixed layout, no collapse)
  * empty pane shows placeholder — not hidden

* routing rules
  * standalone .ts file, easy to customize
  * inputs: what was clicked (nav item, link), file path, file extension
  * outputs: which pane (left or right), what to show (monaco or terminal)
  * file path resolution: two roots
    * .nap files resolved relative to .nap/ directory
    * code files (0200) resolved relative to project root (parent of .nap/)
  * rules for 0100
    * nav click on .nap file (.nap.md, .spec.md, .stories.md, .test.md, .md inside .nap/) → left pane, Monaco
    * nav click on agent dot → right pane, terminal
    * everything else → right pane
  * rules added in 0200
    * file:line link clicked in left pane → right pane, Monaco (code, read-only)
    * .md link clicked in left pane → left pane, replaces current
    * https:// link → default browser

* pane behavior (0100)
  * both panes are ephemeral — one surface at a time, no tabs
  * click a .nap file → left shows it, previous .nap file gone
  * click an agent → right shows terminal, previous terminal gone
  * terminal can never be pinned — always yields to next click
  * tabs come later if reading workflow demands it (flipping between chapters)

* Monaco content pane (left)
  * custom monarch tokenizer: "napkin-markdown" language
    * `# heading` → bold, brighter
    * `* bullet` → `*` dimmed, content default
    * `**bold**` → bold, markers dimmed
    * `` `code` `` → background tint
    * `//` comment → muted gray-blue
    * `//A:` → architect color (blue, matches agent badge)
    * `//DU:` → user color (green)
    * `//FS:` → fs-eng color
    * `//TA:` → test-arch color
    * `//TE:` → test-eng color
    * prefix token colored, rest of line inherits
  * config
    * word wrap on, minimap off, line numbers off
    * monospace font (napkin format designed for monospace)
    * dark theme matching nap.app
    * read-write (editing napkins directly)
    * no autocomplete
  * file watching
    * fs.watch on the open file (node side)
    * on change → read file, update Monaco model
    * debounce 200ms
    * cursor preservation: simple approach (save offset, restore after update)
      * good enough — turn-based, not collaborative

* right pane (0100)
  * terminal: existing xterm, relocated from current main area
  * same pty wiring, same data flow, same resize observer
  * all terminal features preserved (scrollback, follow mode, links, permission modal, successor prompt)
  * code display added in 0200 (Monaco, read-only, auto-detect language)

* nav changes (0100)
  * clicking a file entry → opens in left pane (was: shell.openPath to OS editor)
  * clicking an agent dot → opens terminal in right pane (was: sets activeTerminalId)
  * the sidebar becomes a router: file → left, agent → right
  * extended view file entries: click opens in left pane, copy/open-external controls stay

* what doesn't change (0100)
  * sidebar structure, card types, kanban, gutter, debug panel
  * agent lifecycle, pty spawning, socket protocol
  * model.ts, socket-handler.ts, coordinators.ts — untouched
  * the .nap filesystem structure, marker files, watcher

---

## 0100 — left content pane + three-pane layout

* what ships
  * three-column layout: nav | left (Monaco) | right (terminal)
  * routing rules file (.ts) determining what opens where
  * clicking .nap files in sidebar → Monaco in left pane
  * napkin-markdown monarch tokenizer with // prefix styling
  * file watching → Monaco model updates on disk change
  * terminal relocated to right pane, all features preserved
  * resize handles between columns

* the hard parts
  * Monaco bundle size (~5MB) — need to configure webpack/vite to handle workers
  * monarch tokenizer for napkin-specific constructs (// prefixes with role colors)
  * reparenting xterm DOM (already solved — Terminal.tsx does this today)
  * file watching for open Monaco files (model.ts watches dirs, need per-file)

* what's NOT in 0100
  * tabs (neither pane)
  * code display in right pane (terminal only)
  * link routing (file:line → right pane)
  * // agent interaction (cmd-enter, shift-enter)
  * git integration
  * history (back/forward)

---

## 0200 — link routing + code in right pane

* what ships
  * Monaco in right pane for source code (alongside terminal)
  * link provider in left pane classifies links
    * file:line → right pane, Monaco, scroll to line, highlight
    * .md relative link → left pane, replace current
    * https:// → default browser
  * right pane now mixed: terminal OR code, still ephemeral
  * code display: read-only, auto-detect language, line highlight on nav

* the hard parts
  * link classification — disambiguating file:line from .md links from URLs
    * existing file-link-provider.ts has the regex, extend it
  * line highlight on navigation (flash/fade the target line)
  * two Monaco instances (left and right) — shared vs separate workers

* what's NOT in 0200
  * tabs
  * // agent interaction
  * git integration
  * routing rules file (config) — still hardcoded, extract when patterns settle
