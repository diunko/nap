You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Bug napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/0610-nepic-creation-debug.nap.md`
2. **Test cases** (from TA — includes root cause hypotheses): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/0610-nepic-creation-debug.test.md`
3. **TA response** (code analysis and insights): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/agents/001-test-arch-nepic-debug/response.md`
4. **Expected flow**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/expected-flow.md`
5. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly

The TA identified likely root causes for most bugs. Read their response carefully — it will save you investigation time.

## Dev setup

- Human tests with `NAP_CWD=~/dvl/tmp/fun12 npm run dev:v3` from repo root
- Renderer changes hot-reload. Main process changes need restart — tell the human.
- `nap3` CLI globally linked.
- To rebuild CLI: `npm run build:cli -w packages/v3`

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after each bug fix — don't batch

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/agents/002-fs-eng-nepic-debug/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
