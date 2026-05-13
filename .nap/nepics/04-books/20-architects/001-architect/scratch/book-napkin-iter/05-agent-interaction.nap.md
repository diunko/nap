# agent interaction

* three key bindings in content pane

* shift-enter: continue your comment
  * you're on a line with `* //DU: some thought`
  * shift-enter → new line, same indent, same prefix
    * `* //DU: ` pre-filled, cursor after it
  * if previous line was `* //` (no role prefix)
    * new line gets `* //`
  * preserves nesting depth
  * just a typing convenience — no agent involvement

* cmd-enter: send to agent
  * saves the file
    * // maybe commits to git
    * // we should be displaying diffs from agent edits
      * // can do state tracking just using git
      * // might be using amend, too
        * // is it just like that save amends latest commit?
          * // should have some way to kinda open new commit to amend
          * // or other pattern managing which commits go to git?
  * determines which agent to poke
    * file is inside an agent dir → poke that agent
    * file is a napkin or scratch → poke the architect? or let user pick?
    * // right; should be a kinda separate pattern-matching / rules file
      * // that is real easy to modify
      * // this will be tricky, so have to be able to tweak easily to try out what works
      * // think what are inputs and outputs
        * // -> should point to which agent (uuid? name?)
    * could: last-poked agent as default, dropdown to switch
  * nap3 poke <agent> "read <filepath> and respond to inline comments"
  * agent reads, adds //A: responses, saves
    * // each agent has their 1-2-letter signature
      * // based on role is fine
  * file watcher picks up changes → monaco model updates

* //PREFIX: → agent routing hints
  * //DU: → human (Dima), no routing
  * //A: → architect
  * //FS: → fs-eng (which one? the one in the napkin's agent dir)
  * //TA: → test-arch
  * //TE: → test-eng
  * these are conventions, not enforced routing
  * cmd-enter uses file location (agent dir) not prefix for routing
  * prefix is visual + contextual (who said this)

* the loop
  * human types // comment inline
  * shift-enter to continue across lines
  * cmd-enter to send
  * agent reads file, adds //A: responses at the right indent
  * UI updates (file watcher)
  * human reads, types more //
  * repeat
  * // both inline and chat often co-exist
    * // sometimes message goes to chat
    * // sometimes goes as a bunch of inline comments
    * // ideally, most often, you see both napkin + chat side-by-side
      * // napkin in left-content, chat in right-content
      * // nuance: mini-book has each chapter linked to same agent
      * // simple mental model to which agent this thing belongs?
        * // also collab guardrails? (agents commenting on same taking turns, each state in git)

* what nap3 poke actually sends
  * option A: just the file path
    * "read /path/to/napkin.nap.md and respond to inline // comments"
    * agent figures out context from the file
  * option B: file path + line range
    * "read /path/to/napkin.nap.md lines 42-55 and respond"
    * more focused, less context
  * start with A — simpler, agent sees full context
