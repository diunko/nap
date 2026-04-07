* 0650 — permission auto-approval via CC hooks

* the problem
  * agents get stuck on "Do you want to proceed?" for harmless commands
  * piped read-only commands (cat | grep) trigger confirmation even if both are allowed
  * human has to click through every agent's terminal to approve obvious things
  * blocks the pipeline, wastes human attention

* the solution: PermissionRequest hook
  * CC has a built-in hook: fires BEFORE the permission dialog shows
  * hook can return: allow (skip dialog), deny (block), or pass through (show dialog)
  * no pty keystroke hacking needed — CC's own system handles it
  * reference: scratch/permissions/00-cc-hooks.nap.md

* what to build
  * a hook script: .nap/hooks/approve-safe-commands.sh (or .js)
    * receives JSON on stdin: { tool_name, tool_input: { command } }
    * parses the command
    * decides: safe → allow, dangerous → pass through, never auto-deny
  * project-level config: .claude/settings.json with PermissionRequest hook

* approval logic — conservative first, learn over time
  * always allow (read-only, no side effects):
    * cat, head, tail, less, wc, grep, rg, find, ls, tree
    * piped combinations of the above
    * npm run test:*, npm run build:*, npm run typecheck:*
    * git status, git diff, git log, git show, git blame
  * always pass through (ask human):
    * rm, mv (destructive)
    * git push, git reset, git checkout -- (destructive git)
    * commands with redirects writing to files (>)
    * anything outside project directory
    * curl, wget (network)
  * gray area (pass through for now, learn later):
    * mkdir, touch (creates but not destructive)
    * npm install (modifies node_modules)
    * git add, git commit (modifies repo)
    * compound commands with &&

* nap3 init should set this up
  * add to the init flow: create .claude/settings.json with the hook configured
  * copy the approval script to .nap/hooks/
  * agents get auto-approval from the start

* also: nap3 poke --raw <name> <text>
  * for cases where you DO need to send a keystroke
  * writes directly to pty, no three-step delivery
  * bypass the message queue entirely
  * useful for: manual approval when hooks aren't set up, testing

* testing
  * small: parse command → correct allow/pass-through decision
  * medium: launch app, agent runs a piped read command → no permission dialog shown
  * medium: agent runs rm → permission dialog still shows

* done criteria
  * hook script approves read-only commands, passes through destructive ones
  * .claude/settings.json configured by nap3 init
  * agents can run cat | grep without human clicking through
  * dangerous commands still require human approval
  * nap3 poke --raw works as fallback
