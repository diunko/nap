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

## IT agent — learning approval system

* an agent that monitors other agents' permission prompts
* auto-approves obviously safe commands (read-only pipes, grep, wc, test runners)
* learns from human decisions — builds a project-specific policy over time
  * "you approved `cat | grep` three times → auto-approve read-only pipes"
  * policy file lives in the project (.nap/approval-policy or similar)
* gray areas: escalate to human, learn from the decision
  * errs on the safe side — if unsure, ask
  * over time, fewer escalations as policy grows
* never auto-approves: rm, git push, writes outside project, destructive operations
* needs infrastructure:
  * detect "Do you want to proceed?" state in agent terminal output
  * send approval keystroke to that terminal (poke mechanism)
  * read the command being requested from the prompt text
* could use Claude Code hooks as the trigger mechanism
  * hook fires on tool use → pokes the IT agent → IT agent responds
* the IT agent has context: reads each agent's prompt.md, knows what they're supposed to do
  * can judge "is this command reasonable for a test engineer?" vs "why is a test-eng running git push?"
