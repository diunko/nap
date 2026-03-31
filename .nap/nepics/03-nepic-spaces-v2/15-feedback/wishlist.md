# Wishlist

Ideas with energy.

## [diff] view + worktrees

* scoped git diff per agent — see what they changed
* [diff] virtual entry in extended napkin view
* click → shows file-level diff of agent's work
* requires worktree support — agents work in isolated branches
  * agent gets own worktree on start
  * diff is worktree vs parent branch
  * merge back on completion
* visual: inline diff viewer in the app, or open in editor
* depends on: extended view (0400), worktree infrastructure
* reference: designer's screenshot 03 shows [diff] as an entry

## napkin versioning + iteration

* napkins need inline comments + version iteration
* versions as prefixed numbers (01, 02, 03 — like Nova's reflection napkins 70, 72, 73)
* canonical napkin stays clean — agents read it as input
* old versions with comments preserved for history
* maybe: scratch/ dir per napkin for iterations
* or: git history is the version history (simpler, less visible)
* tension: want comments persistent but not confusing for agents
* depends on: clear workflow convention for when to version
