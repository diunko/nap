Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react architecture
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — persisted state
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.nap.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.spec.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.stories.md` — 10 stories

## Read the code

Read the current Sidebar, store, and existing tests deeply:

- `packages/ext-react/src/Sidebar.tsx` — how cards render now, what sections exist, how expandCard works
- `packages/ext-react/src/store.ts` — focusedCardSlug, cardViewMode, expandCard, extendCard actions
- `packages/ext-react/src/nav-tree.ts` — how architects vs napkins are parsed into sections
- `packages/ext-react/src/index.tsx` — header bar, keyboard shortcuts
- `packages/v3/src/renderer/Sidebar.tsx` — how the app renders architects + napkins, the separator, card tiers
- `packages/v3/src/renderer/store.ts` — expandCard, extendCard, cardViewMode in the app

Read existing tests:
- `packages/ext-react/src/__tests__/store.test.ts` — IS-02 card focus tests
- `packages/ext-react/e2e/tests/` — all Playwright tests

Explore freely — don't limit yourself to listed files.

## Your task

Own the test architecture. This feature adds:
1. Focus mode toggle (focusMode boolean, Ctrl+Shift+F)
2. Show-all mode with architects section + separator + napkins
3. Focus follows clicks (focusedCardSlug tracks last expanded)
4. Three card tiers for both napkins AND architects (collapsed/focused/extended)
5. Persistence of focusMode + focusedCardSlug + cardViewMode

Think about:
- **Store tests (vitest):** focusMode toggle, focus follows expandCard, persistence round-trip
- **Playwright tests:** the stories describe real user flows. Which need automated tests vs which are covered by existing tests?
- **Debugging scenarios:** what should the fs-eng verify at each step?
- **Regressions:** existing card behavior must not break. Existing Playwright tests use `.napkin-card` selectors — will architect cards need different selectors?

Write `0656-focus-mode.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0656-focus-mode/agents/001-test-arch-focus/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
