Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — package architecture
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.nap.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.spec.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.stories.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.test.md` — TA test plan (PB-S01..S02, PB-M01..M03, PB-P01..P08)

## What the fs-eng built

- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/agents/002-fs-eng-panel-boot/response.md`

The fs-eng reports 116 vitest passing. They implemented all 5 components: boot-gate, tab-url-reader, content-script-trim, refresh-pr, idle-pane. They also implemented PB-S01, PB-S02, PB-M01, PB-M02, PB-M03 vitest tests.

## Read the code

Before writing tests, read the new/changed code:

- `packages/ext-react/src/boot-gate.ts` — NEW: pure `resolveBootState` function
- `packages/ext-react/src/index.tsx` — App rewritten: boot gate, tab-url-reader, session after config
- `packages/ext-react/src/model.ts` — config at construction, refreshPr, simplified checkAutoClone
- `packages/ext-react/src/content.ts` — trimmed to ~35 lines
- `packages/ext-react/src/ContentPane.tsx` — IdlePane, link click fallback
- `packages/ext-react/src/session.ts` — createSession(key, config)
- `packages/ext-react/src/store.ts` — activeSurface default changed to 'editor'
- `packages/ext-react/e2e/tests/fixtures.ts` — updated helpers for boot-gate flow
- `packages/ext-react/e2e/tests/ww-workflow-wiring.test.ts` — existing WW-P01..P07

Read fixture content:
- `fixtures/.nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md`
- `fixtures/README.md`

## Your task

1. **Run everything.** Confirm 116 vitest pass. Run existing Playwright tests to find regressions.

2. **Implement PB-P01 through PB-P08** from the test.md:
   - PB-P01: gate → SESSION (normal start, hash in URL)
   - PB-P02: gate → MESSAGE (github, no hash)
   - PB-P03: gate → MESSAGE (not github)
   - PB-P04: auto-clone gate test (first visit)
   - PB-P05: return visit — IDB restore
   - PB-P06: refresh PR button
   - PB-P07: idle pane (DOM: editor visible, terminal hidden, repo/branch shown)
   - PB-P08: content script fallback — link clicks work without content script

3. **Fix bugs you find.** The fs-eng flagged: hostname check is strict (github.com only), persisted activeSurface migration not done.

4. **Check DOM, not just model.** The TA emphasizes: every Playwright test needs DOM assertions (visibility, text content, presence/absence of elements). Not just store state.

5. **Update existing WW Playwright tests** if they broke due to boot-gate changes. The fs-eng updated fixtures.ts and IM-01 but there may be other regressions.

6. **Report:** total pass/fail, bugs found and fixed, story coverage.

Write response.md, then `nap3 done`.
