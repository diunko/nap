# nav tree

* what it shows now
  * agents (with status badges, role)
  * their files (prompt.md, response.md, scratch/, etc)
  * napkins (with phase: doing, done)
  * flat-ish display of .nap filesystem

* what needs to change
  * not a flat file tree — a contextual navigator
  * what you're doing shapes what you see

* possible modes (or just smart defaults)
  * napkin focused
    * napkin at top, its files underneath
    * agents belonging to this napkin, nested
    * other napkins collapsed
  * book focused
    * book chapters in order (01, 02, 03...)
      * // need to include mini-book into examples into this dir
      * // so that nap.app agents can see what the mini-book is
    * _research underneath or hidden
    * related napkin/agent as secondary
  * agent focused (what you have now)
    * agent terminal, all files
    * scratch, response, prompt visible
      * // currently cmd-e switches between "extended" mode
        * // (all files in agent dir are shown)
        * // and just agent name (clicking shows terminal)

* how mode switches
  * click a napkin → napkin mode
  * click a book dir → book mode
  * click an agent → agent mode
  * or: just highlight/expand what you clicked, collapse others
  * no explicit mode toggle — navigation IS the mode
  * // yeah, right, you're getting it
    * // but it's a bit more subtle
    * // htere are global agents (architect, guardian)
    * // napkins: extended shows all files and agents of a napkin
  * // this is better TBD from nap.app context, given current layout and inputs
    * // will need a sep thinking session i guess

* the tree as overview
  * napkins at top level (0100, 0200, 0210...)
  * expand a napkin → its files + agents
  * expand an agent → its files
    * // should be not too complex
    * // fs tree antipattern is that there are too many levels to fold-unfold
      * // so it's unpractical to do that effectively in ui
        * // weak workarounds: cmd-k search etc
        * // but that makes it very confusing
        * // need clear information architecture
          * // as clear as possible at least =)
          * // keep it for nap.app agents
  * books → chapters in order
  * architects/scratch → working docs

* badges and status
  * keep what works: colored dots, phase labels (doing/done)
  * add: unread indicator? (file changed since last opened)
  * agent running → animated dot (already there)
