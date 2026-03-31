You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Polish napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0600-polish/0600-polish.nap.md` — look at the "napkin content rendering" item
2. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly — especially KanbanOverlay.tsx, model.ts (how bullets are parsed), bridge-types.ts (NapkinState shape)

One item to fix: napkin content rendering in the kanban.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit when done

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0600-polish/agents/002-fs-eng-polish/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
