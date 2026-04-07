* 0650 — permissions v2

* the architecture
  * CC hook → `nap3 approve-request` (inline command, reads stdin + NAP_SESSION_ID)
    * // nap3 what's the name of the hook? it's PermissionRequest
    * // so should be `nap3 hook permission-request`
    * // approve-request would mean that someone approves it, confusing
    * //A: agreed. `nap3 hook permission-request` — mirrors the CC event name.
      * //A: opens pattern for future hooks: `nap3 hook stop`, `nap3 hook pre-tool-use`
  * hook hangs → model sets pendingApproval on agent → guardian gets poked → guardian decides
    * // modal should show all the info from the request (in first approximation, just all json?)
    * //A: yes — visible modal in terminal area, renders JSON like debug panel.
      * //A: if dismissed → request falls through to standard CC human dialog
  * guardian resolves via `nap3 resolve-approval --agent <id> --decision allow|deny`
    * // `nap3 permission-response`
    * //A: agreed. `nap3 permission-response --agent <id> --decision allow|deny`
  * hook unblocks with the decision → CC proceeds or blocks
  * if guardian is not running → fall through to human (CC shows its own dialog)

* the hook (thin, inline)
  * config: `{ "type": "command", "command": "nap3 hook permission-request" }`
    * //A: inline, no script file. nap3 is globally linked, works immediately.
  * `nap3 hook permission-request`:
    * reads hook payload from stdin (tool_name, tool_input, permission_suggestions)
    * reads NAP_SESSION_ID from env (= agent ID)
    * calls socket: sets agent.pendingApproval in model
    * hangs until `permission-response` is called for this agent
    * exits with allow/deny based on resolution

* the guardian agent
  * new role: "guardian" — project-level, always-on, Sonnet-powered
    * // we cannot set models per agent yet, right?
    * //A: CC supports `claude --model sonnet` flag. launch guardian with that.
    * // can live inside architects folder, but have distinct role via prompt
    * //A: yes — `20-architects/002-guardian/` with role: "guardian" in marker.
      * //A: sidebar groups with architects. purple dot distinguishes from blue.
  * lives alongside architect in sidebar (same level, not inside a nepic)
  * color: purple
    * // purple ok
  * prompt: "you receive permission requests from agents. read their prompt.md. approve if aligned with task. escalate to human if unsure."
  * receives requests via poke with structured message:
    ```
    [from: 002-fs-eng | napkin: 0100-explore | role: fs-eng]
    permission request:
    tool: Bash
    command: npm install react-router-dom
    task: .nap/nepics/01-v1/30-napkins/0100-explore/agents/002-fs-eng/prompt.md
    ```
    * // so it's nap poke run from within the nap hook-premission-request?
    * //A: no — the socket handler in main.ts pokes the guardian directly.
      * //A: `nap3 hook permission-request` → socket → handler pokes guardian → guardian judges
    * // i want to see the whole path in the next napkin version
    * // and all data transformation / flows
    * //A: full data flow traced in section at bottom
  * guardian reads prompt.md, makes judgment, calls:
    * `nap3 permission-response --agent <id> --decision allow` or
    * `nap3 permission-response --agent <id> --decision deny`
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
  * //A: agreed — separate napkin, standalone enhancement
  * sends raw bytes to pty, no three-step delivery
  * key encoding for CLI:
    * `nap3 poke --raw <name> "1"` → sends 0x31
    * `nap3 poke --raw <name> "\x1b"` → sends Escape
      * // need a dict of common keys, smth like emacs map? cmd-o, esc, meta-y, etc
      * // should be a simple straightforward map
      * //A: yes — `nap3 key <name> enter|esc|up|down|tab|space|backspace` for named keys
        * //A: raw mode for arbitrary sequences: `nap3 poke --raw <name> "\x1b[A"`
    * C-style escape sequences parsed by the CLI before writing to pty
      * // what does it mean?
      * //A: CLI parses `\x1b` as byte 0x1B, `\r` as 0x0D, `\n` as 0x0A before sending to pty
        * //A: same escaping as C string literals — standard way to express control characters

