# 1300-nap-init — Test Architecture (trimmed)

## Setup

All tests in vitest with temp directories. No Electron. `nap init` is a standalone CLI command — spawn as child process.

SQLite verification via system `sqlite3` CLI. No `better-sqlite3` import.

Helper: `runInit(tmpdir, ...flags)` → `{ exitCode, stdout, stderr }`

---

## T-1300-01: Happy path — full directory structure

Run `nap init` in empty dir. Verify all expected dirs and files exist:
- `.nap/nap.db`, `.nap/.gitignore`
- `.nap/00-org/` with all docs and roles
- `.nap/nepics/01-v1/` with all subdirs (10-docs, 15-feedback, 20-architects, 30-napkins, 40-board with status subdirs)
- Architect prompt.md exists

Size: small. Verification: `fs.existsSync` for every expected path.

---

## T-1300-02: Guard — fails if .nap/ exists

Create `.nap/` dir manually, run `nap init`. Exit code non-zero. Stderr contains "already initialized". Nothing inside `.nap/` modified.

Size: small. Verification: exit code, stderr match, snapshot contents unchanged.

---

## T-1300-03: SQLite — schema and seed data

Run `nap init`, query the database:
- Tables exist: nepics, napkins, sessions, ui_state
- 1 nepic row: name='v1', slug='01-v1', is_active=1
- 1 session row: name='001-architect', role='architect', cc_session_uuid is non-null UUID
- Session's nepic_id matches nepic's id

Size: small. Verification: `sqlite3 .nap/nap.db "SELECT ..."` via child process.

---

## T-1300-04: Skills flags

Three sub-cases:
- `nap init` (no flags) → `.claude/skills/` does NOT exist
- `nap init --add-skills` → `.claude/skills/napkin/` and `.claude/skills/napkin-format/` exist in project dir, with non-empty main skill file
- `nap init --add-skills --user` (with HOME overridden to tmpdir) → skills in `$HOME/.claude/skills/`, NOT in project `.claude/skills/`

Size: small. Verification: `fs.existsSync` for presence/absence.

---

## T-1300-05: nap open — fails without .nap/

Run `nap open .` in a dir with no `.nap/`. Exit code non-zero. Stderr contains "nap init". Does NOT spawn Electron.

Size: small. Verification: exit code, stderr match, no child processes spawned.
