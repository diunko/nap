You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.spec.md`
3. **User stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.stories.md`
4. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.test.md`
5. **TA response** (critical seams): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/001-test-arch-archived/response.md`
6. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly

The TA identified 5 critical seams — read their response. Pay special attention to:
- Resume logic ordering (archived checked before started/exited)
- Sidebar click guard (current `if (agent.started)` blocks archived agents)
- Fast exit heuristic (requires BOTH timing AND output message)

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/002-fs-eng-archived/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
