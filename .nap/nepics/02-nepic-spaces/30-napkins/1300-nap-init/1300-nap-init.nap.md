* nap init — bootstrap a project for agent collaboration

* what it does
  * creates `.nap/` structure from bundled templates
  * fails if `.nap/` already exists ("project already initialized")
  * does NOT open the app — just scaffolds

* what it creates

  * `.nap/00-org/` — the team playbook
    * `20-workflow.nap.md` — how agents communicate, CLI mechanics, the pipeline
      * IMPORTANT: prominently distinguish two agent patterns
        * Claude Code internal Explore agent — one-off research
          * codebase questions, finding code, quick investigations
          * report comes back into your context
          * use this freely for research
        * `nap start` agents — work that produces artifacts
          * implementation, test writing, design exploration
          * creates a visible agent with own terminal
          * human can watch, talk to, steer
          * ALWAYS use this for anything beyond research
      * `nap done` — completion signal, no message
      * `nap nap` — architect waits for agent
      * `nap status` — change napkin status
      * response.md for all communication
      * prompt.md contract — self-contained, last line is nap done instruction
    * `30-structure.nap.md` — directory layout, numbering, file extensions
    * `40-roles/`
      * `architect.md` — the orchestrator
        * clear expectations: holds system shape, doesn't write code
        * launches agents via `nap start`, reviews output, routes failures
        * uses Explore agent for research, `nap start` for everything else
        * writes specs, prompts, manages pipeline
        * when context runs out: writes handoff, successor boots
      * `fullstack-eng.md`
      * `test-architect.md` — native modules = Playwright, never vitest
      * `test-eng.md`

  * `.nap/nepics/01-<name>/` — first nepic
    * `10-docs/`
    * `15-feedback/`
      * `issues.md` — empty template
      * `wishlist.md` — empty template
    * `20-architects/001-architect/`
      * `prompt.md` — minimal: "read your role, explore the codebase, jam with the human using /napkin"
    * `30-napkins/`
    * `40-board/` with status subdirs (10-draft through 60-done)

  * `.claude/skills/`
    * `napkin/` — the napkin brainstorming skill
    * `napkin-format/` — the formatting skill

  * `.nap/.gitignore` — nap.db, nap.db-shm, nap.db-wal, sock

* where templates come from
  * bundled with the CLI binary
    * // yeah, just arrange them neatly somewhere in the package,
    * // so that it's easy to see to edit and tweak
  * self-contained, works offline
  * no network, no template repos

* the name
  * `nap init` with no args → derives from directory basename
  * `nap init --name "my-project"` → explicit name
  * name becomes nepic slug: `01-my-project`
    * // let's hardcode first nepic as v1

* what happens after init
  * user runs `nap open .`
  * app opens, creates nap.db, boots architect pty
    * // how do we (app?) manage(s) architect sessions?
    * // do we create nap.db on init or on open?
  * architect reads prompt.md → reads role → explores codebase → ready to brainstorm
  * user and architect jam on the idea using /napkin

* what nap init does NOT do
  * doesn't open the app
  * doesn't create nap.db (app does that on first launch)
    * // let's discuss. pros and cons? 
    * // if it exists on first open, i think app will be happy too
    * // actually, is then first and non-first opens even different?
    * // i think i like the idea of separating this bootstrapping from open
    * // so that init does all the bootstrapping
    * // and open doesn't have any of special bootstrapping code
  * doesn't run any agents
  * doesn't read project context into prompts
    * architect will explore on their own
