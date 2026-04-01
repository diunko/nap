You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.spec.md`
3. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly — especially model.ts, coordinators.ts, node-pty-spawner.ts, Sidebar.tsx, the CLI
4. **v2 architect resume fallback**: `packages/v2/src/main/main.ts` lines 189-199 — the pattern for detecting failed resumes

Read the napkin's scratch/ dir for iteration history if you need context on decisions.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/001-fs-eng-archived/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
