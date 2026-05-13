You're the test architect for the 0300-qol-tweaks feature. Read your role in `.nap/00-org/40-roles/test-architect.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0300-qol-tweaks/`):
1. `0300-qol-tweaks.nap.md` — the napkin
2. `0300-qol-tweaks.spec.md` — the spec
3. `0300-qol-tweaks.stories.md` — user journeys
4. `scratch/00-input.nap.md` — raw usage observations with design threads (good context)

Read what 0100 and 0200 built (your feature modifies this code):
- `packages/v3/src/renderer/ContentPane.tsx` — left pane (adding rendered mode, fixing git gutter)
- `packages/v3/src/renderer/TerminalPane.tsx` — right pane (terminal tab refactor)
- `packages/v3/src/renderer/store.ts` — tab state (terminal tab refactor)
- `packages/v3/src/renderer/napkin-markdown.ts` — tokenizer (comment color tweak)
- `packages/v3/src/renderer/themes.ts` — if it exists, or this is a new file
- `packages/v3/src/renderer/index.tsx` — layout, keybindings
- `packages/v3/src/renderer/file-link-provider.ts` — terminal link routing
- `packages/v3/src/renderer/routing-rules.ts` — routeLink()
- `packages/v3/src/renderer/git-gutter.ts` — git gutter decorations

Read existing tests to understand patterns:
- `packages/v3/tests/` — all existing test files

Explore the codebase broadly before designing tests.

## What to produce

Write `0300-qol-tweaks.test.md` at:
`.nap/nepics/04-books/30-napkins/0300-qol-tweaks/0300-qol-tweaks.test.md`

This feature has seven areas:

1. **Tab size** — trivial, verify editor config
2. **Terminal link routing** — links from terminal route through routeLink() instead of shell.openPath
3. **Theme system** — theme rotation, CSS variables, persistence, role color adjustment
4. **Terminal tab refactor** — single permanent slot, title updates, no accumulation
5. **Git gutter bug fixes** — refresh on model update, on focus, race fix
6. **Rendered mode** — markdown-it parse, HTML render, source line mapping, Cmd+click to edit, link routing in rendered view, role comment styling
7. **Tokenizer tweak** — bare // same color as //DU:

Each test case: flow, subsystems, expected behavior, where it breaks, test size, verification.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0300-qol-tweaks/agents/001-test-arch-qol/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
