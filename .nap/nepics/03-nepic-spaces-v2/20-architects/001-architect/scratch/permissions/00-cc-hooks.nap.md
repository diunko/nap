* Claude Code hooks — reference

* what hooks are
  * scripts that fire on CC events
  * receive JSON on stdin, respond via exit code + stdout
  * four types: command (shell), http (endpoint), prompt (single LLM turn), agent (multi-turn)
  * configured in settings.json (global, project, or local)

* hook events (24 total)

  * session lifecycle
    * SessionStart — session begins or resumes
    * SessionEnd — session terminates
    * InstructionsLoaded — CLAUDE.md / .claude/rules/*.md loaded

  * user input
    * UserPromptSubmit — prompt submitted, before CC processes it

  * tool execution
    * PreToolUse — before tool call executes
      * can block (exit 2) — CC skips the tool
      * matcher filters by tool name: Bash, Edit, Write, Read, Glob, Grep
      * `if` field filters by tool input (e.g. `Edit(*.json)`)
    * PostToolUse — after tool call succeeds
    * PostToolUseFailure — after tool call fails

  * permissions — THIS IS THE KEY ONE
    * PermissionRequest — when "Do you want to proceed?" would show
      * fires BEFORE the dialog appears
      * hook can return: allow (skip dialog), deny (block), or pass through
      * exit 0 + `{ "decision": { "behavior": "allow" } }` → auto-approve
      * exit 0 + `{ "decision": { "behavior": "deny" } }` → auto-deny
      * exit 0 + no decision → pass through to human
      * deny rules in settings always override hook allow
      * does NOT fire in non-interactive mode (-p flag)
    * PermissionDenied — after a tool call denied by auto mode classifier

  * notifications
    * Notification — CC sends a notification

  * agents
    * SubagentStart — subagent spawned
    * SubagentStop — subagent finished
    * TeammateIdle — agent team teammate about to go idle

  * tasks
    * TaskCreated — task being created
    * TaskCompleted — task marked completed

  * completion
    * Stop — CC finishes responding
    * StopFailure — turn ends due to API error

  * environment
    * CwdChanged — working directory changes
    * FileChanged — watched file changes on disk
    * ConfigChange — configuration file changes

  * worktrees
    * WorktreeCreate — worktree being created
    * WorktreeRemove — worktree being removed

  * context
    * PreCompact — before context compaction
    * PostCompact — after context compaction

  * MCP
    * Elicitation — MCP server requests user input
    * ElicitationResult — user responds to MCP elicitation

* hook input (JSON on stdin)
  * session_id, cwd, hook_event_name
  * tool_name, tool_input (for tool events)
  * permission_mode (for permission events)

* hook output
  * exit 0 = allow/proceed
  * exit 2 = block/deny (stderr shown to CC as error)
  * stdout JSON for structured decisions
  * multiple hooks on same event → most restrictive wins

* configuration
  * `~/.claude/settings.json` — global (all projects)
  * `.claude/settings.json` — project (committed, shared)
  * `.claude/settings.local.json` — project-local (gitignored)
  * `/hooks` command in CC to view all active hooks
  * matcher: regex on tool name
  * `if` field: filter on tool input pattern

* what this means for NAP
  * PermissionRequest hook → the IT agent concept
    * no pty keystroke hacking needed
    * CC's own system handles approval
  * project-level `.claude/settings.json` → per-project approval policy
  * hook script reads command, makes judgment, returns allow/deny/pass
  * simple version: shell script with allowlist
  * smart version: agent that learns from human decisions
