* 0620 — archived agents: adopt orphaned work

* the problem
  * agent did real work — prompt.md, response.md, code changes exist
  * CC session lost (manual workflow, crash, expiry)
  * can't --resume. clicking shows empty terminal.
  * work is in files, nobody owns it

* archived: new agent state
  * marker: `"archived": true`
  * meaning: session unrecoverable, artifacts exist
  * distinct from exited
    * exited = session exists, agent stopped
    * archived = session gone, only files remain
  * auto-resume skips archived agents

* click archived agent → successor spawns
  * fresh Claude, new UUID, generated prompt
  * the prompt:
    * "you are taking over this work as maintainer"
    * "read prompt.md — what was originally asked"
    * "read response.md — what was delivered"
    * "explore the code — understand what was built"
    * "the human has follow-up questions or bugs to fix"
    * role context, napkin context included
  * placed as successor-prompt.md in the agent dir
  * once started:
    * archived clears, new UUID assigned
    * becomes regular running agent — can nap done, can be resumed
    * indistinguishable from a freshly created agent

* importing existing projects: nap3 import-agents <nepic-dir>
  * scans for agent dirs that have prompt.md/response.md but no .agent.nap.json
  * creates markers with archived: true for each found agent
  * how you bring a manual-workflow project into NAP
  * agents appear in sidebar immediately as archived

* nap3 archive <name>
  * marks a running/done agent as archived
  * use case: session you know is dead, want to allow successor

* dot style
  * role color + dashed border, no checkmark, no fill
    * distinct from done (dashed + checkmark) and exited (hollow gray)
  * label: "archived"
  * clicking starts the successor flow

* model/bridge
  * AgentState gains archived: boolean
  * computeResumeActions: skip archived
  * on click: generate successor prompt → spawn with --session-id (not --resume)
  * bridge pushes archived state → renderer shows correct dot

* done criteria
  * archived flag works in marker, model, bridge, renderer
  * click archived → successor spawns with generated prompt
  * successor becomes regular agent (archived clears)
  * import-agents creates correct markers from orphaned dirs
  * nap3 archive marks agents
  * dot style distinct
  * all existing tests pass
