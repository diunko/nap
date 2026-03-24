Hey, great work on the lifecycle refactoring. There are followup fixes needed — read `followups.md` in this directory.

The main things:

1. **Verify nap start old vs new form.** Does `nap start 'claude --verbose "read prompt.md"'` (old, one shell string) still work? Or only the new `nap start claude "read prompt.md"`? If old form breaks, we need to support both or update every reference.

2. **nap init coherence.** The schema SQL in `nap.ts` CLI — does it have the new columns (home_dir, exit_code, launches, last_resumed_at)? Does createSession in init set role='architect' and homeDir?

3. **nap open --architect.** Does it use the broadened query? Does it call incrementSessionLaunch?

4. **(+) button.** Does handleNepicCreate set role='architect' and homeDir on the session?

5. **Update src/templates/** — the workflow doc and role docs show the old nap start pattern. Update to show the new form with --napkin, --role, --dir flags. Also update `.nap/00-org/` live docs.

6. **Template skills.** Are the napkin/napkin-format skills in src/templates/skills/ real or stubs?

Run `npm run typecheck` after changes.

Read `followups.md` for the full list with details.
