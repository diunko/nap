You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.spec.md`
3. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`
4. **v2 NapkinBrowser** (the reference implementation): `packages/v2/src/renderer/components/NapkinBrowser.tsx` — the focused/extended rendering you're designing tests for
5. **Designer screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/` — read ALL images + voiceover.nap.md
6. **Design thinking with human comments**: `.nap/nepics/03-nepic-spaces-v2/20-architects/001-architect/scratch/02-sidebar-zoom-thinking.nap.md` — read the `//` and `//A:` comments for context on decisions
7. **Bug bash learnings**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/agents/002-fs-eng-debug/response.md` — testing insights from live usage

### Key aspects

This napkin has three parts: sidebar zoom (UI), filesystem watcher wiring (infrastructure), debug panel tabs (tooling). Design tests for all three.

The bug bash revealed: tests that encode wrong assumptions pass green. Design tests from requirements, not from imagined implementation. Test the state matrix for dot colors (started × done × exited × running → which color?).

Interactive flows cross IPC boundaries — use the intent/snapshot round-trip pattern from 0150/0200 for small tests. Medium tests verify real Electron rendering.

## Your job

Design test cases for 0400. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/agents/001-test-arch-zoom/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
