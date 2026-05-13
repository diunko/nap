You're the test engineer for the 0300-qol-tweaks feature. Read your role in `.nap/00-org/40-roles/test-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0300-qol-tweaks/`):
1. `0300-qol-tweaks.spec.md` — the spec
2. `0300-qol-tweaks.test.md` — the test architecture (implement ALL cases)

Read what the fullstack engineer built:
`.nap/nepics/04-books/30-napkins/0300-qol-tweaks/agents/002-fs-eng-qol/response.md`

Then read the actual code — key files:
- `packages/v3/src/renderer/themes.ts` — theme definitions
- `packages/v3/src/renderer/markdown-renderer.ts` — rendered mode
- `packages/v3/src/renderer/store.ts` — theme state, render mode, terminal tab sentinel
- `packages/v3/src/renderer/ContentPane.tsx` — git gutter fixes, rendered mode integration
- `packages/v3/src/renderer/index.tsx` — keybindings, terminal link routing
- `packages/v3/src/renderer/file-link-provider.ts` — exported extractPathAndLocation
- `packages/v3/src/renderer/routing-rules.ts` — routeLink for absolute paths
- `packages/v3/src/renderer/napkin-markdown.ts` — theme removed (moved to themes.ts)

Read existing test patterns:
- `packages/v3/tests/` — all existing test files

## What to produce

Implement ALL test cases from `0300-qol-tweaks.test.md` — 22 cases across 7 areas.

## Running tests

Small tests:
```bash
cd packages/v3 && npx vitest run tests/<filename>.test.ts
```

Medium tests:
```bash
cd packages/v3 && npm run build && npm run build:cli && NAP_TEST=1 npx playwright test tests/<filename>.spec.ts
```

Run small tests first. Get them passing. Then medium tests.

When a test fails, run just that test until it passes. Full suite once at the end.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0300-qol-tweaks/agents/003-test-eng-qol/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
