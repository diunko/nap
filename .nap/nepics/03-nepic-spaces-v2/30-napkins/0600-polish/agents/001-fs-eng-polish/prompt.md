You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Polish napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0600-polish/0600-polish.nap.md`
2. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly
3. **v2 reference for headless tests**: `packages/v2/src/main/main.ts` — search for `show: false`, `HEADED`, `ready-to-show`

Three items to fix. All straightforward.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after each fix

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0600-polish/agents/001-fs-eng-polish/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
