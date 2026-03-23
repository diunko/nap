* nap init — bootstrap a project for agent collaboration

* what it does
  * creates `.nap/` structure from bundled templates
  * fails if `.nap/` already exists ("project already initialized")
  * does NOT open the app — just scaffolds
  * does ALL bootstrapping — open has zero special first-launch code

* what it creates

  * `.nap/nap.db` — SQLite with schema, first nepic row, architect session row
    * init does this, not open
    * open always does the same thing: read db, find nepic, boot architect
    * no "is this a fresh project?" detection in the app

  * `.nap/00-org/` — how we work
    * `10-promise.nap.md` — why we work this way (not a product pitch — team onboarding)
      * why agents are full CC sessions, not subagents
      * why visibility matters — the human watches, steers, inspects
      * condensed version of the product journeys
    * `20-workflow.nap.md` — the mechanics
      * IMPORTANT: Explore agent vs `nap start` — prominent, impossible to miss
        * Explore = research, comes back into your context
        * `nap start` = work, creates visible agent
        * ALWAYS `nap start` for anything beyond research
      * pipeline: napkin → spec → test arch → fs-eng → test-eng
      * CLI: nap start, nap nap, nap done, nap status
      * prompt.md contract, response.md for communication
      * no terminal messages (no poke, no done with message)
    * `30-structure.nap.md` — directory layout, numbering, extensions
    * `40-roles/` — architect, fullstack-eng, test-architect, test-eng

  * `.nap/nepics/01-v1/` — first nepic, always named v1
    * `10-docs/`
    * `15-feedback/`
      * `issues.md` — empty template
      * `wishlist.md` — empty template
    * `20-architects/001-architect/`
      * `prompt.md` — minimal: read your role, explore the codebase, /napkin with the human
    * `30-napkins/`
    * `40-board/` with status subdirs (10-draft through 60-done)

  * `.claude/skills/`
    * `napkin/` — brainstorming skill
    * `napkin-format/` — formatting skill

  * `.nap/.gitignore` — nap.db, nap.db-shm, nap.db-wal, sock

* where templates come from
  * bundled in the package — `src/templates/` in source tree
    * easy to find, edit, tweak
  * self-contained, works offline
  * no network, no template repos

* the flow
  * `cd ~/my-project`
  * `nap init`
    * scaffolds everything, creates db, inserts nepic + architect session
  * `nap open .`
    * app reads db, finds 01-v1 nepic, finds architect session
    * boots architect pty: `claude --verbose --session-id <uuid> "read prompt.md..."`
    * architect reads role → explores codebase → ready to brainstorm
  * user and architect jam using /napkin

* what nap init does NOT do
  * doesn't open the app
  * doesn't run any agents
  * doesn't read project context into prompts
    * architect explores on their own
