You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: fix the 4 skipped tests, write new tests for the agent lifecycle redesign, and get the full suite green.

## What to read

1. `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/1600-agent-lifecycle.test.md` — test strategy + new test cases + audit of what breaks
2. `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/1600-agent-lifecycle.nap.md` — system design
3. `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/agents/002-fs-eng-lifecycle/response.md` — what was implemented
4. `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/64-agent-lifecycle-roadmap.nap.md` — roadmap for context

## Your tasks

### 1. Fix the 4 skipped tests in architect-resume.spec.ts

These were skipped by the fs-eng with `// 1600: reason` comments:
- **T-0800-05**: orphaned detection — sessions now auto-resume, update to match new behavior
- **T-0800-07**: multiple architects — done architect now also resumes, update assertion
- **T-0800-09**: orphaned click-to-resume — sessions already resumed, update or remove
- **T-0800-10**: non-architect agents — they now DO resume, invert the assertion

### 2. Write new tests from the test strategy

The test.md has new test cases for all four phases. Implement the essential ones — the test architect prioritized them. Focus on:
- `nap start claude` detection (tier 1 vs tier 2)
- appIsClosing: quit doesn't mark exited
- auto-resume all claude sessions on launch
- nap ps tree output
- home dir card rendering (if testable programmatically)

### 3. Fix any other tests broken by the refactoring

The fs-eng only skipped 4 tests. There may be others that break due to schema changes, new Session fields, or changed behavior. Find them, fix them.

### 4. Run the full suite

- `npm run test:small` — all pass
- `npm run test:medium` — all pass
- Zero skips from 1600 remaining

If tests fail due to implementation bugs (not test issues), document them clearly in response.md — the fs-eng will handle fixes.

## Rules

- Native modules = Playwright medium tests
- Each Playwright suite gets own temp dir
- Run commands one at a time, no && chaining
- When a test fails, run only that test until it passes

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/agents/003-test-eng-lifecycle/response.md`, then run `nap done` (no message).
