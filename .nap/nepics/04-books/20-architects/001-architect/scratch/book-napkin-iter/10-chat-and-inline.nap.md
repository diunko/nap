# chat and inline — co-existing modes

* two ways to talk to an agent
  * inline: // comments in the napkin/chapter file
  * chat: agent terminal (what exists now)
  * both are useful, neither replaces the other

* when inline
  * reacting to a specific bullet
  * threading a design discussion
  * the comment IS anchored to the idea
  * works for: napkin iteration, book review, spec feedback

* when chat
  * broader questions ("what's the overall approach?")
  * commands ("run the tests", "commit this")
  * back-and-forth that doesn't belong in the document
  * works for: directing work, asking questions, debugging

* the layout when both are active
  * napkin in left-content pane
  * agent chat/terminal in right-content pane (where code usually goes)
  * or: code pane shows terminal output instead of source
  * the toggle: are you reading code or watching an agent work?

* which agent owns this file?
  * file inside agent dir → that agent
  * napkin file → the napkin's agents (could be multiple)
  * book chapter → the agent who wrote it (or the architect)
  * scratch file → the architect
  * simple mental model: look at the path
    * agents/001-fs-eng-foo/ → 001-fs-eng-foo
    * 30-napkins/0100-test-infra/ → architect or pick from napkin's agents

* multi-agent on same file
  * mini-book: chapter-researcher writes _research, chapter-writer writes chapter
  * napkin: architect writes, fs-eng comments, test-arch comments
  * each uses their prefix (//A:, //FS:, //TA:)
  * who gets poked on cmd-enter?
    * default: the agent whose prefix you're continuing
      * you type //FS: → cmd-enter → poke fs-eng
    * override: dropdown or status bar showing current target agent
  * collab guardrails
    * agents take turns (one writes at a time)
    * each agent's turn = a git commit
    * if two agents try to edit simultaneously → queue (nap3 poke queues)
    * nap already handles this — agents are sequential per terminal
