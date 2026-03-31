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
* research needed: how to send "yes" to the CC permission prompt
  * the prompt is "Do you want to proceed? 1. Yes 2. No"
  * it's an Ink TUI rendered in the terminal — not a simple stdin readline
  * options to research:
    * send "1" + Enter via pty write?
    * send specific control codes that Ink's input handler recognizes?
    * CC might use raw mode — arrow keys + Enter to select
    * need to test: what keystrokes does CC actually accept for this prompt?
    * the poke mechanism (text → Escape → CR) works for CC's main input
      * does it work for the permission prompt too? or is that a different input mode?
  * this is a prerequisite — without reliable "click yes", the IT agent can't function

## nap3 rename napkin

* `nap3 rename napkin <old-slug> <new-slug>`
* problem: typos in napkin names can't be fixed (e.g. voice transcription errors)
* what gets renamed/updated:
  * directory: 30-napkins/<old>/ → 30-napkins/<new>/
  * <slug>.nap.md, <slug>.spec.md, <slug>.test.md, <slug>.journeys.md
  * every .agent.nap.json in agents/: update `napkin` field
  * .napkin.nap.json: update slug field if present
* what does NOT change:
  * agent UUIDs, agent dir names, CC session UUIDs, git history
* CLI command only — no UI needed

## nap3 migrate — project structure fixer

* `nap3 migrate` — inspects existing .nap/ project, transforms to current workflow version
* runs WITHOUT the app — launches a Claude session in bare terminal
* the agent:
  * reads a canonical workflow spec (the latest 00-org/ docs)
  * inspects the existing .nap/ structure — what's there, what's missing, what's outdated
  * figures out what version/form the project is in (v1 sqlite, v2 markers, old dir layout, etc.)
  * transforms: moves dirs, creates missing marker files, migrates sqlite → markers, scaffolds missing structure
  * reports what it did
* use cases:
  * old project with SQLite → migrate to marker files
  * project with old dir layout (40-board/ symlinks) → remove, status in markers
  * project missing 00-org/ updates → copy latest from templates
  * app version upgraded, workflow docs changed → agent updates project to match
* needs: a canonical "project structure spec" document
  * describes exactly where everything should be and why
  * the agent reads this as its source of truth
  * when the app evolves, update the spec → agent handles the migration
* `nap3 init --migrate` — same command, different mode
  * no .nap/ → normal init
  * .nap/ exists → migrate mode
* first version: just a well-crafted prompt that launches Claude with the right context
  * no special infrastructure needed — it's a Claude session with file access
  * `nap3 init --migrate` = `claude --verbose "read .nap/00-org/30-structure.nap.md and inspect this project..."`
