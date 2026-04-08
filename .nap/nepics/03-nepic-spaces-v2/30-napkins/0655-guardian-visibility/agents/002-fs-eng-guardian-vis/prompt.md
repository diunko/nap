You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.spec.md`
3. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.test.md`
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — especially model.ts (loadFromFilesystem)

Small change — ~10 lines in model.ts. Build the feature + test infrastructure. The TE will implement the full test suite.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/agents/002-fs-eng-guardian-vis/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
