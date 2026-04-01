You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.spec.md`
3. **User stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.stories.md` — six concrete user journeys to design tests around
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`
5. **v2 resume fallback pattern**: `packages/v2/src/main/main.ts` lines 189-199
6. **Bug bash learnings**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/agents/002-fs-eng-debug/response.md`

### Key aspects

This napkin has TWO entry points to the same flow:
- Path A: archived flag (from import) — model skips resume, click → successor
- Path B: resume fails at runtime — detect fast exit + error message → successor

Design tests for BOTH paths. The user stories describe the journeys from the human's perspective — translate them into integration seams and journey tests.

Also design tests for the import-agents CLI command (filesystem-only, no app needed).

## Your job

Design test cases. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/001-test-arch-archived/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
