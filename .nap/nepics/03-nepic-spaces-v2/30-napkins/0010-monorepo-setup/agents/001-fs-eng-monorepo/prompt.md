You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## Your task

Restructure this repo into a monorepo with two packages (v2 and v3) side by side. Read the napkin and spec carefully, then do your own thorough research of the codebase before writing any code.

## What to read

1. **Napkin** (what to achieve): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0010-monorepo-setup/0010-monorepo-setup.nap.md`
2. **Spec** (constraints): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0010-monorepo-setup/0010-monorepo-setup.spec.md`

## Research first

Before writing any code, you MUST explore the existing codebase thoroughly:

- Read `package.json` — understand all scripts, deps, bin config
- Read `electron.vite.config.ts` — understand how the build chain works, what plugins run, how paths resolve
- Read `tsconfig.json`, `tsconfig.cli.json`, `tests/tsconfig.json` — understand TypeScript project structure
- Read `vitest.config.ts` or check how vitest is configured
- Read `playwright.config.ts` — understand how medium tests find the app
- Read `src/cli/nap.ts` lines 488-520 — the `nap open` electron resolution logic you need to fix
- Read `src/main/preload.ts` — understand the IPC bridge
- Check what's in `src/templates/` — v2 needs these copied during build
- Run `ls` on root to see all top-level files that need to move or stay

Understand how everything fits together BEFORE you start moving files. The risk with this task is breaking something subtle in the build chain or test setup.

## Approach

1. Research (as above)
2. Move v2: move all app code into `packages/v2/`, update configs so everything resolves from the new location
3. Verify v2: make sure build, typecheck, and tests pass from the new location
4. Scaffold v3: create `packages/v3/` with minimal Electron app, configs, smoke tests
5. Wire root: create root package.json with workspaces and proxy scripts
6. Verify everything: run all the done criteria from the napkin

## Important

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently — don't accumulate a massive uncommitted diff
- If something breaks during the move, stop and fix it before continuing
- The v2 tests must pass exactly as before — this is a restructure, not a refactor
- Test the CLI resolution: `npx nap open .` and `npx nap2 open .` should both work (though the apps may not fully function without the right project setup — the key is that electron launches)

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0010-monorepo-setup/agents/001-fs-eng-monorepo/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
