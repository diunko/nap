You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 1300-nap-init — a CLI command that bootstraps a project for agent collaboration.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.spec.md`

Read the templates that get copied:
- `src/templates/` — browse the whole directory

Read the existing CLI:
- `src/cli/nap.ts` — where the init command will be added

This is a scaffolding command — it creates files and a database. Think about:
- Happy path: does it create everything correctly?
- Guard: does it fail if `.nap/` already exists?
- Edge cases: what if `.nap/` exists but is empty? What if nap.db exists but no nepic dirs? What if the user runs init twice?
- SQLite: are the rows correct? nepic, architect session, cc_session_uuid?
- Skills: `--add-skills` copies to `.claude/skills/`, `--add-skills --user` copies to `~/.claude/skills/`
- Templates: are all files copied? Are they identical to the source templates?
- Does `nap open` work after init? (the whole point)

Keep it focused — maybe 8-10 test cases. Not exhaustive. Just the ones that would catch real bugs.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
