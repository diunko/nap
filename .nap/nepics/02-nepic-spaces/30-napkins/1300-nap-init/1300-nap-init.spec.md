## Why

There's no way to bootstrap a project for NAP agent collaboration. You have to manually create directories, copy docs, set up SQLite. `nap init` does all of this in one command.

## What

New CLI command `nap init` that scaffolds `.nap/` directory from bundled templates, creates SQLite database, and inserts the first nepic + architect session.

## Constraints

* Fails with error if `.nap/` already exists: "Project already initialized. Run `nap open` to launch."
* Does NOT require the NAP app to be running (no socket needed)
* Does NOT open the app — just scaffolds

### What it creates

```
.nap/
  nap.db                    ← SQLite with schema + first nepic + architect session
  .gitignore                ← nap.db, nap.db-shm, nap.db-wal, sock
  00-org/                   ← copied from src/templates/00-org/
    10-promise.nap.md
    20-workflow.nap.md
    30-structure.nap.md
    40-roles/
      architect.md
      fullstack-eng.md
      test-architect.md
      test-eng.md
  nepics/
    01-v1/                  ← first nepic, always "01-v1"
      10-docs/
      15-feedback/
        issues.md           ← from template
        wishlist.md         ← from template
      20-architects/001-architect/
        prompt.md           ← from template
      30-napkins/
      40-board/
        20-backlog/
        30-todo/
        40-doing/
        50-review/
        60-done/
```

### SQLite setup

* Create `nap.db` with full schema (same init as `src/main/database.ts`)
* INSERT nepic: `{ id: uuid, name: 'v1', slug: '01-v1', is_active: 1 }`
* INSERT session: `{ id: uuid, nepic_id, name: '001-architect', role: 'architect', status: 'new', cc_session_uuid: uuid }`

### Skills (opt-in)

* `nap init --add-skills` → copy `src/templates/skills/` to `.claude/skills/`
* `nap init --add-skills --user` → copy to `~/.claude/skills/`
* No flag → no skills installed
* Skills to copy: `napkin/`, `napkin-format/`

### CLI

* `nap init` — derive name from cwd basename, create as above
* `nap init --name "my-project"` — explicit name (only affects display, nepic slug is always `01-v1`)
* No args needed. Works from any directory.

### Templates

* Bundled at `src/templates/` in the package
* Copied verbatim — no string interpolation, no dynamic content
* CLI needs to find the templates relative to its own location (consider `__dirname` or similar)

## What `nap open` does after init

* Reads `nap.db` — finds nepic, finds architect session
* Boots architect pty: `claude --verbose --session-id <uuid> "read .nap/nepics/01-v1/20-architects/001-architect/prompt.md and follow its instructions"`
* No special first-launch code. Same path as every subsequent open.
* Fails if no `.nap/` exists: "No .nap/ directory found. Run `nap init` first."

## What to read

* `src/cli/nap.ts` — CLI command structure, add `init` command
* `src/main/database.ts` — schema init (reuse for standalone CLI)
* `src/templates/` — the templates to copy
* The skills live at `~/.claude/skills/napkin/` and `~/.claude/skills/napkin-format/` on the human's machine — copy from there or bundle separately

## Native module concern

The CLI is a standalone Node script. `nap init` needs to create SQLite database, which means importing `better-sqlite3`. But the CLI currently has no native module dependency — it's pure Node. Options:
* Use the same `better-sqlite3` that's compiled for Electron (may have ABI mismatch with system Node)
* Use system `sqlite3` CLI to create the database: `sqlite3 .nap/nap.db < schema.sql`
* Bundle a separate `better-sqlite3` compiled for system Node

The `sqlite3` CLI approach is simplest — macOS ships it. Create a `.sql` file from the schema and run it via child_process.
