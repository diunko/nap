You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.spec.md`
3. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`
4. **v2 KanbanOverlay**: `packages/v2/src/renderer/components/KanbanOverlay.tsx`
5. **v2 Gutter**: `packages/v2/src/renderer/components/Gutter.tsx`
6. **Designer screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/` — screenshot 01 (gutter), screenshot 04 (kanban)
7. **Designer voiceover**: same dir, `voiceover.nap.md` — sections "01" and "04"

### This is the final napkin

After this, the designer's screenshots are a live product. Test the complete experience — kanban shows the right cards in the right columns, → navigates correctly, gutter switches nepics, (+) creates a new one.

## Your job

Design test cases for 0500. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/0500-kanban-nepics.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0500-kanban-nepics/agents/001-test-arch-kanban/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
