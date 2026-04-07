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
    * nap routes this to the guardian agent via socket
    * guardian agent receives the request in its terminal (poke or structured message)
    * guardian reads the requesting agent's prompt.md from disk
    * guardian makes judgment: "fs-eng building a React component is running npm install — yes, that aligns"
    * guardian responds: allow or escalate to human
    * nap sends the decision back to the hook (which is blocking, waiting for response)
    * hook returns allow/deny/pass-through to CC

  * the guardian agent
    * a new role: always-on, lightweight, Sonnet-powered
    * prompt: "you are the project guardian. you receive permission requests from other agents. read their prompt.md to understand what they're supposed to be doing. approve commands that align with their task. escalate anything destructive or unexpected to the human."
    * lives at project level, not inside a nepic
    * has its own terminal in the sidebar — human can watch it make decisions
    * learns over time: "I approved cat|grep for this agent 5 times, auto-approving this pattern"

  * ephemeral "needs approval" state
    * model gains: agent.pendingApproval = { command, tool, timestamp } | null
    * dies on stop — it's a runtime concern
    * bridge pushes it in snapshot → renderer shows visual indicator
    * dot style: maybe pulsing red ring around the role color dot?
      * or: small exclamation badge on the dot
      * needs to be noticeable but not alarming

  * the hook script (thin glue)
    * CC fires PermissionRequest → hook script runs
    * script calls `nap3 approve-request` via socket
    * socket handler: sets agent.pendingApproval in model, notifies guardian, waits for response
    * guardian responds → socket handler clears pendingApproval, returns decision to hook
    * hook exits with allow/deny/pass-through
    * timeout: if guardian doesn't respond in N seconds → pass through to human

  * escalation
    * guardian unsure → marks as "escalate" → human sees it in UI
    * human approves/denies from the sidebar or terminal
    * guardian learns from the decision

* open questions
  * how does the guardian "respond"? nap command from its terminal? file write? IPC?
  * can the hook script block long enough for the guardian to think? (hook timeout is 10 min default)
  * should the guardian see ALL permission requests or only the gray area ones?
    * maybe: obviously safe (read-only) → auto-approve without bothering guardian
    * gray + dangerous → guardian judges
  * how to persist learned patterns? guardian's own marker file? separate policy file?
  * what happens if guardian is not running? fall through to human.
