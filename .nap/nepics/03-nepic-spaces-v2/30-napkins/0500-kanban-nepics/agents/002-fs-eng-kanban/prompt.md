You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.spec.md`
3. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.test.md`
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly
5. **v2 components to port**: `packages/v2/src/renderer/components/KanbanOverlay.tsx`, `packages/v2/src/renderer/components/Gutter.tsx`
6. **Designer screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/` — screenshot 01 (gutter), screenshot 04 (kanban), voiceover.nap.md

**IMPORTANT — design carry-over**: copy v2 inline styles verbatim for KanbanOverlay and Gutter. The designer's screenshots are the visual spec. Don't redesign.

**IMPORTANT — this is the final napkin**: after this, the designer's screenshots are a live product. Make it count.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/agents/002-fs-eng-kanban/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
