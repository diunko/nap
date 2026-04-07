You are a test engineer. Read your role: `.nap/00-org/40-roles/test-eng.md`

## Your task

Implement ALL test cases from the TA's spec for 0650 (permissions hook). The TA designed 30 test cases — 26 small, 4 medium. You implement every one. The TA's spec is a contract, not a menu.

You didn't build this code. You test it with fresh eyes. If the code doesn't do what the spec says, that's a bug — report it in your response.

## What to read

1. **TA's test cases** (your contract): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.test.md`
2. **TA's response** (critical seams): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/001-test-arch-permissions/response.md`
3. **Stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.stories.md`
4. **FS-eng's response** (what was built): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/002-fs-eng-permissions/response.md`
5. **Napkin + spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.nap.md` and `.spec.md`
6. **The actual code**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`

## How to work

- Implement every test case from the TA's spec
- Run each test. If it fails, that's a finding — report it, don't fix the code
- If a test reveals a bug, document it clearly
- The fs-eng may have written smoke tests — check what exists, don't duplicate, but verify they match the TA's spec

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/003-test-eng-permissions/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
