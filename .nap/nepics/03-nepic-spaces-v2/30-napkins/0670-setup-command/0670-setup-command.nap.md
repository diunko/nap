* 0670 — nap3 setup: additive project configuration

* the idea
  * `nap3 init` creates a project from scratch (errors if .nap/ exists)
  * `nap3 setup` adds capabilities to an existing project
  * run it any number of times, each flag adds something, idempotent
  * `init` creates. `setup` extends.

* flags

  * `nap3 setup --guardian`
    * add guardian agent to 20-architects/002-guardian/
    * write .claude/settings.json with PermissionRequest hook config
    * if guardian already exists → no-op

  * `nap3 setup --skills`
    * copy napkin/napkin-format skills to .claude/skills/
    * --user variant: install to ~/.claude/skills/ (global)
    * if skills already exist → no-op (or overwrite with latest?)

  * `nap3 setup --import`
    * scan existing project, create marker files for everything found
    * the main use case: bring a manual-workflow or v2 project into v3

  * combinable: `nap3 setup --guardian --skills --import`

* nap3 setup --import: how it works

  * scans .nap/nepics/*/
    * for each nepic dir found:
      * create nepic-level identity if needed

    * scans 30-napkins/*/
      * for each napkin dir without .napkin.nap.json:
        * create marker: `{ status: "backlog", nepic: "<slug>" }`
        * all napkins default to backlog — human sorts via kanban

    * scans 30-napkins/*/agents/*/
      * for each agent dir without .agent.nap.json:
        * skip if empty (no prompt.md, no response.md, no files)
        * create marker:
          * fresh UUID (for identity — no session behind it yet)
          * role: inferred from dir name (001-test-arch → test-arch)
          * name: dir name
          * napkin: parent napkin slug
          * nepic: nepic slug
          * started: false — no session to resume
          * done: has response.md → true, otherwise false
          * archived: false
          * exited: false
        * on click in app → successor flow (started=false, no session)

    * scans 20-architects/*/
      * same as agents but no napkin field
      * architect with known CC session UUID:
        * human can paste UUID into marker + set started: true
        * next app open → resumes with --resume <uuid>

  * what import does NOT do
    * doesn't start the app
    * doesn't spawn any ptys
    * doesn't modify existing marker files
    * doesn't delete anything
    * purely additive — writes marker files where they're missing

* the manual UUID recovery path
  * human finds CC session UUID from ~/.claude/sessions/ or CC's /sessions command
  * edits .agent.nap.json: set cc_session_uuid + started: true
  * next app open: agent resumes with full context
  * most useful for: architects (their context is most valuable)

* init + setup relationship
  * `nap3 init` = full scaffold. uses setup logic internally.
  * `nap3 init --guardian` = init + setup --guardian
  * `nap3 init --add-skills` = init + setup --skills
  * init flags are sugar for init + setup in one command

* testing
  * small: import creates correct markers for napkins, agents, architects
  * small: import skips empty dirs, skips existing markers
  * small: import infers role from dir name correctly
  * small: setup --guardian idempotent (second run = no-op)
  * small: setup --skills copies files correctly
  * medium: import → open app → sidebar shows all imported entities
