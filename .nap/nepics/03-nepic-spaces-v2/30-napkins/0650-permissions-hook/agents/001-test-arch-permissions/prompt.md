You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## Your task — two parts

**Part 1: Gap review.** Read the napkin and surface any architectural gaps, ambiguities, or missing pieces. Think about: what could go wrong? what's underspecified? what edge cases aren't covered? what assumptions might be wrong?

**Part 2: Test design.** After identifying gaps, propose how each should be resolved, then design test cases assuming those resolutions. If a gap is critical (can't proceed without human input), flag it clearly.

## What to read

1. **Napkin** (the full design with data flows): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.nap.md`
2. **CC hooks reference**: `.nap/nepics/03-nepic-spaces-v2/20-architects/001-architect/scratch/permissions/00-cc-hooks.nap.md`
3. **What v3 has now**: read ALL files in `packages/v3/src/` — especially model.ts, main.ts, socket-handler.ts, Sidebar.tsx, Terminal.tsx, preload.ts
4. **Existing test patterns**: `packages/v3/tests/` — understand how socket handlers, model methods, and medium tests work

## Output format

Write to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.test.md`:

First section: **Gaps** — each gap with your proposed resolution and severity (critical/important/nice-to-have).

Second section: **Test cases** — the full test design, including tests for the gap resolutions.

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/001-test-arch-permissions/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
