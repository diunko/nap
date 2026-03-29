You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.spec.md`
3. **Test cases** (from TA — shapes your API): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.test.md`
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly
5. **v2 pty code to port**: `packages/v2/src/main/main.ts` (pty management, startup, quit), `packages/v2/src/renderer/components/Terminal.tsx`, `packages/v2/src/renderer/terminal-registry.ts`, `packages/v2/src/main/preload.ts`

The test cases document defines the infrastructure you must build (FakePtySpawner, startup/shutdown coordinators, updated model types, fixtures). Read the "Test infrastructure" section carefully.

**CRITICAL — design carry-over**: when porting v2 renderer components (Terminal, sidebar styles), copy the inline style objects verbatim. Don't redesign. See the napkin's "design carry-over" section for exact color tokens.

All work goes in `packages/v3/`. All existing 0100/0150 tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/agents/002-fs-eng-survivability/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
