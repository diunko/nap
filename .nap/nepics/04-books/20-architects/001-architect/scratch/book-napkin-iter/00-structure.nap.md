# book-napkin-iter — what goes here

* this is the design space for nap.app reader/editor UX
  * lots of back and forth needed
  * keep it local, iterate fast

* proposed files
  * 01-layout.nap.md — three-column layout, sizing, collapse behavior
  * 02-monaco-config.nap.md — language modes, styling, what we customize vs use raw
  * 03-markdown-styling.nap.md — how to style markdown nodes in monaco
    * prefixes (//A:, //DU:, * , etc) → visual treatment
    * headers, bold, links — rendered inline or token-colored?
    * the napkin-format-specific styling decisions
  * 04-link-behavior.nap.md — file:line links, chapter links, external links
    * what opens where, how panes respond
  * 05-agent-interaction.nap.md — cmd-enter, shift-enter, // routing, poke integration
    * how //A: maps to agent terminal
    * who gets poked, how context is sent
    * shift-enter: continue writing at same indent + prefix (user, not agent)
  * 06-file-watching.nap.md — agent edits file, UI updates
    * debounce, cursor preservation, conflict with user edits
  * 07-nav-tree.nap.md — left column, how it changes from current
    * modes (book, napkin, agent), filtering
  * 08-tabs-and-history.nap.md — tab model for middle + right panes
    * per-pane history, back/forward

* each file: napkin-format, iterate with // threads
* numbered for reading order, not dependency order
