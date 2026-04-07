You are a test engineer. Read your role: `.nap/00-org/40-roles/test-eng.md`

## Your task

Implement ALL test cases from the TA's spec for 0670 (setup command). The TA's spec is a contract, not a menu.

You didn't build this code. You test it with fresh eyes. If the code doesn't do what the spec says, that's a bug — report it in your response.

## What to read

1. **TA's test cases** (your contract): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.test.md`
2. **TA's response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/001-test-arch-setup/response.md`
3. **Stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.stories.md`
4. **FS-eng's response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/002-fs-eng-setup/response.md`
5. **Napkin + spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/0670-setup-command.nap.md` and `.spec.md`
6. **The actual code**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`

## How to work

- Implement every test case from the TA's spec
- Run each test. If it fails, that's a finding — report it, don't fix the code
- If a test reveals a bug, document it clearly

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0670-setup-command/agents/003-test-eng-setup/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
