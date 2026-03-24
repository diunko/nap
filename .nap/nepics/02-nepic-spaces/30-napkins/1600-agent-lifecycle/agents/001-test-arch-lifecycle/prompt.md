You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test strategy for 1600-agent-lifecycle — a large refactoring that changes how sessions are tracked, resumed, and rendered. This covers session schema changes, `nap start claude` detection, appIsClosing flag, home directory model, card rendering, nap ps redesign, and auto-resume of all claude sessions.

Read the system design — this is the authoritative spec:
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/63-agent-lifecycle.nap.md`

Read the roadmap for sequencing:
- `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/64-agent-lifecycle-roadmap.nap.md`

Read existing code extensively — use your internal research/explore agents to understand:
- `src/main/main.ts` — pty lifecycle, startup, quit
- `src/main/session-store.ts` — session queries, schema
- `src/renderer/store.ts` — terminal state
- `src/renderer/components/NapkinBrowser.tsx` — card rendering
- `src/cli/nap.ts` — nap start, nap ps
- ALL test files in `tests/` — understand what exists

**Your specific questions to answer:**

1. **Test strategy during refactoring.** One fs-eng will implement everything in one session. What should they do about existing tests that break during refactoring?
   - Option A: keep all tests passing at every step (expensive, constant fixing)
   - Option B: break intentionally, fix after implementation complete
   - Option C: something else?
   Recommend one approach with reasoning.

2. **Which existing tests will break?** Audit and list them, with why they break.

3. **New test cases.** Design the essential tests for the new system — covering all four phases (schema, ps tree, home dir cards, auto-resume). Keep it focused: what are the 10-15 tests that verify the new system works?

4. **Test architecture.** Should new tests be in one file or split by phase? What fixtures/helpers are needed?

Write your full strategy to `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/1600-agent-lifecycle.test.md`.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
