You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.spec.md`
3. **Approved CLI design** (the authoritative reference): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/001-cli-design/03-cli-design.nap.md`
4. **Test cases** (from TA — shapes your API): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.test.md`
5. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly
6. **v2 code to port**: `packages/v2/src/main/socket-server.ts`, `packages/v2/src/main/name-resolver.ts`, `packages/v2/src/main/message-queue.ts`, `packages/v2/src/cli/nap.ts`

This is the biggest napkin. The test cases document lists 10 infrastructure items you must build. Read the "Test infrastructure" section carefully.

**CRITICAL — CLI design**: the `agents/001-cli-design/03-cli-design.nap.md` defines exact command syntax, flags, output formats, and error messages. Follow it precisely.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently — this is a large task, commit after each major piece

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/003-fs-eng-cli/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
