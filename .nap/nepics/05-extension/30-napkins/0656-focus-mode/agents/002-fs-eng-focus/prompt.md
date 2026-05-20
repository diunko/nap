Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react architecture
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — persisted state
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.nap.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.spec.md`
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.stories.md`

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/0656-focus-mode.test.md` — read the debugging scenarios FIRST
- `.nap/nepics/05-extension/30-napkins/0656-focus-mode/agents/001-test-arch-focus/response.md`

## Read the code deeply

You're modifying the Sidebar, store, and header. Read these yourself:

- `packages/ext-react/src/Sidebar.tsx` — current card rendering, how napkins display
- `packages/ext-react/src/store.ts` — focusedCardSlug, cardViewMode, expandCard, extendCard
- `packages/ext-react/src/nav-tree.ts` — how architects and napkins are parsed into sections
- `packages/ext-react/src/index.tsx` — HeaderBar, keyboard shortcuts, layout
- `packages/v3/src/renderer/Sidebar.tsx` — how the app renders architects above napkins with separator, ArchitectCard component, three card tiers with maxDepth
- `packages/v3/src/renderer/store.ts` — expandCard, extendCard, focusCard in the app

Don't limit yourself. Follow imports, read adjacent code.

## Your task

Build focus mode. Run debugging scenarios at each step. Verify log traces. Own the quality.

1. **Store:** add `focusMode: boolean` to state + `toggleFocusMode` action. Persist via partialize. Initial value: `true`. Write the vitest cases from the test.md.

2. **Sidebar:** render architects section above napkins with separator (when in show-all mode). In focus mode, filter to only the card matching `focusedCardSlug`. Architect cards use the same three tiers as napkin cards (collapsed/focused/extended via maxDepth). Remove "show others" / "hide others" text toggle.

3. **Header:** add focus-toggle button between refresh-pr and settings. Wire Ctrl+Shift+F shortcut. Icon changes based on mode.

4. **Focus follows clicks:** `expandCard` already sets `focusedCardSlug`. Verify that clicking an architect card also sets it. Toggling to focus mode shows whatever card was last expanded.

5. **Run debugging scenarios** from the test.md. Read the console traces. Fix the pipeline before signaling done.

6. **Run all existing tests** — no regressions.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0656-focus-mode/agents/002-fs-eng-focus/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
