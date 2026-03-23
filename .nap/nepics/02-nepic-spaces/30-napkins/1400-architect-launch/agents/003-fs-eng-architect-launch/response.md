# 1400-architect-launch — FS Eng Response

## What was built

### 1. `nap open --architect` launches with architect Claude session

**CLI** (`src/cli/nap.ts`):
- Added `--architect` / `-a` flag to `open` command
- `-a` short flag handled in `parseArgs`
- Flag passed through to Electron via argv

**Main process** (`src/main/main.ts`):
- Parses `--architect` flag from argv
- In `app.whenReady()`: if `--architect`, finds active nepic → finds architect session (status 'new' or 'running') → builds `claude --verbose --session-id <uuid> "read .nap/nepics/<slug>/20-architects/001-architect/prompt.md and follow its instructions"`
- Display name: `[Architect] <name>` if `--name` provided, `[Architect]` otherwise
- Sets `resumedArchitectSession` so renderer picks it up via `get-resume-data`
- Falls back to shell with warning if no architect session found
- Structured as if/else with existing auto-resume (mutually exclusive paths)

**Renderer** (`src/renderer/index.tsx`):
- If `opts.architect` is true, finds the architect terminal (already added via `getResumeData`) and activates it instead of creating a shell

**Session store** (`src/main/session-store.ts`):
- Added `getArchitectForNepicLaunch(nepicId)` — finds architect with status 'new' or 'running'
- Added `getActiveNepicId()` — finds nepic with is_active=1

**Types** updated in `preload.ts`, `electron-api.d.ts`, `nap-test.d.ts`.

### 2. (+) Nepic creation uses template prompt

**Main process** (`src/main/main.ts`):
- `handleNepicCreate` now copies from `src/templates/nepic/` instead of writing hardcoded prompt
- Copies both `15-feedback/` and `20-architects/` from template
- Added `findTemplatesDir()` — resolves `out/main/templates/` (built) or `../../src/templates/` (dev)
- Added `copyDirRecursive()` utility

**Build** (`electron.vite.config.ts`):
- Added `copyTemplatesPlugin()` — copies `src/templates/` to `out/main/templates/` at build time

### 3. T-1000-09 amended

Changed assertion from `containsNepicName` (checking for interpolated nepic name) to `containsRoleRef` (checking for `'Read your role'` — static template content).

## Test results

- `npm run typecheck` — zero errors
- `npm run test:small` — 140 passed, 1 skipped (unchanged)
- `npm run test:medium` — 216 passed, 4 skipped, 2 failed (T-0600-08, T-0600-10 — pre-existing failures, confirmed by running baseline)

## Decisions

- `--architect` and auto-resume are mutually exclusive (if/else) — `--architect` is for fresh launch after `nap init`, auto-resume is for subsequent `nap open` without the flag
- `getArchitectForNepicLaunch` queries for status IN ('new', 'running') — the `nap init` session has status='new', so `getArchitectForNepic` (which only finds 'running') wouldn't find it
- Template path in the architect command uses project-root-relative path (`.nap/nepics/<slug>/...`) with `cwd: projectCwd`, matching the spec
- The `copyTemplatesPlugin` in vite config copies the full `src/templates/` tree, not just `nepic/` — future-proofs for any template usage in main process
