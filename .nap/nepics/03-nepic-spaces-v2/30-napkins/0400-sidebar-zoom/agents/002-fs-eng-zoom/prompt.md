You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.spec.md`
3. **Test cases** (from TA): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/0400-sidebar-zoom.test.md`
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` thoroughly
5. **v2 NapkinBrowser** (reference for focused/extended rendering): `packages/v2/src/renderer/components/NapkinBrowser.tsx`
6. **Designer screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`
7. **Design thinking**: `.nap/nepics/03-nepic-spaces-v2/20-architects/001-architect/scratch/02-sidebar-zoom-thinking.nap.md` — read all `//` and `//A:` comments

**IMPORTANT — dot colors**: The napkin specifies dot colors by ROLE (orange=TA, green=FS, gray=TE, blue=default), NOT by status. Status is encoded in shape (filled=running, dashed+checkmark=done, hollow-gray=exited). The TA's test cases may reference status-based colors — follow the NAPKIN, not the test cases, for dot color logic. The current implementation already uses role colors — keep it, don't change it.

**IMPORTANT — design carry-over**: copy v2 inline styles verbatim for focused/extended views. Don't redesign.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0400-sidebar-zoom/agents/002-fs-eng-zoom/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
