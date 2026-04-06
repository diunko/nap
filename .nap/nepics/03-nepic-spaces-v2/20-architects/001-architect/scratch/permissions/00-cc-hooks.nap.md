* Claude Code hooks — reference

* what hooks are
  * scripts that fire on CC events
  * receive JSON on stdin, respond via exit code + stdout
  * four types: command (shell), http (endpoint), prompt (single LLM turn), agent (multi-turn)
  * configured in settings.json (global, project, or local)

* exit codes (universal)
  * exit 0 — success, process JSON output
  * exit 2 — blocking error, stderr shown as denial reason
  * other — non-blocking error, shown in verbose mode only

* hook events (24 total)

  * session lifecycle
    * SessionStart — session begins or resumes
      * matcher: startup | resume | clear | compact
      * payload: { session_id, cwd, hook_event_name, source, model }
      * exit 0: add context via additionalContext
      * can persist env vars: `echo "export VAR=val" >> "$CLAUDE_ENV_FILE"`
    * SessionEnd — session terminates
    * InstructionsLoaded — CLAUDE.md / .claude/rules/*.md loaded

  * user input
    * UserPromptSubmit — prompt submitted, before CC processes it
      * payload: { session_id, cwd, hook_event_name, prompt }
      * exit 0: allow + add context
      * exit 2: block the prompt entirely
      * can inject context: `{ "additionalContext": "branch: main, 3 recent commits..." }`

  * tool execution
    * PreToolUse — before tool call executes
      * matcher: Bash | Edit | Write | Read | Glob | Grep | WebFetch | ...
      * `if` field: filter on input (e.g. `Edit(*.json)`)
      * payload (Bash):
        ```
        { tool_name: "Bash",
          tool_input: { command: "npm test", description: "Run tests", timeout: 120000 },
          tool_use_id: "toolu_01ABC..." }
        ```
      * payload (Edit):
        ```
        { tool_name: "Edit",
          tool_input: { file_path: "/src/index.ts",
                        edits: [{ old_str: "x = 1", new_str: "x = 2" }] } }
        ```
      * payload (Write):
        ```
        { tool_name: "Write",
          tool_input: { file_path: "/path/to/file.ts", content: "..." } }
        ```
      * exit 0 + allow: `{ hookSpecificOutput: { permissionDecision: "allow" } }`
      * exit 0 + deny: `{ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "..." } }`
      * exit 0 + modify input: `{ hookSpecificOutput: { permissionDecision: "allow", updatedInput: { command: "safer cmd" } } }`
      * exit 2: blocking denial, stderr = reason
    * PostToolUse — after tool call succeeds
      * payload: same as PreToolUse + tool_response field
      * exit 0: add context to conversation
      * can block: `{ "decision": "block", "reason": "linting failed" }`
    * PostToolUseFailure — after tool call fails

  * permissions — THE KEY ONE
    * PermissionRequest — when "Do you want to proceed?" would show
      * fires BEFORE the dialog appears
      * payload:
        ```
        { hook_event_name: "PermissionRequest",
          tool_name: "Bash",
          tool_input: { command: "rm -rf node_modules" },
          permission_suggestions: [...] }
        ```
      * auto-approve:
        ```
        { hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: { behavior: "allow" } } }
        ```
      * auto-deny:
        ```
        { hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: { behavior: "deny", message: "blocked", interrupt: true } } }
        ```
      * allow + update permissions:
        ```
        { hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: { behavior: "allow",
              updatedPermissions: [{ type: "addRules", rules: [...], behavior: "allow", destination: "projectSettings" }] } } }
        ```
      * no decision in output → passes through to human (dialog shows)
        * // what exactly does it mean?
        * // what about status code? does it matter?
        * //A: exit 0 + no decision field in JSON = "I have no opinion, ask the human"
          * //A: exit 0 + allow = approve. exit 0 + deny = reject. exit 0 + nothing = pass through.
          * //A: exit 2 = always deny (stderr = reason). other exit codes = non-blocking error, ignored.
      * deny rules in settings always override hook allow
      * does NOT fire in non-interactive mode (-p flag)
    * PermissionDenied — after a tool call denied by auto mode classifier

  * notifications
    * Notification — CC sends a notification
      * matcher: permission_prompt | idle_prompt | auth_success | elicitation_dialog
      * payload: { message, title, notification_type }
      * exit 0: add context (e.g. "alert sent to Slack")

  * agents
    * SubagentStart — subagent spawned
      * matcher: Explore | Plan | custom agent names
      * payload: { agent_id, agent_type }
      * exit 0: inject context into subagent
    * SubagentStop — subagent finished
    * TeammateIdle — agent team teammate about to go idle
    * // tell me more about these
    * //A: these fire for CC's INTERNAL subagents (Explore, Plan), not NAP-managed agents
      * //A: NAP agents are external pty processes — CC doesn't know about them as "subagents"
      * //A: TeammateIdle = CC's "agent team" feature (multiple CC instances collaborating)
      * //A: not directly useful for NAP unless we bridge CC's internal agent model with ours

  * tasks
    * TaskCreated — task being created
    * TaskCompleted — task marked completed
    * // tell me more, what are tasks? is it related to todo lists?
    * //A: yes — CC has built-in task tracking (TaskCreate, TaskList, TaskUpdate tools)
      * //A: agents can create tasks to track their own progress
      * //A: separate from NAP's napkin/status system
      * //A: could bridge: agent creates CC task → hook notifies NAP → sidebar updates

  * completion
    * Stop — CC finishes responding
      * payload: { session_id, cwd }
      * exit 0 + block: `{ "decision": "block", "reason": "build failed, fix first" }`
      * exit 0 + continue: `{ "continue": true }`
      * // what if non-0 exit?
      * //A: non-zero (not 2) = non-blocking error, shown in verbose mode only, CC continues normally
        * //A: exit 2 = blocking error. exit 0 + block decision = the way to prevent CC from finishing
    * StopFailure — turn ends due to API error

  * environment
    * CwdChanged — working directory changes
    * FileChanged — watched file changes on disk
      * matcher: .env | .envrc | *.config.js | ...
      * payload: { file_path, file_name, change_type: "modified" }
    * ConfigChange — configuration file changes

  * worktrees
    * WorktreeCreate — worktree being created
    * WorktreeRemove — worktree being removed
    * // tell me more about payloads here
    * //A: payload likely includes worktree path + branch name
      * //A: directly relevant to our wishlist (agent worktrees for isolated development)
      * //A: if CC creates a worktree, NAP could track it + show in UI + scope [diff] to it

  * context
    * PreCompact — before context compaction
    * PostCompact — after context compaction
    * // tell me about payloads
    * //A: payload likely includes session_id + before/after token counts
      * //A: relevant for NAP: detect when architect is running low on context
      * //A: could trigger: "context getting full, consider architect succession"
      * //A: or just show a warning indicator on the architect's dot/card

  * MCP
    * Elicitation — MCP server requests user input
    * ElicitationResult — user responds to MCP elicitation

* // question: what is that hook that can say:
  * // user input is required (like permissions or smth else, e.g. dialog qith questions, or exit plan mode, or any other interactive dialogue/questionnaire/etc)
  * // or, other, agent's turn is done, waiting for next input
  * //A: two hooks cover this:
    * //A: 1. Notification (type: "permission_prompt" | "idle_prompt") — CC needs attention
      * //A: permission_prompt = "Do you want to proceed?" is showing
      * //A: idle_prompt = CC finished and waiting for next input
    * //A: 2. Stop — CC's turn is done, waiting for next human message
      * //A: this is "agent is idle" — the moment between CC finishing and human typing
    * //A: for NAP: Stop hook → update agent dot to "waiting for input" state
      * //A: Notification hook → detect permission prompts across all agents
      * //A: together: know exactly which agents need attention and why
* configuration
  * `~/.claude/settings.json` — global (all projects)
  * `.claude/settings.json` — project (committed, shared)
  * `.claude/settings.local.json` — project-local (gitignored)
  * `/hooks` command in CC to view all active hooks
  * matcher: regex on tool name
  * `if` field: filter on tool input pattern
  * example config:
    ```
    { "hooks": {
        "PreToolUse": [{
          "matcher": "Edit|Write",
          "hooks": [{
            "type": "command",
            "if": "Edit(*.json)",
            "command": "/path/to/script.sh"
          }]
        }]
      }
    }
    ```

* what this means for NAP
  * PermissionRequest hook → the IT agent concept
    * no pty keystroke hacking needed
    * CC's own system handles approval
  * project-level `.claude/settings.json` → per-project approval policy
  * hook script reads command, makes judgment, returns allow/deny/pass
  * simple version: shell script with allowlist
  * smart version: agent that learns from human decisions
