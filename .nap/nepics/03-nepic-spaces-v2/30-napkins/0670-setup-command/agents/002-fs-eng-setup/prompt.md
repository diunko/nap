You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.spec.md`
3. **Stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.stories.md`
4. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.test.md`
5. **TA response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/001-test-arch-setup/response.md`
6. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — especially nap.ts CLI (init command), guardian setup from 0650

Build the feature + test infrastructure. The TE will implement the full test suite. Extract shared logic between `init` and `setup` — don't duplicate code.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/002-fs-eng-setup/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
