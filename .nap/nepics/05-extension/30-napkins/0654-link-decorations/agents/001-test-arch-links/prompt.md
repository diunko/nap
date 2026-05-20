Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react architecture
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0654-link-decorations/0654-link-decorations.nap.md`
- `.nap/nepics/05-extension/30-napkins/0654-link-decorations/0654-link-decorations.stories.md`

## Read the code

This feature lives entirely in ContentPane.tsx and content-link-provider.ts. Read both deeply:

- `packages/ext-react/src/ContentPane.tsx` — how Monaco is created, how role decorations work (refreshRoleDecorations), the onMouseDown handler for link clicks, how decorations are managed
- `packages/ext-react/src/content-link-provider.ts` — `detectLinks` function that finds all three link types with priority

Also read how the app does link decoration:
- `packages/v3/src/renderer/content-link-provider.ts` — the app's link provider (for reference, but we're NOT using ILinkProvider — we're using decorations)
- `packages/v3/src/renderer/ContentPane.tsx` lines 277-305 — refreshRoleDecorations pattern (this is the pattern we're extending for links)

Read the existing tests:
- `packages/ext-react/src/__tests__/` — all vitest suites
- `packages/ext-react/e2e/tests/` — all Playwright tests

Don't limit yourself to these files. Explore freely.

## Your task

The feature adds:
1. Always-on link underlines via deltaDecorations (same pattern as role decorations)
2. Cmd+hover state change (pointer cursor + blue) via temporary decorations + mouse events
3. Decorations update on content change

Design tests for this. Think about:

- **What's pure logic?** `detectLinks` is already tested. The decoration *ranges* are derived from detectLinks output — is there a new testable seam, or does the existing detectLinks coverage handle it?
- **What needs the real editor?** The Cmd+hover behavior needs real Monaco mouse events. Is that testable in Playwright or too brittle (pixel coordinates, hover timing)?
- **What's the debugging scenario?** The fs-eng needs to verify decorations actually render. What Playwright check confirms link text has the right CSS class?
- **What's NOT worth testing?** Decoration color values, cursor shape, CSS specifics.

Write `0654-link-decorations.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0654-link-decorations/agents/001-test-arch-links/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
