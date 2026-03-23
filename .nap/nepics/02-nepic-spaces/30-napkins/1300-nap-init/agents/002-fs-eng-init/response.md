# 002-fs-eng-init — Response

## What was built

### `nap init` command (`src/cli/nap.ts`)

New CLI command that bootstraps a project for agent collaboration:

1. **Guard**: fails if `.nap/` already exists with "Project already initialized. Run `nap open` to launch."
2. **Directory structure**: creates full `.nap/` tree:
   - `.nap/00-org/` — copied verbatim from `src/templates/00-org/`
   - `.nap/nepics/01-v1/` — copied from `src/templates/nepic/` plus empty dirs (10-docs, 30-napkins, 40-board with status subdirs)
   - `.nap/.gitignore` — nap.db, nap.db-shm, nap.db-wal, sock
3. **SQLite database**: creates `.nap/nap.db` via system `sqlite3` CLI:
   - Full schema (same tables as `src/main/database.ts`: nepics, napkins, sessions, ui_state)
   - Seed data: 1 nepic row (name='v1', slug='01-v1', is_active=1), 1 session row (name='001-architect', role='architect', status='new')
   - UUIDs generated via `crypto.randomUUID()`
4. **Skills flags**:
   - `--add-skills` → copies napkin + napkin-format to `.claude/skills/`
   - `--add-skills --user` → copies to `~/.claude/skills/`
   - No flag → no skills

### `nap open` guard

Added check at the top of the `open` command: if `.nap/` doesn't exist in the target directory, fails with "No .nap/ directory found. Run `nap init` first."

### Bundled skills

Copied napkin and napkin-format skills from `~/.claude/skills/` into `src/templates/skills/` so they're bundled with the package.

### Template resolution

`findTemplatesDir()` tries two paths relative to `__dirname`:
- Built CLI at `out/cli/cli/nap.js` → `../../../src/templates`
- Source at `src/cli/nap.ts` → `../templates`

## Decisions

- **Schema duplication**: The SQL schema is duplicated as a string in `nap.ts` rather than importing from `database.ts`, because the CLI uses CommonJS and can't import `better-sqlite3`. The schema string matches `database.ts` exactly.
- **No string interpolation in templates**: all files copied verbatim as specified.
- **`execFileSync`** for `sqlite3` call — safe, no shell injection, input piped via stdin.

## Typecheck

`npm run typecheck` passes with zero errors.
