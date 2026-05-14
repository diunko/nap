You're the test engineer for 0320-session-and-render. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0320-session-and-render/`):
1. `0320-session-and-render.spec.md`
2. `0320-session-and-render.test.md` — implement ALL 16 cases

Read what was built:
`.nap/nepics/04-books/30-napkins/0320-session-and-render/agents/002-fs-eng-session/response.md`

Then read the code:
- `packages/v3/src/renderer/store.ts` — tab ghost state, persistFullUiState, loadPersistedUiState
- `packages/v3/src/renderer/ContentPane.tsx` — rendered refresh, scroll sync
- `packages/v3/src/renderer/scroll-sync.ts` — findClosestSourceLine, sync functions
- `packages/v3/src/renderer/TabBar.tsx` — ghost tab styling
- `packages/v3/src/main/ghost-watcher.ts` — GhostWatcher
- `packages/v3/src/main/main.ts` — ghost IPC, save/load ui-state
- `packages/v3/src/renderer/index.tsx` — beforeunload save, ghost-appeared listener

Existing test patterns: `packages/v3/tests/`

## Produce

Implement all 16 test cases. Small tests (vitest), medium tests (Playwright).

Run small tests first, get them passing. Then medium.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0320-session-and-render/agents/003-test-eng-session/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
