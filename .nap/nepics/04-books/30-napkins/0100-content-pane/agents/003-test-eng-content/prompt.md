You're the test engineer for the 0100-content-pane feature. Read your role in `.nap/00-org/40-roles/test-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0100-content-pane/`):
1. `0100-content-pane.spec.md` — the spec
2. `0100-content-pane.test.md` — the test architecture (your primary reference — implement ALL cases)

Read what the fullstack engineer built:
1. `.nap/nepics/04-books/30-napkins/0100-content-pane/agents/002-fs-eng-content/response.md` — what was built and decisions made
2. `packages/v3/src/renderer/routing-rules.ts` — pure routing function
3. `packages/v3/src/renderer/store.ts` — store changes (activeFilePath, openFile)
4. `packages/v3/src/renderer/napkin-markdown.ts` — monarch tokenizer
5. `packages/v3/src/renderer/ContentPane.tsx` — left content pane
6. `packages/v3/src/renderer/TerminalPane.tsx` — right pane wrapper
7. `packages/v3/src/renderer/index.tsx` — three-column layout
8. `packages/v3/src/main/main.ts` — file content IPC
9. `packages/v3/src/main/preload.ts` — exposed API

Read existing test patterns:
- `packages/v3/tests/` — look at how existing small tests (.test.ts) and medium tests (.spec.ts) are structured
- Small tests use MemoryFileSystem, FakePtySpawner, FakeBridge, direct store manipulation
- Medium tests use Playwright with real Electron

## What to produce

Implement ALL test cases from `0100-content-pane.test.md`. The test architecture has 25 cases across 6 areas:

1. **Routing rules (R01-R04)** — small tests in `tests/routing-rules.test.ts`
2. **Store changes (S01-S07)** — small tests in `tests/content-store.test.ts`
3. **Monaco/tokenizer (M01-M06)** — medium tests in `tests/content-monaco.spec.ts`
4. **File watching (W01-W04)** — small tests in `tests/content-watching.test.ts` + medium in `tests/content-watching.spec.ts`
5. **Layout (L01-L06)** — medium tests in `tests/content-layout.spec.ts`
6. **Nav routing (N01-N06)** — medium tests in `tests/content-nav.spec.ts`

## Running tests

Small tests:
```bash
cd packages/v3 && npx vitest run tests/routing-rules.test.ts
cd packages/v3 && npx vitest run tests/content-store.test.ts
cd packages/v3 && npx vitest run tests/content-watching.test.ts
```

Medium tests (require build first):
```bash
cd packages/v3 && npm run build && npm run build:cli && NAP_TEST=1 npx playwright test tests/content-monaco.spec.ts
```

Run small tests first. Get them passing. Then medium tests.

When a test fails, run just that test until it passes. Full suite once at the end.

If a test case from test.md is impossible given the code as written, say so in your response — that's valuable signal.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0100-content-pane/agents/003-test-eng-content/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
