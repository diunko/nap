You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/0660-raw-keys.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/0660-raw-keys.spec.md`
3. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/0660-raw-keys.test.md`
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — especially message-queue.ts, socket-handler.ts, nap.ts CLI, name-resolver.ts

Build the feature + test infrastructure (key parser function, any fixtures needed). The TE will implement the full test suite from the TA's spec — you may write a few smoke tests but the comprehensive suite is the TE's job.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/agents/002-fs-eng-keys/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
