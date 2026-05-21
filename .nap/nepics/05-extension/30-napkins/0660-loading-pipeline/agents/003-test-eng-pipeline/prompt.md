Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Required reading

**Principles:** `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/principles.nap.md` — testing philosophy for this feature.

## The feature

- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.nap.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.spec.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.stories.md`
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/0660-loading-pipeline.test.md` — TA plan (37 cases, 4 layers)
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/agents/002-fs-eng-pipeline/response.md` — what was built

## Read the code

- `packages/ext-react/src/pipeline.ts` — the pure runner
- `packages/ext-react/src/pipeline-steps.ts` — 8 step factories
- `packages/ext-react/src/LoadingGate.tsx` — UI component
- `packages/ext-react/src/index.tsx` — how pipeline wires into the app
- `packages/ext-react/src/model.ts` — simplified (no auto-clone guards)
- `packages/ext-react/src/__tests__/pipeline.test.ts` — 22 existing vitest tests

Read deeply, explore freely.

## Your task

1. **Run everything.** Confirm 158 tests pass. Build. Run Playwright.

2. **Implement layer 4 from the test.md: Playwright tests (LP-P01..P08).** The TA designed 8 browser-level tests:
   - LP-P01: fresh visit — loading gate shows steps progressing, then unmounts
   - LP-P02: return visit — steps fly through, < 3s
   - LP-P03: auth failure — clone step shows error + hint + retry button
   - LP-P04: retry after entering token — clone succeeds on second try
   - LP-P05: mid-flight close + reopen — fresh pipeline, no partial state
   - LP-P06: loading gate step list — DOM shows correct step states
   - LP-P07: retry-all — cleanup + restart
   - LP-P08: skip logic — return visit skips clone step (shown as done)

3. **Implement deferred tests from the fs-eng:**
   - LP-S31: scanner never sees `.tmp-*` as valid repo (dotfile filter property)
   - LP-S28: session creation IDB full (mock LightningFS to throw QuotaExceededError)

4. **Fix bugs you find.** The fs-eng built the pipeline and ran vitest but may not have fully tested the Playwright path.

5. **Verify no regressions.** All existing Playwright tests must still pass — the boot flow changed fundamentally.

Write response.md, then `nap3 done`.
