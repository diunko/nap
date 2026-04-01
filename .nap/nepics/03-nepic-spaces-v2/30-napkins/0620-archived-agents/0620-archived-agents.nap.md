* 0620 — archived agents: adopt orphaned work

* the problem
  * agent did real work — prompt.md, response.md, code changes
  * CC session lost (manual workflow, crash, expiry)
  * click shows empty terminal. work in files, nobody owns it.

* two paths to the same flow
  * path A: archived flag — agent known-dead from import
    * marker has `archived: true`
    * auto-resume skips it, no --resume attempt
    * click → successor prompt immediately
  * path B: resume fails at runtime — session expired
    * app tries `claude --resume <uuid>`
    * CC exits fast: "No conversation found with session ID: ..."
    * app detects: resume attempt + quick exit → session gone
    * terminal shows successor prompt
  * both converge → same successor flow

* the successor flow
  * terminal area shows: "session expired — invoke a successor maintainer?"
    * snappy copy, clickable action
    * not silent — user makes the conscious choice
  * on click: fresh Claude spawns
    * generated prompt sent as first message (not a file)
    * "you are taking over this work as maintainer"
    * "read prompt.md — what was originally asked"
    * "read response.md — what was delivered"
    * "explore the code — understand what was built"
    * role context, napkin context included
  * after spawn:
    * new UUID assigned, old archived/dead UUID replaced
    * status: done=true, exited=false, archived=false
    * regular agent from here — can nap done, can be resumed

* nap3 import-agents <nepic-dir>
  * scans agent dirs: has prompt.md/response.md but no .agent.nap.json
  * creates full marker files: UUID, role (inferred from dir name convention), archived=true
  * agents appear in sidebar, ready for successor flow on click

* resume failure detection
  * pty onExit within ~5 seconds of spawn + was a --resume command → dead session
  * same pattern as v2 architect resume fallback (main.ts line 191)
  * output check: "No conversation found" in pty output buffer

* dot style for archived
  * needs its own visual — not running, not done, not exited
  * open question: what conveys "archived" at a glance?
  * // decision: use same grayed out hollow border as exited
  * label: "archived" in dim text

* done criteria
  * archived flag in marker, model skips on auto-resume
  * resume failure detected → successor prompt shown in terminal
  * click successor → fresh Claude with generated prompt
  * successor becomes regular agent (new UUID, done=true)
  * import-agents creates correct markers
  * all existing tests pass
