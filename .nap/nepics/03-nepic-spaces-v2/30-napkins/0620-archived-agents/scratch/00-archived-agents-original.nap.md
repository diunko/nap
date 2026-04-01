* 0620 — archived agents: adopt orphaned work

* the problem
  * agents did real work — prompt.md, response.md, code changes exist
  * but CC session is lost (manual workflow, crashed app, session expired)
  * can't --resume — the session UUID points to nothing
  * clicking the agent shows an empty terminal
  * the work is there in files but nobody owns it

* archived: a new agent state
  * marker file gains `archived: true`
  * meaning: session is unrecoverable, but artifacts (prompt.md, response.md) exist
  * the agent's work is in files, not in session history
  * distinct from exited — exited means session exists but agent chose to stop
  * archived means session is gone, only files remain

* what happens when you click an archived agent
  * NAP spawns a fresh Claude session — a successor, not a reconstruction
  * the successor gets a generated prompt:
    * "you are taking over maintenance of this work"
    * "read the original prompt to understand what was asked"
    * "read the response to understand what was delivered"
    * "explore the code to understand what was built"
    * "the human has follow-up questions or bugs to fix"
  * once started, the agent is no longer archived
    * new CC session UUID assigned
    * status becomes running (same as any other agent)
    * it's now a regular agent — can call nap done, can be resumed

* the generated successor prompt
  * // this section repeats "  * the successor gets a generated prompt:"  
    * // just add better wording along the lines from below
      * // into the ^^^^ section
      * // and get rid of this one
  * auto-generated, placed in the agent's dir as successor-prompt.md (or similar)
  * includes:
    * role context: "read your role at .nap/00-org/40-roles/<role>.md"
    * original prompt: "read <agent-dir>/prompt.md — this is what you were originally asked to do"
    * original response: "read <agent-dir>/response.md — this is what was delivered"
    * codebase context: "explore the relevant code — you own this now"
    * napkin context: "read the napkin at <napkin-dir>/<slug>.nap.md for the feature's vision"
    * // this should be a much simpler prompt sent as a first message to the agent on start
    * // smth like: "you're taking over this feature/piece of code. You're tne new owner, maintainer, and go-to person for debugging any issues"
    * // "read prompt and response, explore the code, make sure you own and understand it fully. take your time to do all the research of the code and needed relevant files in the project. do your research. You should be answer all related questions and do any kind of debugging on the spot, when asked, no furhter research needed."
  * the successor reads all this and has enough context to answer follow-ups, fix bugs, extend the work

* CLI: nap3 archive <name>
  * // what this command is doing? 
  * // i think archived: true is mainly useful for creating agent marker files for previous manual nap workflow agents
    * // idk how its related to agents that are active
    * // another question is what happens if indeed CC session gets lost or archived by CC? 
    * // when starting an agent, detect that teh session is faulty and use un-archive strategy?
  * marks an agent as archived
  * sets archived: true in marker
  * useful for: importing agents from manual workflow, marking dead sessions
  * // i'm not sure about this one, waht it is supposed to do
  * // got ideas? how does it fit into user flow?

* CLI: nap3 import-agents <nepic-dir>
  * scans a nepic dir for agent dirs that have prompt.md/response.md but no .agent.nap.json
  * creates marker files with archived: true for each
  * this is how you bring a manual-workflow project into NAP
  * the agents appear in the sidebar as archived (distinct dot style)
  * // this one makes sense

* visual: archived agent dot
  * needs a distinct style — not running, not done, not exited
  * suggestion: role color + dashed border (no checkmark, no fill)
    * distinguishes from done (dashed + checkmark) and exited (hollow gray)
  * label: "archived" in dim text
  * clicking it: starts the successor flow
  * // idea: archived needs more explicit action rather than click on the dot? 

* model changes
  * AgentState gains `archived: boolean`
  * marker file: `"archived": true`
  * computeResumeActions: skip archived agents (don't try to --resume dead sessions)
  * on click (pty:resume for archived): generate successor prompt, spawn fresh session with --session-id

* what this enables
  * bring existing manual-workflow projects into NAP
  * never lose agent work — files are the durable record
  * any agent's work can be picked up by a successor
  * the successor has full context from files, not from session history

* testing
  * // remove this section; not part of napkin
  * small:
    * model loads archived agent correctly from marker
    * computeResumeActions skips archived agents
    * clicking archived agent generates successor prompt
    * after click: archived → false, new UUID assigned, status running
  * medium:
    * import-agents creates correct markers
    * click archived agent in sidebar → new terminal with successor prompt
    * successor can read prompt.md and response.md

* done criteria
  * // not part of napkin
  * archived flag in marker files, model, and bridge
  * clicking archived agent spawns successor with generated prompt
  * successor becomes a regular agent (no longer archived)
  * nap3 archive <name> works
  * nap3 import-agents <nepic-dir> scans and creates markers
  * archived dot style distinct in sidebar
  * all existing tests pass