* agent.pendingApproval (ephemeral model state)
  * `{ tool: string, command: string, timestamp: number, payload: object }` or null
  * set when hook-permission-request arrives, cleared on resolve
  * dies on app stop — ephemeral
  * pushed in snapshot → renderer shows blinking dot + modal
    * // it also shows a dialogue
    * //A: modal in terminal area — renders full JSON like debug panel, with approve/deny buttons
      * //A: dismiss modal → falls through to CC's own permission dialog

* visual: blinking dot
  * agent's dot blinks when pendingApproval is set
  * keeps role color and shape — just adds blink animation
  * visible on ALL surfaces: sidebar collapsed, sidebar focused, kanban cards
  * click agent → see the pending request modal in terminal area

* escalation flow
  * guardian unsure → asks human in its own terminal
    * // how does it indicate that it needs input?
    * // run some command?
    * // include this path into data flow
    * //A: CC's Stop event fires when guardian finishes its response (asks the question)
      * //A: we could hook Stop too: `nap3 hook stop` sets agent status to "idle/waiting"
      * //A: or simpler: guardian's dot naturally stops pulsing when CC is idle — already visible
      * //A: the question appears in guardian's terminal scrollback — human clicks in and reads it
  * human sees guardian waiting → clicks into guardian → reads the question
  * human types answer → guardian summarizes decision back for final nod
    * // make sure to summarize the decision back to human to receive final nod
    * //A: guardian: "approving npm install for React agents. agree?" → human: "yes" → guardian resolves
  * guardian learns from the decision
    * // later learnings go into project-specific addendum to the guardian prompt
    * // maybe just a file in guardian's home
    * //A: `20-architects/002-guardian/learned-policies.md` — guardian reads on startup
      * //A: accumulates: "npm install → safe for fs-eng. git push → always escalate."
      * //A: persistent across sessions because it's a file
    * // so probably human's answer somehow just goes into guardian's session?
    * // how could we orchestrate that?
    * //A: it already does — human types in guardian's terminal, guardian's CC session has the full conversation
      * //A: for cross-session persistence: guardian writes to learned-policies.md before resolving
      * //A: next session: guardian reads the file alongside its prompt

* nap3 init sets it up
  * creates .claude/settings.json with PermissionRequest hook configured
    * // --guardian flag enables this
    * //A: `nap3 init --guardian` — opt-in. without flag: no guardian, no hook, simple projects.
  * guardian agent created alongside architect on first nepic
  * hook command is inline: `nap3 hook permission-request`
    * // wdym by this?
    * //A: once `nap3 init --guardian` writes the hook config to .claude/settings.json,
      * //A: every CC session in this project automatically uses it
      * //A: `nap3` is globally linked, so the command is available everywhere
      * //A: no per-agent setup needed — init configures it project-wide

