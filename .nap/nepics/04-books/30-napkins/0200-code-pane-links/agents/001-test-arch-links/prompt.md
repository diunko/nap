You're the test architect for the 0200-code-pane-links feature. Read your role in `.nap/00-org/40-roles/test-architect.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md` — how the app, model, renderer, and pty system work

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0200-code-pane-links/`):
1. `0200-code-pane-links.nap.md` — the napkin (includes design discussion threads)
2. `0200-code-pane-links.spec.md` — the spec
3. `0200-code-pane-links.stories.md` — user journeys

Read what 0100 built (your feature builds on top of this):
1. `.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.spec.md`
2. `.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.test.md` — the 0100 test architecture
3. `.nap/nepics/04-books/30-napkins/0100-content-pane/agents/003-test-eng-content/response.md` — bugs found, findings, scaling notes on tabs

Read the existing code and test infrastructure:
- `packages/v3/src/renderer/routing-rules.ts` — current routing (you're extending it)
- `packages/v3/src/renderer/ContentPane.tsx` — left pane (link provider goes here)
- `packages/v3/src/renderer/TerminalPane.tsx` — right pane (becoming mixed)
- `packages/v3/src/renderer/store.ts` — current store (adding tab state)
- `packages/v3/src/renderer/file-link-provider.ts` — existing regex patterns for file:line links
- `packages/v3/src/renderer/napkin-markdown.ts` — tokenizer (shift-enter keybinding goes here or nearby)
- `packages/v3/tests/` — existing test patterns

Explore the codebase broadly before designing tests.

## What to produce

Write `0200-code-pane-links.test.md` at:
`.nap/nepics/04-books/30-napkins/0200-code-pane-links/0200-code-pane-links.test.md`

This feature has six areas:

1. **Link provider + routing** — link classification, path resolution, three link types
2. **Right pane mixed surface** — terminal OR code, mode switching, line highlight
3. **Tabs** — ephemeral/pinned semantics, both panes, tab lifecycle, per-nepic memory
4. **Git gutter** — diff parsing, decorations, re-run on save
5. **Shift-enter continuation** — indent/bullet/prefix detection, break-out
6. **Code file watching** — right pane updates on external change

Each test case should specify: flow, subsystems, expected behavior, where it's likely to break, test size, verification method.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0200-code-pane-links/agents/001-test-arch-links/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
