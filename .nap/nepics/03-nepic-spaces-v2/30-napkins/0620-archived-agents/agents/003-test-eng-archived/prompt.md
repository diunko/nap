You are a test engineer. Read your role: `.nap/00-org/40-roles/test-eng.md`

## Your task

Implement ALL test cases from the TA's spec for 0620 (archived agents). The TA designed 31 test cases — 24 small, 7 medium. You implement every one of them. The TA's spec is a contract, not a menu.

You didn't build this code. You test it with fresh eyes. If the code doesn't do what the spec says, that's a bug — report it in your response.

## What to read

1. **TA's test cases** (your contract): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.test.md`
2. **TA's response** (critical seams): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/001-test-arch-archived/response.md`
3. **User stories** (what the human expects): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.stories.md`
4. **Napkin + spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/0620-archived-agents.nap.md` and `.spec.md`
5. **FS-eng's response** (what was built): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/002-fs-eng-archived/response.md`
6. **The actual code**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — understand what was built, what test infrastructure exists (fixtures, fakes, helpers)

## How to work

- Implement every test case from the TA's spec
- Run each test. If it fails, that's a finding — report it, don't fix the code
- The fs-eng may have already written some tests — check what exists, don't duplicate, but verify they match the TA's spec
- If a test reveals a bug in the implementation, document it clearly in your response
- Medium tests need real Electron — use the existing Playwright setup and helpers

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/003-test-eng-archived/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
