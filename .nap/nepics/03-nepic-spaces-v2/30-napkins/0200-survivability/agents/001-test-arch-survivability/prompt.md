You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.spec.md`
3. **Mega napkin**: `.nap/nepics/03-nepic-spaces-v2/10-docs/01-inputs.nap.md`

### Essential context

4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — understand the model, bridge, fakes, fixtures, and existing tests from 0100/0150
5. **0150 test cases**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0150-model-stress-test/0150-model-stress-test.test.md` — the testing patterns and equivalence approach you should follow
6. **v2 pty management**: `packages/v2/src/main/main.ts` lines 155-222 — how ptys work today
7. **v2 Terminal component**: `packages/v2/src/renderer/components/Terminal.tsx` — what the renderer does with terminals
8. **v2 app lifecycle**: `packages/v2/src/main/main.ts` lines 857-1116 — startup, resume, quit

### Key aspects of this napkin

- Three STOP→RUN cases (A: resume, B: skip exited, C: fresh start) — each needs test coverage
- RUN→STOP must NOT write exited flags — this is the key difference from v2
- Real ptys are involved — medium tests spawn actual processes
- Full model entity shapes (AgentState with all fields) — tests must verify all fields flow correctly
- Small/medium equivalence pattern from 0150 continues — same journeys, both layers

## Your job

Design test cases for 0200. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/agents/001-test-arch-survivability/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
