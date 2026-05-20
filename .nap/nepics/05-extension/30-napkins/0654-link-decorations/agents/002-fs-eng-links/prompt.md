Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0654-link-decorations/0654-link-decorations.nap.md`
- `.nap/nepics/05-extension/30-napkins/0654-link-decorations/0654-link-decorations.stories.md`
- `.nap/nepics/05-extension/30-napkins/0654-link-decorations/0654-link-decorations.test.md` — TA plan: 3 Playwright tests (LD-P01, P02, P03), implementation guidance

## Read the code

Read these files yourself before changing anything:

- `packages/ext-react/src/ContentPane.tsx` — where this feature lives. Understand how `refreshRoleDecorations` works — link decorations follow the same pattern. Read the `onMouseDown` handler. Read how `linkDecorationsRef` and `roleDecorationsRef` must be separate.
- `packages/ext-react/src/content-link-provider.ts` — `detectLinks` function. This is what you call to find link ranges.
- `packages/v3/src/renderer/ContentPane.tsx` lines 277-305 — the app's `refreshRoleDecorations` for reference.

Don't limit yourself. Follow imports, understand the decorator lifecycle.

## What to build

1. **`refreshLinkDecorations()`** in ContentPane.tsx — same pattern as `refreshRoleDecorations`. Call `detectLinks` on all lines, apply `inlineClassName: 'nap-link'` via `deltaDecorations`. Use a SEPARATE `linkDecorationsRef` (not the role one).

2. **Wire to content change** — call `refreshLinkDecorations()` from `onDidChangeModelContent`, alongside the existing `refreshRoleDecorations()` call. Also call after `setModel` (file load).

3. **CSS classes** — inject `.nap-link { text-decoration: underline; color: var(--nap-link); }` and `.nap-link-hover { color: var(--nap-accent); cursor: pointer; }` in the style setup.

4. **Cmd+hover** — `editor.onMouseMove`: when `e.event.metaKey` and mouse is over a link range, add temporary decoration with `nap-link-hover` class. On `keyup` for Meta key, clear all hover decorations. Clean up on keydown without meta too.

5. **Write LD-P01, LD-P02, LD-P03** Playwright tests per the test.md.

## Debugging

Run the Playwright tests. Read the console. Verify:
- After file load: `[contentpane] refreshLinkDecorations (N links)`
- After typing a link: decoration count increases
- Cmd+hover: `[contentpane] link-hover on line X` / `[contentpane] link-hover cleared`

Run all existing tests too — make sure decorations don't break role decorations or link clicks (IM-05, IM-06).

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0654-link-decorations/agents/002-fs-eng-links/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
