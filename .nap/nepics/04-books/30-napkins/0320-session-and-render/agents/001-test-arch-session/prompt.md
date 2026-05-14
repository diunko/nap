You're the test architect for 0320-session-and-render. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0320-session-and-render/`):
1. `0320-session-and-render.nap.md` — the napkin (includes design threads)
2. `0320-session-and-render.spec.md` — the spec
3. `0320-session-and-render.stories.md` — user journeys

Read existing code and tests for context:
- `packages/v3/src/renderer/store.ts` — current state, tab model, persist/restore
- `packages/v3/src/renderer/ContentPane.tsx` — rendered mode, file watching
- `packages/v3/src/renderer/markdown-renderer.ts` — markdown-it rendering
- `packages/v3/tests/` — existing patterns

Explore broadly before designing.

## Produce

`0320-session-and-render.test.md` at the napkin dir.

Three areas:
1. **Session persistence** — save/restore tabs, focused card, terminal, ghost tabs, absent file handling
2. **Rendered mode refresh** — re-render on tab switch, on external change
3. **Scroll sync** — edit→rendered y-matching, rendered→edit line mapping, cursor off-screen fallback

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0320-session-and-render/agents/001-test-arch-session/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
