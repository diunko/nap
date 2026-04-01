You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## The bug

When a user clicks a non-archived agent whose CC session has expired, `pty:resume` in main.ts spawns `claude --resume <uuid>`, it fails with "No conversation found", and the user sees an empty terminal with a blinking cursor. No successor prompt, no error handling.

The resume failure detection (fast exit + "No conversation found" in output) only exists in `startAgents` (coordinators.ts). The `pty:resume` IPC handler in main.ts has none.

## How to fix it

**Test-driven. This is the order:**

1. **Research**: read ALL files in `packages/v3/src/` — especially `main.ts` (the `pty:resume` handler), `coordinators.ts` (the working detection in `startAgents`), `node-pty-spawner.ts` (the `detectionBuffer`), and the TE's response at `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/003-test-eng-archived/response.md` which identified this gap.

2. **Write a test that reproduces the bug**: a medium test that launches the app with a fixture containing an agent with a dead UUID, clicks the agent in the sidebar (triggering `pty:resume`), and asserts that the successor prompt appears. This test should FAIL with the current code.

3. **Verify the test fails**: run it, confirm it fails for the right reason (no detection → empty terminal instead of successor prompt).

4. **Fix the bug**: add resume failure detection to the `pty:resume` handler. Same pattern as `startAgents` — track spawn time, check `detectionBuffer` for "No conversation found" on fast exit, mark agent as archived, push snapshot.

5. **Verify the test passes**: run it again, confirm the fix works.

6. **Run all tests**: make sure nothing else broke.

All work goes in `packages/v3/`.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after writing the failing test, commit after the fix

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0620-archived-agents/agents/004-fs-eng-resume-detection/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
