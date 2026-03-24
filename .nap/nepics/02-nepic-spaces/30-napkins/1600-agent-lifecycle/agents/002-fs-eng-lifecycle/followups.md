* 1600 lifecycle followups — things that need updating after the refactoring

* nap init
  * creates architect session via createSession
  * does it set role='architect'?
  * does it set homeDir to `20-architects/001-architect/`?
  * does the schema SQL in nap.ts CLI match database.ts? (new columns)

* nap open --architect
  * 1400 used getArchitectForNepicLaunch — still exists?
    * or replaced by broadened getArchitectForNepic?
  * does it call incrementSessionLaunch on resume?
  * does it update lastResumedAt?

* nap start invocation pattern
  * old form: `nap start 'claude --verbose "read prompt.md"'` (one shell string)
  * new form: `nap start claude "read prompt.md"` (claude as separate arg)
  * are BOTH supported? or did the old form break?
  * if old form breaks: every existing agent prompt references it
    * workflow doc, role docs, all prompt.md files

* (+) button (handleNepicCreate)
  * does it set role='architect' on the session?
  * does it set homeDir?
  * does it use template prompt (1400 fix) still working?

* src/templates/ — the nap init templates
  * ALL templates need updating for the new nap start pattern
  * `src/templates/00-org/20-workflow.nap.md`
    * shows old form: `nap start 'claude --verbose "read prompt.md"'`
    * needs new form: `nap start claude "read prompt.md" --napkin <slug> --name <name>`
    * the IMPORTANT section about Explore vs nap start — update examples
  * `src/templates/00-org/40-roles/architect.md`
    * launch examples use old pattern
    * add: `--role`, `--napkin`, `--dir` flag documentation
  * `src/templates/00-org/40-roles/fullstack-eng.md`, `test-architect.md`, `test-eng.md`
    * if they reference nap start pattern, update
  * `src/templates/nepic/20-architects/001-architect/prompt.md`
    * is this still correct for the new lifecycle?

* live docs (this project's .nap/00-org/)
  * `.nap/00-org/20-workflow.nap.md` — same updates as template
  * `.nap/00-org/40-roles/architect.md` — same updates
  * these are the docs that current agents read

* nap ls
  * napkinned but never built
  * with new schema would show richer data
  * not urgent, note for later

* template skills
  * napkin and napkin-format skills in src/templates/skills/
  * are they complete? or just stubs from the fs-eng?
  * need the real skill content from ~/.claude/skills/
