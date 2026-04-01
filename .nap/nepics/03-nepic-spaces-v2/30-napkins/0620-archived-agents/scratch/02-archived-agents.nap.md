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
    * // yes!

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
    * // no, sent as a first message
  * once started:
    * archived clears, new UUID assigned
    * becomes regular running agent — can nap done, can be resumed
      * // status becomes done:true, exited:false, archived: false
    * indistinguishable from a freshly created agent // not freshly, but anyway
      * // e.g., resume session uses uuid of new maintainer session

* importing existing projects: nap3 import-agents <nepic-dir>
  * scans for agent dirs that have prompt.md/response.md but no .agent.nap.json
  * creates markers with archived: true for each found agent
    * // uuids and all the stuff
  * how you bring a manual-workflow project into NAP
  * agents appear in sidebar immediately as archived

* nap3 archive <name>
  * marks a running/done agent as archived
  * use case: session you know is dead, want to allow successor
  * // let's skip for now

* dot style
  * role color + dashed border, no checkmark, no fill
    * distinct from done (dashed + checkmark) and exited (hollow gray)
    * // color + dashed doesn't sound convincing; 
      * // doesn't convey "archived" vibe
  * label: "archived"
  * clicking starts the successor flow
    * // idea: clicking shows: "session is gone; would you like to invoke a successor maintainer?"
      * // in terminal area?
      * // need to think about copy, should be snappy and fun
      * // also design?
      * // this makes me think: 
        * // for sessions where CC reports error on restore, detect that session is gone, and suggest invoking successor
        * // would that simplify it overall?
          * // does this mean that we don't need archived: true flag at all?
          * // really curious what's your ideas / thoughts / take on this

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
