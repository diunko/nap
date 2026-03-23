* architect launch — consistent prompts, nap open --architect

* two problems

  * (+) nepic creation uses hardcoded prompt, not templates
    * the 1000-nepic-creation code generates its own prompt.md
    * much worse than the template in src/templates/nepic/20-architects/001-architect/prompt.md
    * fix: copy from src/templates/ — same quality as nap init

  * nap open starts a bare shell, not an architect
    * after nap init, user expects to talk to an architect
    * instead they get bash
    * fix: `nap open --architect` (or `-a`) launches architect session
      * reads architect session from SQLite (cc_session_uuid)
      * spawns `claude --verbose --session-id <uuid> "read prompt.md..."`
      * first terminal IS the architect, not a shell
    * `--name Nova` → display name `[Architect] Nova`
    * without --architect: current behavior (shell), backwards compatible

* nap open --architect flow
  * find active nepic in SQLite
  * find architect session for that nepic
  * if cc_session_uuid exists: `claude --verbose --session-id <uuid> "read prompt.md..."`
  * first terminal name: `[Architect] <name>` or `[Architect]` if no --name
  * app launches with architect conversation, not shell

* (+) fix
  * nepic creation code should use src/templates/nepic/ for:
    * 15-feedback/ templates
    * 20-architects/001-architect/prompt.md
  * same template, same quality, one source of truth
