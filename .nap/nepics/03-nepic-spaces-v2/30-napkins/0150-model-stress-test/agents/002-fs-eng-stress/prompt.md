You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.spec.md`
3. **Test cases** (from TA — shapes your API): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.test.md`
4. **What exists in v3**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — understand the current model, bridge, fakes, fixtures, and tests thoroughly before building

The test cases document defines the exact infrastructure you must build (MemoryFileSystem v2, Model v2, fixtures, test hooks). Read the "Test infrastructure the fs-eng must build" section carefully.

All work goes in `packages/v3/`. All existing 0100 tests must still pass after your changes.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/agents/002-fs-eng-stress/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
