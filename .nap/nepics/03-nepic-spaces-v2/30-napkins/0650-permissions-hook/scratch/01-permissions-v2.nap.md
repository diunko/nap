* 0650 — permissions v2

* the architecture
  * CC hook → `nap3 approve-request` (inline command, reads stdin + NAP_SESSION_ID)
    * // nap3 what's the name of the hook? it's PermissionRequest
    * // so should be `nap3 hook permission-request`
    * // approve-request would mean that someone approves it, confusing
  * hook hangs → model sets pendingApproval on agent → guardian gets poked → guardian decides
    * // modal should show all the info from the request (in first approximation, just all json?)
  * guardian resolves via `nap3 resolve-approval --agent <id> --decision allow|deny`
    * // `nap3 permission-response`
  * hook unblocks with the decision → CC proceeds or blocks
  * if guardian is not running → fall through to human (CC shows its own dialog)

* the hook (thin, inline)
  * config: `{ "type": "command", "command": "nap3 approve-request" }`
  * `nap3 approve-request`:
    * reads hook payload from stdin (tool_name, tool_input, permission_suggestions)
    * reads NAP_SESSION_ID from env (= agent ID, same thing)
    * calls socket: sets agent.pendingApproval in model
    * hangs until `resolve-approval` is called for this agent
    * exits with allow/deny based on resolution
  * no script file — one inline command in .claude/settings.json

* the guardian agent
  * new role: "guardian" — project-level, always-on, Sonnet-powered // we cannot set models per agent yet, right?
    * // can live inside architects folder, but have distinct role via prompt
  * lives alongside architect in sidebar (same level, not inside a nepic)
  * color: red (#ef4444)? or purple? needs to stand out as "ops/system" // purple ok
  * prompt: "you receive permission requests from agents. read their prompt.md. approve if aligned with task. escalate to human if unsure."
  * receives requests via poke with structured message:
    ```
    [from: 002-fs-eng | napkin: 0100-explore | role: fs-eng]
    // so it's nap poke run from within the nap hook-premission-request?
    // i want to see the whole path in the next napkin version
    // and all data transformation / flows
    permission request:
    tool: Bash
    command: npm install react-router-dom
    task: .nap/nepics/01-v1/30-napkins/0100-explore/agents/002-fs-eng/prompt.md
    ```
  * guardian reads prompt.md, makes judgment, calls:
    * `nap3 resolve-approval --agent <id> --decision allow` or
    * `nap3 resolve-approval --agent <id> --decision deny`
  * if unsure → asks the human in its own terminal
    * guardian's dot blinks (needs input)
    * human types answer in guardian's terminal
    * guardian learns from the decision
    * guardian resolves the approval

* parallel requests
  * multiple agents can have pendingApproval simultaneously
  * each poke arrives in guardian's terminal sequentially
  * guardian processes them in order (or batches obvious ones)
  * guardian tracks all pending in its conversation history
  * `nap3 ps` shows which agents are waiting

* nap3 poke --raw (prerequisite)
  * // let's break it out into it's own small napkin
  * sends raw bytes to pty, no three-step delivery
  * needed for: guardian sending "1" to approve CC dialog (fallback path)
  * key encoding for CLI:
    * `nap3 poke --raw <name> "1"` → sends 0x31
    * `nap3 poke --raw <name> "\x1b"` → sends Escape
      * // need a dict of common keys, smth like emacs map? cmd-o, esc, meta-y, etc
      * // should be a simple straightforward map
    * `nap3 poke --raw <name> "\r"` → sends Enter
    * `nap3 poke --raw <name> "\x1b[A"` → sends arrow up
    * C-style escape sequences parsed by the CLI before writing to pty
      * // what does it mean? 
  * also useful for: testing, automation, any raw terminal input

* agent.pendingApproval (ephemeral model state)
  * `{ tool: string, command: string, timestamp: number }` or null
  * set when approve-request arrives, cleared on resolve
  * dies on app stop — ephemeral
  * pushed in snapshot → renderer shows indicator
    * // it also shows a dialogue

* visual: blinking dot
  * agent's dot blinks when pendingApproval is set
  * keeps role color and shape — just adds blink animation
  * visible on ALL surfaces: sidebar collapsed, sidebar focused, kanban cards
  * click agent → see the pending request details (in terminal area or tooltip)

* escalation flow
  * guardian unsure → types question in its own terminal → its dot blinks (waiting for input)
    * // how does it indicate that it needs input?
    * // run some command? 
    * // include this path into data flow
  * human sees guardian blinking → clicks into guardian → reads the question
  * human types answer → guardian learns + resolves the approval
    * // make sure to summarize the decision back to human to receive final nod
  * the learning stays in guardian's CC session history
    * // later learnings go into project-specific addendum to the guardian prompt
    * // maybe just a file in guardian's home
  * future: persist learned patterns to a policy file for cross-session learning

* nap3 init sets it up
  * creates .claude/settings.json with PermissionRequest hook configured
    * // --guardian flag enables this
  * guardian agent created alongside architect on first nepic
  * hook command is just `nap3 approve-request` — works immediately
    * // wdym by this?
