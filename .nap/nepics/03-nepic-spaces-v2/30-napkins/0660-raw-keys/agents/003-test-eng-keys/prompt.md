You are a test engineer. Read your role: `.nap/00-org/40-roles/test-eng.md`

## Your task

Implement ALL test cases from the TA's spec for 0660 (raw key sending). The TA's spec is a contract, not a menu. You implement every test case — both small and medium.

You didn't build this code. You test it with fresh eyes. If the code doesn't do what the spec says, that's a bug — report it in your response.

## What to read

1. **TA's test cases** (your contract): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/0660-raw-keys.test.md`
2. **TA's response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/agents/001-test-arch-keys/response.md`
3. **FS-eng's response** (what was built): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/agents/002-fs-eng-keys/response.md`
4. **Napkin + spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/0660-raw-keys.nap.md` and `.spec.md`
5. **The actual code**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`

## How to work

- Implement every test case from the TA's spec
- Run each test. If it fails, that's a finding — report it, don't fix the code
- If a test reveals a bug in the implementation, document it clearly in your response
- The fs-eng may have written some smoke tests — check what exists, don't duplicate, but verify they match the TA's spec

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0660-raw-keys/agents/003-test-eng-keys/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
