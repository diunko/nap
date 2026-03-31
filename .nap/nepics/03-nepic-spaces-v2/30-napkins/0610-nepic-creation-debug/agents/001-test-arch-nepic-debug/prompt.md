You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Bug napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/0610-nepic-creation-debug.nap.md` — 7 bugs + 2 fixes to design tests for
2. **Expected flow**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/expected-flow.md`
3. **Designer journeys**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/j1-clicking-plus.md` and `j5-clicking-plus.md`
4. **Full designer journeys**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/00-journeys.nap.md`
5. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`
6. **Bug bash learnings**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/agents/002-fs-eng-debug/response.md` — testing insights from prior bugs

### What makes this different from a normal TA pass

These are bugs found during real use — not hypothetical scenarios. Your job is to design tests that:
- Would have CAUGHT these bugs before the human found them
- Guard against REGRESSIONS — if someone changes nepic creation code, these tests break
- Test CROSS-NEPIC isolation — creating/switching nepics shouldn't corrupt the other nepic's state
- Think about the state matrix: what should every entity's state be BEFORE and AFTER nepic creation?

The deeper question: what does a healthy multi-nepic app look like? What invariants should always hold?

## Your job

Design test cases for 0610. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/0610-nepic-creation-debug.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/agents/001-test-arch-nepic-debug/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
