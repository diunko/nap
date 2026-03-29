You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/0100-model-layer.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/0100-model-layer.spec.md`
3. **Mega napkin** (the full vision): `.nap/nepics/03-nepic-spaces-v2/10-docs/01-inputs.nap.md`

### Essential context — read these to understand WHY we're building a model layer

This napkin is a hypothesis validation. The previous version (v2) had 232 passing tests but broken user journeys. The thinking that led to this approach is documented in the previous architect's (Nova's) directory:

4. **Reflection + discussion**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/70-reflection-and-new-direction.nap.md` — read the `//` and `//AN:` inline comments, they're the real content
5. **2-state model + journey testing**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/72-reflection-and-new-direction.nap.md`
6. **s→r transition as testable function**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/73-reflection-and-new-direction.nap.md`
7. **Testing patterns from t3code**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/reference/t3code-testing-patterns-catalog.md` — patterns 1, 4, and 5 directly apply

Also study the v2 codebase in `packages/v2/src/` to understand what exists, how the current tests work, and where the integration gaps were.

## Your job

Design test cases for 0100. Your output shapes how the fs-eng builds the model API and how the TE writes the tests. You're not just testing "does it work" — you're validating the hypothesis: **can we test full journeys on the model with fake sources, no Electron, in vitest?**

Think about:
- What fixture structure exercises the model meaningfully (which dirs, which marker files, which scenarios)
- What the model's test surface looks like — what do you assert on after loading?
- How the bridge round-trip is tested — model change → bridge → renderer state
- What's the minimum playwright smoke test that proves the real Electron stack works
- What edge cases matter (missing markers, empty dirs, exited agents, no architects)

## Process

- Write your test cases to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/0100-model-layer.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0100-model-layer/agents/001-test-arch-model/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
