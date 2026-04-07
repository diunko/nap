* permissions hook — user stories

* story 1: agent runs harmless pipe, guardian auto-approves
  * agent runs `cat package.json | grep test`
  * CC fires PermissionRequest → hook hangs
  * model sets pendingApproval → agent dot blinks
  * guardian gets poked: "fs-eng wants Bash: cat package.json | grep test"
  * guardian reads prompt.md, judges: read-only pipe, aligned with task
  * guardian runs `nap3 permission-response --agent <id> --decision allow`
  * hook unblocks → CC runs the command
  * agent dot stops blinking
  * total time: ~2-3 seconds, no human involved

* story 2: agent runs something suspicious, guardian escalates
  * agent runs `rm -rf node_modules`
  * guardian gets poked, reads prompt.md
  * guardian is unsure: "this is destructive, prompt says 'build a component' not 'clean up'"
  * guardian asks human in its terminal: "002-fs-eng wants to rm -rf node_modules. approve?"
  * guardian's dot shows waiting for input
  * human clicks into guardian, reads question, types "yes that's fine, they need to reinstall"
  * guardian: "understood, approving. I'll remember rm -rf node_modules is ok for fs-eng."
  * guardian writes to learned-policies.md
  * guardian runs `nap3 permission-response --agent <id> --decision allow`
  * agent unblocks

* story 3: human resolves via modal
  * agent runs something, hook hangs, dot blinks
  * guardian is not running (or not set up)
  * human notices blinking dot, clicks into that agent's terminal
  * modal shows: tool=Bash, command=npm install, approve/deny buttons
  * human clicks approve → intent sent to main → hook unblocks
  * modal disappears, dot stops blinking

* story 4: human dismisses modal, CC takes over
  * modal shows but human switches to a different terminal
  * hook keeps hanging
  * after 10 min timeout, hook exits with pass-through
  * CC shows its own "Do you want to proceed?" dialog
  * human approves in CC's UI directly

* story 5: multiple agents pending simultaneously
  * three agents all hit permission prompts at once
  * three dots blinking in sidebar
  * guardian receives three pokes in sequence
  * guardian processes them: "fs-eng npm install → allow, test-eng git push → escalate, test-arch grep → allow"
  * resolves two immediately, escalates one to human
  * human resolves the third

* story 6: project setup with guardian
  * human runs `nap3 init --guardian`
  * .claude/settings.json created with PermissionRequest hook
  * guardian agent stub created in 20-architects/002-guardian/
  * human runs `nap3 open`
  * guardian starts alongside architect
  * from now on, permission requests route through guardian
