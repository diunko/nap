* 0650 — permissions: rethink from human's direction

* what the human said
  * communicate through nap — not a standalone shell script
  * model should have ephemeral "needs approval" status on the agent
    * not stored in marker file — ephemeral like running/done
    * visible in UI somehow — maybe red dot instead of role color?
  * judgment done by a dedicated agent, not a shell script allowlist
    * agent reads the requesting agent's prompt.md
    * decides: does this command align with the work described in the prompt?
    * driven by Sonnet model (cheaper, fast, good enough for judgment)
  * project-level role — like an architect but not an architect
    * separate role: "ops" or "guardian" or something
    * one per project, always running, receives all permission notifications
  * notification comes through a nap command
    * CC hook fires → calls nap CLI → nap routes to the guardian agent

* how it would work (architect's take)

  * the flow
    * agent runs a command → CC fires PermissionRequest hook
    * hook script calls: `nap3 approve-request --agent <id> --command <cmd> --tool <tool>`
      * // how do we know agent id? 
      * // tool and all the stuff goes on the input, right?
    * nap routes this to the guardian agent via socket
    * guardian agent receives the request in its terminal (poke or structured message)
      * // it's ok to poke with json payload
      * // i think poke should add [from: agent-id agent-name etc]
      * // should have override flag, e.g. human can poke any agent with flag override --no-from or smth
    * guardian reads the requesting agent's prompt.md from disk
      * // should pass agent's dir
      * // incoming message should read overall like this: 
        * // i'm fs-eng agent, working on task: path/to/prompt.md
        * // running this tool: {}
        * // no additional inptu from running agent; guardian should decide if that's an appropriate tool call based on initial taks prompt alone
    * guardian makes judgment: "fs-eng building a React component is running npm install — yes, that aligns"
    * guardian responds: allow or escalate to human
    * nap sends the decision back to the hook (which is blocking, waiting for response)
      * // while it's blocked, status shows (need input)
    * hook returns allow/deny/pass-through to CC
    * // there should be a way to go and see all agents needing permissions
      * // so i'm thinking maybe we use hook to notify about queued permission requests;
        * // but we always do fall-through
        * // and guardian agent goes around terminals, looks at requests, and approves/denies

  * the guardian agent
    * a new role: always-on, lightweight, Sonnet-powered
    * prompt: "you are the project guardian. you receive permission requests from other agents. read their prompt.md to understand what they're supposed to be doing. approve commands that align with their task. escalate anything destructive or unexpected to the human."
    * lives at project level, not inside a nepic
    * has its own terminal in the sidebar — human can watch it make decisions
      * // on same level as architect
    * learns over time: "I approved cat|grep for this agent 5 times, auto-approving this pattern"

  * ephemeral "needs approval" state
    * model gains: agent.pendingApproval = { command, tool, timestamp } | null
    * dies on stop — it's a runtime concern
    * bridge pushes it in snapshot → renderer shows visual indicator
    * dot style: maybe pulsing red ring around the role color dot?
      * or: small exclamation badge on the dot
      * needs to be noticeable but not alarming
        * // agree! 
        * // idea: blinking animation of the current icon whatever that icon is

  * the hook script (thin glue)
    * CC fires PermissionRequest → hook script runs
      * // so maybe even thinner: just an inline command that basically updates agent's status
        * // but then if it only notifies about request and falls through to ui dialog
          * // how are we modifying that it is resolved?
          * // should guardian keep track of that and manually reset the status?
          * // or should there be a specific nap command for allow/deny?
          * // btw, i like this idea:
            * // each request runs a hook, which is client and it hangs until guardian or human approve; 
            * // that happens through some nap interfaces (either app or cli)
            * // when approved/denied, hook lets go with corresponding status
            * // and on agent's terminal, it's showing a modal
              * // that can be resolved either via button click
              * // or via cli
    * script calls `nap3 approve-request` via socket
      * // can it just be a very simple inline command? i don't want to carry around a whole script
      * // it should be very easy to check if hook is set up or not
    * socket handler: sets agent.pendingApproval in model, notifies guardian, waits for response
    * guardian responds → socket handler clears pendingApproval, returns decision to hook
    * hook exits with allow/deny/pass-through
    * timeout: if guardian doesn't respond in N seconds → pass through to human

  * escalation
    * guardian unsure → marks as "escalate" → human sees it in UI
    * human approves/denies from the sidebar or terminal
    * guardian learns from the decision
      * // great point!
      * // so probably human's answer somehow just goes into guardian's session? 
        * // how could we orchestrate that?

* open questions
  * how does the guardian "respond"? nap command from its terminal? file write? IPC?
  * can the hook script block long enough for the guardian to think? (hook timeout is 10 min default)
  * should the guardian see ALL permission requests or only the gray area ones?
    * maybe: obviously safe (read-only) → auto-approve without bothering guardian
    * gray + dangerous → guardian judges
  * how to persist learned patterns? guardian's own marker file? separate policy file?
  * what happens if guardian is not running? fall through to human.
