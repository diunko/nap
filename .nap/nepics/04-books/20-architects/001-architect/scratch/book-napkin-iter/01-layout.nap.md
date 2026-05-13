# layout — three columns

* three columns, left to right
  * nav (narrow, ~200px, collapsible)
  * content (wide, flexible)
  * code (wide, flexible, collapsible)

* nav column
  * what you have now: entity tree, agent badges, napkin phases
  * clicking a file here → opens in content pane
  * clicking a code file → opens in code pane
  * always visible (unless explicitly collapsed)

* content column
  * chapters, napkins, specs, responses, scratch
  * monaco instance, markdown language mode
  * styled markdown (see 03-markdown-styling)
  * tabs along top
  * this is where you read and comment

* code column
  * source code from the repo
  * monaco instance, auto-detect language
  * tabs along top
  * opens when a file:line link is clicked in content
  * stays on last file when content tab changes
  * collapsible — if no code open, content takes full width

* resize behavior
  * drag handles between columns
  * double-click handle → collapse/expand
  * content + code split roughly 50/50 when both open
  * content takes full width when code collapsed

* current state → target state
  * now: nav + terminal (two columns)
  * target: nav + content + code (three columns)
  * terminal output moves to code column (or a panel within it)
  * content column is the new thing
