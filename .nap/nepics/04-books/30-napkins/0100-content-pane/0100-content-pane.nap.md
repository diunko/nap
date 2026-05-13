# 0100 — three-pane layout + left content pane

* three-column layout: nav | left content | right content
  * left = .nap files (napkins, chapters, specs, scratch) in Monaco
  * right = agent terminals in xterm (existing, relocated)
  * both panes always visible, empty pane shows placeholder
  * resize handles between columns

* routing rules
  * standalone file: src/renderer/routing-rules.ts
  * pure function: (click context) → { pane: 'left' | 'right', surface: 'monaco' | 'terminal' }
  * .nap file clicked in nav → left pane, Monaco
  * agent dot clicked in nav → right pane, terminal
  * everything else → right pane
  * two path roots: .nap/ for content files, project root for code (0200)

* left pane (Monaco)
  * ephemeral — one file at a time, no tabs
  * napkin-markdown monarch tokenizer
    * headings, bullets, bold, inline code — standard markdown tokens
  * config: word wrap, no minimap, no line numbers, no autocomplete, dark theme
  * read-write
  * file watching: fs.watch open file → update Monaco model, debounce 200ms

* right pane (terminal)
  * existing xterm, moved from current main area
  * all features preserved: scrollback, follow, links, permission modal, successor prompt
  * ephemeral — one terminal at a time

* nav changes
  * file click → left pane (was: shell.openPath to OS editor)
  * agent dot click → right pane (was: sets activeTerminalId in same slot)

* not in scope
  * tabs, link routing, code display, // interaction, git, history
