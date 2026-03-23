## Why

After `nap init`, `nap open` drops you into a bare shell. You expect an architect. And when creating nepics with (+), the prompt is a fraction of the quality of the template.

## What

1. `nap open --architect` (or `-a`) launches with architect Claude session as the first terminal.
2. (+) nepic creation uses `src/templates/nepic/` for prompt and feedback files.

## Constraints

### nap open --architect

* New flags: `--architect` / `-a`, optional `--name <name>`
* Passed to Electron via `--architect` and `--name` argv (same pattern as existing `--cwd`, `--command`)
* Main process reads argv, finds architect session in SQLite for active nepic
* Spawns first terminal as: `claude --verbose --session-id <uuid> "read .nap/nepics/<slug>/20-architects/001-architect/prompt.md and follow its instructions"`
* Terminal display name: `[Architect] <name>` if --name provided, `[Architect]` otherwise
* Without --architect: existing behavior (shell), backwards compatible
* If no architect session in SQLite (should not happen after init): fall back to shell, log warning

### (+) nepic creation template fix

* `src/main/main.ts` nepic creation handler currently generates a hardcoded prompt
* Change: copy files from `src/templates/nepic/` instead
  * `15-feedback/issues.md`
  * `15-feedback/wishlist.md`
  * `20-architects/001-architect/prompt.md`
* Template source: same `src/templates/` used by `nap init`
* In the built app, templates are at `out/main/templates/` (electron-vite bundles them)
  * May need vite config to copy templates to output

## What to read

* `src/cli/nap.ts` — `open` command, add --architect flag
* `src/main/main.ts` — argv parsing (parseArgvFlag), first terminal creation, nepic creation handler
* `src/main/session-store.ts` — getArchitectForNepic
* `src/templates/nepic/` — the templates
* `electron.vite.config.ts` — if templates need to be bundled into output

## Test reference

- Design screenshots for what architect terminal should look like: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png`
