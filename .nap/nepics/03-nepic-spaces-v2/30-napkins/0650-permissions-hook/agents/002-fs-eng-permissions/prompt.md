You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.spec.md`
3. **Stories**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.stories.md`
4. **TA test cases + gaps**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/0650-permissions-hook.test.md`
5. **TA response**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/001-test-arch-permissions/response.md`
6. **CC hooks reference**: `.nap/nepics/03-nepic-spaces-v2/20-architects/001-architect/scratch/permissions/00-cc-hooks.nap.md`
7. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/`

The TA identified 13 gaps — 2 critical (hanging socket, env propagation). Read the spec for exact implementation guidance on each.

Build the feature + test infrastructure. The TE will implement the full test suite — you may write smoke tests but the comprehensive suite is the TE's job.

Follow the implementation order from the spec: model → socket handler → CLI → env propagation → renderer → guardian scaffold.

All work goes in `packages/v3/`. All existing tests must still pass.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after each major piece (model, socket, CLI, renderer, etc.)

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0650-permissions-hook/agents/002-fs-eng-permissions/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