* data flow — complete path for a permission request

  * step 1: agent triggers
    * agent 002-fs-eng runs `npm install`
    * CC fires PermissionRequest hook event
    * CC spawns: `nap3 hook permission-request`
    * stdin receives:
      ```
      { "hook_event_name": "PermissionRequest",
        "tool_name": "Bash",
        "tool_input": { "command": "npm install react-router-dom" },
        "session_id": "uuid-fs" }
      ```
    * env has: NAP_SESSION_ID=uuid-fs
    * //A: TA flagged (G2): pty spawner must set NAP_SESSION_ID + NAP_SOCKET in env
      * //A: currently not set — one-line fix in node-pty-spawner.ts spawn()

  * step 2: nap3 hook permission-request (CLI process)
    * reads stdin JSON + NAP_SESSION_ID
    * sends socket request:
      ```
      { "type": "hook-permission-request",
        "agentId": "uuid-fs",
        "tool": "Bash",
        "command": "npm install react-router-dom",
        "payload": <full stdin JSON> }
      ```
    * **blocks** — waits for socket response
    * //A: TA flagged (G1): socket server is request→response today. this needs a hanging Promise.
      * //A: shared Map<agentId, { resolve }> registry. permission-response looks up and resolves.
    * //A: keepalive: server sends periodic pings to prevent OS socket timeout during long hangs

  * step 3: socket handler (main.ts)
    * receives hook-permission-request
    * calls model.setAgentPendingApproval("uuid-fs", { tool, command, payload, timestamp })
    * pushes snapshot → renderer shows:
      * blinking dot on 002-fs-eng (all surfaces)
      * if 002-fs-eng's terminal is active: modal with request JSON + approve/deny buttons
    * looks up guardian agent by role in model
    * if guardian exists + running:
      * constructs poke message:
        ```
        [permission-request from: 002-fs-eng | napkin: 0100-explore | role: fs-eng]
        tool: Bash
        command: npm install react-router-dom
        task: .nap/nepics/01-v1/30-napkins/0100-explore/agents/002-fs-eng/prompt.md
        ```
      * pokes guardian via pty write (message queue)
    * if guardian not running: does nothing extra (human resolves via modal)
    * **waits** for permission-response for agent uuid-fs
    * //A: TA flagged (G8): concurrent requests need per-agent registry
    * //A: TA flagged (G12): if agent exits while pending, clean up registry + clear pendingApproval
    * //A: TA flagged (G7): on client disconnect, clean up registry entry

  * step 4: guardian judges
    * guardian receives poke, reads the message
    * guardian reads prompt.md from the path in the message
    * guardian decides: aligned with task → allow
    * guardian runs: `nap3 permission-response --agent uuid-fs --decision allow`

  * step 5: nap3 permission-response (CLI process)
    * sends socket request:
      ```
      { "type": "permission-response",
        "agentId": "uuid-fs",
        "decision": "allow" }
      ```

  * step 6: socket handler resolves
    * receives permission-response
    * calls model.clearPendingApproval("uuid-fs")
    * pushes snapshot → blinking stops, modal disappears
    * responds to the hanging hook-permission-request socket connection:
      ```
      { "decision": "allow" }
      ```

  * step 7: hook completes
    * `nap3 hook permission-request` unblocks
    * prints to stdout:
      ```
      { "hookSpecificOutput": {
          "hookEventName": "PermissionRequest",
          "decision": { "behavior": "allow" } } }
      ```
    * exits 0
    * CC reads output → skips permission dialog → runs the command
    * //A: TA flagged (G6): output format must be EXACT — CC ignores wrong format
      * //A: deny format: `{ hookSpecificOutput: { ..., decision: { behavior: "deny", message: "reason", interrupt: true } } }`
      * //A: pass-through: exit 0 with empty JSON or no decision field

  * alternative: human resolves via modal
    * at step 3, modal shows in terminal area with approve/deny buttons
    * human clicks approve → renderer sends intent: { type: "permission-response", agentId, decision: "allow" }
    * bridge delivers intent to main → same as step 6

  * alternative: human dismisses modal
    * human clicks dismiss / switches away
    * hook times out (10 min default) or falls through
    * CC shows its own permission dialog
    * human clicks Yes/No in CC's UI directly

  * alternative: guardian escalates
    * at step 4, guardian is unsure
    * guardian types in its terminal: "Agent 002-fs-eng wants to run npm install react-router-dom. Their task is building a sidebar component. I'm not sure — approve?"
    * guardian's CC session enters idle (Stop event)
    * guardian's dot shows "waiting for input"
    * human clicks into guardian terminal, reads question
    * human types: "yes, npm install is fine for this project"
    * guardian: "understood — approving npm install for fs-eng agents. I'll remember this."
    * guardian writes to learned-policies.md: "npm install → safe for fs-eng"
    * guardian runs: `nap3 permission-response --agent uuid-fs --decision allow`
    * flow continues at step 5
