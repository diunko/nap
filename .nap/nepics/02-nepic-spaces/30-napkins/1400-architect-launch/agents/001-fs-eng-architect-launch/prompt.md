You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: two fixes — (1) `nap open --architect` launches with architect Claude session, (2) (+) nepic creation uses template prompt.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/1400-architect-launch.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/1400-architect-launch.spec.md`

Read the code:
- `src/cli/nap.ts` — open command, add --architect and --name flags
- `src/main/main.ts` — argv parsing (parseArgvFlag pattern), first terminal creation, nepic creation handler
- `src/main/session-store.ts` — getArchitectForNepic
- `src/templates/nepic/` — the template prompt.md

What to build:
1. CLI: `nap open --architect --name Nova` passes `--architect` and `--name Nova` to Electron
2. Main process: if `--architect` flag present, first terminal runs `claude --verbose --session-id <uuid> "read .../prompt.md..."` instead of shell. Display name: `[Architect] <name>` or `[Architect]`.
3. (+) handler: copy prompt.md from templates instead of hardcoded string. Copy feedback templates too.
4. Templates need to be accessible from the built app — check if electron-vite bundles `src/templates/` or if you need to configure it.
5. Run `npm run typecheck` — zero errors

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/agents/001-fs-eng-architect-launch/response.md`, then run `nap done` (no message).
