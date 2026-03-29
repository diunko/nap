You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.spec.md`
3. **Mega napkin**: `.nap/nepics/03-nepic-spaces-v2/10-docs/01-inputs.nap.md`

### Essential context — understand why this napkin exists

This is the second half of the POC. 0100 proved the read path. 0150 proves the hard stuff: async, watching, write-back, lifecycle. Read these to understand what broke v2 and why we're testing this way:

4. **0100 napkin + spec + test cases**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/` — understand what was built and tested already
5. **0100 fs-eng response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/agents/002-fs-eng-model/response.md` — what exists in v3 right now
6. **What 0100 actually built**: read `packages/v3/src/` and `packages/v3/tests/` — the actual model, bridge, fakes, fixtures, tests
7. **Nova's reflections**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/70-reflection-and-new-direction.nap.md` — read `//` and `//AN:` comments about what broke
8. **Testing patterns**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/reference/t3code-testing-patterns-catalog.md`

### Critical aspect of this napkin

You must design BOTH small and medium tests for each key journey. The small test uses model + fakes (vitest). The medium test runs the same scenario through real Electron + real IPC. Both assert the same outcomes. This proves the two approaches are equivalent — establishing the testing pattern for all future napkins.

## Your job

Design test cases for 0150. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/agents/001-test-arch-stress/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
