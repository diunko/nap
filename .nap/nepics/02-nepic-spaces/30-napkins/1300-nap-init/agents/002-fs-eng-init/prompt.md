You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement the `nap init` CLI command that bootstraps a project for agent collaboration.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/1300-nap-init.test.md`

Read the existing code:
- `src/cli/nap.ts` — add `init` command here
- `src/main/database.ts` — schema (reuse for init, but note: CLI can't import better-sqlite3, use system `sqlite3` CLI instead)
- `src/templates/` — browse all templates that need to be copied

What to build:
1. `nap init` command in `src/cli/nap.ts`
   - Fails if `.nap/` exists: "Project already initialized. Run `nap open` to launch."
   - Creates full `.nap/` structure by copying from templates
   - Creates `nap.db` via system `sqlite3` CLI — schema + seed data (nepic + architect session)
   - Generates UUIDs via `crypto.randomUUID()`
2. Skills flags:
   - `--add-skills` → copy skill dirs to `.claude/skills/` in project
   - `--add-skills --user` → copy to `~/.claude/skills/`
   - No flag → no skills
   - Skills source: the napkin and napkin-format skills. Check `~/.claude/skills/` on the dev machine for the current versions, or bundle them in `src/templates/skills/`
3. `nap open` guard: fail with "No .nap/ directory found. Run `nap init` first." if `.nap/` doesn't exist
4. Template finding: use `__dirname` or `import.meta.url` to find `src/templates/` relative to the CLI script. Consider that the built CLI is at `out/cli/nap.js` — the templates need to be accessible from there too.

Key constraints:
- CLI is pure Node — no Electron, no better-sqlite3 import
- Use system `sqlite3` CLI for database creation (macOS ships it)
- Templates copied verbatim, no string interpolation
- Run `npm run typecheck` when done

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1300-nap-init/agents/002-fs-eng-init/response.md`, then run `nap done` (no message).
