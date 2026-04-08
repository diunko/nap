You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0710-doctor-command/0710-doctor-command.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0710-doctor-command/0710-doctor-command.spec.md`
3. **The two source files the doctor reads at runtime**:
   - `packages/v3/src/templates/doctor/diagnostic.md`
   - `packages/v3/src/templates/00-org/50-internals.md`

Study how `nap3 dev` and `nap3 open` resolve paths in `packages/v3/src/cli/nap.ts` before building.

All work goes in `packages/v3/`.

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit frequently

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0710-doctor-command/agents/001-fs-eng-doctor/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
