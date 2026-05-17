You're the test engineer for the Chrome extension v0. Read your role in `.nap/00-org/40-roles/test-eng.md`.

## Required reading

1. `.nap/00-org/10-promise.nap.md` — why we work this way
2. `.nap/00-org/20-workflow.nap.md` — the pipeline
3. `.nap/00-org/30-structure.nap.md` — directory layout

The feature:
4. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.nap.md` — the napkin
5. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.spec.md` — constraints
6. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.stories.md` — 13 scenarios
7. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.test.md` — test architecture (20 cases, your blueprint)

The built code:
8. `packages/extension/` — the extension (read all src/ files to understand the code)
9. `packages/extension/src/__tests__/` — existing vitest small tests (29 passing)
10. `packages/extension/e2e/tests/side-panel.spec.ts` — existing Playwright medium tests (10 tests)
11. `packages/extension/e2e/playwright.config.ts` — Playwright config

The POC tests to study:
12. `packages/bash-poc/e2e/tests/terminal.spec.ts` — the cmd() helper and prompt counting patterns

The builder's report:
13. `.nap/nepics/05-extension/30-napkins/0100-v0/agents/002-fs-eng-v0/response.md`

## What to do

Your job: run all existing tests, report what passes and what fails, with specifics.

### Step 1: Run the small tests
```bash
cd packages/extension && npx vitest run
```
These should all pass (29 tests). If any fail, report the exact failure.

### Step 2: Build the extension
```bash
cd packages/extension && npm run build
```
Must succeed before Playwright tests can run.

### Step 3: Run the medium tests
```bash
cd packages/extension && npx playwright test --config e2e/playwright.config.ts
```

These are the critical ones — they test Monaco in the real extension runtime, LightningFS sharing, terminal integration. The builder wrote 10 Playwright tests. Run them and report:
- Which pass
- Which fail (with exact error messages)
- Whether the failures are code bugs, test bugs, or spec issues

### Step 4: Assess coverage against test.md

Compare the existing tests against the 20 test cases in `0100-v0.test.md`. Report:
- Which test.md cases are covered by existing tests
- Which test.md cases have no test yet
- Any gaps in the test architecture that you notice

### Step 5: Fix what you can

If tests fail due to obvious bugs (wrong selector, timing issue, path mismatch), try to fix them. If the fix is non-trivial (architectural issue, missing feature), document it in your response — don't hack around it.

## Important

- Run `npm install` in `packages/extension/` first if node_modules is missing
- The extension must be built (`npm run build`) before Playwright tests
- Playwright needs Chromium installed: `npx playwright install chromium` if needed
- You may need to install packages/extension dependencies first

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0100-v0/agents/003-test-eng-v0/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
