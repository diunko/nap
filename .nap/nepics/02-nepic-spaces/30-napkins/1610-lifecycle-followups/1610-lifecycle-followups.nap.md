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

* workflow docs
  * `.nap/00-org/20-workflow.nap.md` shows old nap start pattern
  * `src/templates/00-org/20-workflow.nap.md` also needs updating
  * role docs may reference old pattern

* nap ls
  * napkinned but never built
  * with new schema would show richer data
  * not urgent, note for later

* template skills
  * napkin and napkin-format skills in src/templates/skills/
  * are they complete? or just stubs from the fs-eng?
  * need the real skill content from ~/.claude/skills/
