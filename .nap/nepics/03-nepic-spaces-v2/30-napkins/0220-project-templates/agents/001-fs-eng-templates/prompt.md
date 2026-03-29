You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/0220-project-templates.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/0220-project-templates.spec.md`
3. **Current nap3 init**: `packages/v3/src/cli/nap.ts` — the init command you're extending
4. **Current templates**: `packages/v3/src/templates/` — where templates live
5. **Architect prompt template**: `packages/v3/src/templates/nepic/20-architects/001-architect/prompt.md` — needs a line about seed napkins
6. **Example of a good mega-napkin**: `.nap/nepics/03-nepic-spaces-v2/10-docs/01-inputs.nap.md` — this is what a real mega-napkin looks like. Study the format, depth, and structure. Your seed napkins should match this quality.

The main deliverable is the seed mega-napkins. The CLI changes are small. Spend most of your time writing great napkins — they should be rich enough that an architect could start building from them immediately.

All work goes in `packages/v3/`.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0220-project-templates/agents/001-fs-eng-templates/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
