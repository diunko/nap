You're the test engineer for the 0200-code-pane-links feature. Read your role in `.nap/00-org/40-roles/test-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0200-code-pane-links/`):
1. `0200-code-pane-links.spec.md` — the spec
2. `0200-code-pane-links.test.md` — the test architecture (implement ALL cases)

Read what the fullstack engineer built:
`.nap/nepics/04-books/30-napkins/0200-code-pane-links/agents/002-fs-eng-links/response.md`

Then read the actual code — all new and modified files listed in the response. The key files:
- `packages/v3/src/renderer/routing-rules.ts` — `routeLink()`, `parseLinkHref()`
- `packages/v3/src/renderer/content-link-provider.ts` — link detection + dispatch
- `packages/v3/src/renderer/store.ts` — tab state, `openCode`, `openDoc`, `closeTab`, `pinTab`
- `packages/v3/src/renderer/TabBar.tsx` — tab bar component
- `packages/v3/src/renderer/TerminalPane.tsx` — mixed surface, code editor, line highlight
- `packages/v3/src/renderer/ContentPane.tsx` — link handling, git gutter, shift-enter
- `packages/v3/src/renderer/napkin-markdown.ts` — `detectLinePattern()`, shift-enter keybinding
- `packages/v3/src/renderer/git-gutter.ts` — decoration application
- `packages/v3/src/main/git-diff-parser.ts` — `parseGitDiff()`
- `packages/v3/src/main/main.ts` — new IPC handlers
- `packages/v3/src/main/preload.ts` — exposed API

Read existing test patterns:
- `packages/v3/tests/` — especially the 0100 tests for patterns

## What to produce

Implement ALL test cases from `0200-code-pane-links.test.md`. The test architecture has 37 cases across 6 areas. Organize into files:

1. **Link routing** — small tests in `tests/link-routing.test.ts`
2. **Right pane** — small in `tests/right-pane-store.test.ts`, medium in `tests/right-pane.spec.ts`
3. **Tabs** — small in `tests/tabs-store.test.ts`, medium in `tests/tabs.spec.ts`
4. **Git gutter** — small in `tests/git-diff-parser.test.ts` + `tests/git-gutter.test.ts`, medium in `tests/git-gutter.spec.ts`
5. **Shift-enter** — small in `tests/shift-enter.test.ts`, medium in `tests/shift-enter.spec.ts`
6. **Code file watching** — small in `tests/code-watching.test.ts`, medium in `tests/code-watching.spec.ts`

## Running tests

Small tests:
```bash
cd packages/v3 && npx vitest run tests/link-routing.test.ts
cd packages/v3 && npx vitest run tests/tabs-store.test.ts
cd packages/v3 && npx vitest run tests/git-diff-parser.test.ts
cd packages/v3 && npx vitest run tests/shift-enter.test.ts
```

Medium tests (require build first):
```bash
cd packages/v3 && npm run build && npm run build:cli && NAP_TEST=1 npx playwright test tests/right-pane.spec.ts
```

Run small tests first. Get them passing. Then medium tests.

When a test fails, run just that test until it passes. Full suite once at the end.

If a test case is impossible given the code, say so in your response.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0200-code-pane-links/agents/003-test-eng-links/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
