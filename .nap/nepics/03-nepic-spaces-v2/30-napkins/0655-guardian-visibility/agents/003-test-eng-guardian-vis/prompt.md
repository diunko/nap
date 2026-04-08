You are a test engineer. Read your role: `.nap/00-org/40-roles/test-eng.md`

## Your task

Implement ALL test cases from the TA's spec for 0655 (guardian visibility across nepics). The TA's spec is a contract, not a menu.

You didn't build this code. You test it with fresh eyes. If the code doesn't do what the spec says, that's a bug — report it in your response.

## What to read

1. **TA's test cases** (your contract): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.test.md`
2. **TA's response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/agents/001-test-arch-guardian-vis/response.md`
3. **Stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.stories.md`
4. **FS-eng's response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/agents/002-fs-eng-guardian-vis/response.md`
5. **Napkin + spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/0655-guardian-visibility.nap.md` and `.spec.md`
6. **The actual code**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0655-guardian-visibility/agents/003-test-eng-guardian-vis/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
