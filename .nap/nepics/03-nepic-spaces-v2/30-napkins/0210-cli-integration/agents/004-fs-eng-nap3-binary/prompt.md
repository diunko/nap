You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## Task

Rename the v3 package and binary so it can be globally linked without conflicting with the stable `nap` CLI at `~/nap-app/`. Package name: `nap-v3` (symmetric with `nap-v2`). Binary name: `nap3` (symmetric with `nap2`).

## What to do

1. Read `packages/v3/package.json` — change `"name"` from `"nap"` to `"nap-v3"` and `"bin"` from `"nap"` to `"nap3"`
2. Read `packages/v3/src/cli/nap.ts` — update any help text, command name references from `nap` to `nap3`
3. Search all files in `packages/v3/src/` for hardcoded references to the `nap` command name that should become `nap3` (help text, error messages, etc.)
4. Search `packages/v3/src/templates/` — update any template files that reference the `nap` command to use `nap3` instead (workflow docs, role docs, prompt templates)
5. Update the root `package.json` — workspace scripts use `-w packages/v3` (path-based, should be fine). But verify all still work after the rename.
6. Make sure `npm run build:cli -w packages/v3` still works
7. Run `npm run test:v3:small` and `npm run test:v3:medium` — all must pass
8. Run `npm run typecheck:v3` — must pass
9. After everything passes, run `npm link -w packages/v3` to create the global `nap3` symlink
10. Verify: `which nap3` should point to the v3 CLI, `which nap` should still point to ~/nap-app/

**Important**: Do NOT touch packages/v2/ or the root nap link. Only v3 changes.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit when done

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/004-fs-eng-nap3-binary/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
