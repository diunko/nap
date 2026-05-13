# git integration — state management

* git as the undo/versioning layer
  * every file edit = real file on disk
  * git tracks what changed, when, by whom (human vs agent)
  * no custom undo stack — git IS the undo stack
    * // maybe natural and more simple integration for kinda undo or smth else

* the "working commit" pattern
  * auto-save writes to disk continuously
  * cmd-s = amend the current working commit
    * captures a named checkpoint without cluttering history
  * when is a commit "closed"?
    * after cmd-enter (sent to agent) → close current, agent opens new
    * after explicit user action (some keybinding? or just automatic)
    * or: agent response = new commit, user edits = amend on top
  * mental model: each turn in the conversation is a commit
    * human edits → working commit
    * cmd-enter → commit closes, agent starts
    * agent edits → agent's commit
    * human reads, edits more → new working commit

* showing diffs from agent edits
  * agent poked → agent edits file → saves
  * diff = unstaged changes since last commit
  * monaco has a built-in diff editor (monaco.editor.createDiffEditor)
  * could show inline (gutter decorations, like GH) or side-by-side
  * inline gutter is probably better for napkins (don't want two panes of bullets)
  * toggle: show/hide diff decorations

* what gets committed
  * .nap files only (napkins, scratch, books, agent output)
  * NOT code repo files (those have their own git)
  * .nap is already a separate repo — this is just auto-committing to it
    * // yeah, maybe adopt this is a pattern
    * // some repos use .nap as part of main history
    * // guess then edits only for .nap files

* branch per conversation?
  * // nope
  * probably overkill for now
  * just linear commits on current branch
  * agent turn = commit, human turn = amend
    * // agent turn => just save files, so commits are visible
  * revert = git revert or reset
