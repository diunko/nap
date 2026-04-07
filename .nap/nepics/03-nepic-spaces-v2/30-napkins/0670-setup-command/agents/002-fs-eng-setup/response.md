# FS Engineer Response — 0670 Setup Command

## What was built

### `nap3 setup` command

New CLI command in `packages/v3/src/cli/nap.ts` supporting three flags:

- `--guardian` — creates guardian agent in active nepic's `20-architects/002-guardian/`, writes `.claude/settings.json` with PermissionRequest hook config. Idempotent: skips if marker exists, always ensures settings.json has hook.
- `--skills` — copies napkin + napkin-format skills from templates to `.claude/skills/` (or `~/.claude/skills/` with `--user`). Overwrites existing (removes old dir first for clean template updates).
- `--import` — walks all `nepics/*/`, creates markers for unmarked napkins (`backlog` status), agents (with role inference, done detection from response.md), and architects (no napkin field). Purely additive: never modifies existing markers, never deletes.

### Shared extraction

Extracted 5 module-level functions from the `init` case block:

1. `getActiveNepicDir(cwd)` — reads ui-state.json, returns active nepic path
2. `inferRole(dirName)` — strips leading `\d+-` prefix from dir name
3. `setupGuardian(cwd, nepicDir, templatesDir)` — guardian creation + settings merge
4. `setupSkills(cwd, templatesDir, user)` — skill copying with overwrite
5. `setupImport(cwd)` — full project scan + marker creation

`init --guardian` and `init --add-skills` now delegate to the shared functions. This ensures T-0670-24 (identical output between init and setup paths).

### Test infrastructure

`packages/v3/tests/cli-setup.test.ts` — 27 small tests covering:

- Guard: setup without .nap/ → error (T-01)
- Guardian: create, prompt copy, settings write, settings merge, idempotent (T-02–T-06)
- Skills: copy, overwrite (T-07–T-08)
- Import: napkin markers, skip existing, agent fields, role inference, done detection, empty skip, skip existing markers, architect markers, unique UUIDs, multi-nepic, no-delete (T-10–T-20)
- Combined flags (T-21), no-flags usage (T-22)
- Edge cases: response-only agent, init/setup equivalence, multi-nepic guardian, no-prefix role, deep nesting, timestamps (T-23–T-30)

Skipped: T-09 (--skills --user → writes to ~/.claude, needs global cleanup — left for TE), T-27 and T-28 (medium tests requiring Electron app).

## Decisions

1. **Guardian idempotency**: Check marker existence, not settings.json. If marker exists → skip agent creation. Settings.json is always written (idempotent overwrite). This covers the common case cleanly.
2. **Skills overwrite**: `rm -rf` the old skill dir before copying. This ensures canary files (T-08) and stale files are removed. Different from guardian (skip), matching the spec's intent.
3. **Import empty check**: `fs.readdirSync().length === 0`. Any file (including hidden) makes a dir non-empty. Only truly empty dirs are skipped.
4. **Setup with no flags**: Shows help/usage and exits with code 1. More user-friendly than silent no-op.
5. **Import order with combined flags**: Guardian runs first, then skills, then import. Import correctly skips the just-created guardian (it already has a marker).

## Test results

- 272 small tests pass (245 existing + 27 new)
- 43 medium tests pass (all existing)
- Zero type errors (`tsc --noEmit`)
