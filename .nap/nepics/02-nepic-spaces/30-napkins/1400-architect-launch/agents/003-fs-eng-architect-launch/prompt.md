You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: two fixes — (1) `nap open --architect` launches with architect Claude session, (2) (+) nepic creation uses template prompt.

Read these in order:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/1400-architect-launch.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/1400-architect-launch.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/agents/002-test-arch-launch/response.md` — test audit, READ THIS — tells you exactly which tests are safe, which need amendment

Read the code:
- `src/cli/nap.ts` — open command, add --architect and --name flags
- `src/main/main.ts` — argv parsing (parseArgvFlag pattern), first terminal creation, nepic creation handler
- `src/main/session-store.ts` — getArchitectForNepic
- `src/templates/nepic/` — the template prompt.md

What to build:
1. CLI: `nap open --architect --name Nova` passes flags to Electron
2. Main process: if `--architect`, first terminal runs `claude --verbose --session-id <uuid> "read prompt.md..."`. Display name: `[Architect] <name>`.
3. (+) handler: copy prompt.md from templates instead of hardcoded string
4. Amend T-1000-09: template is static (no nepic name interpolation), so change the assertion from `containsNepicName` to checking for template content (e.g., `toContain('read your role')`)
5. Templates must be accessible from built app — may need electron-vite config to copy `src/templates/` to output
6. Run `npm run typecheck`
7. Run `npm run test:small` — all pass
8. Run `npm run test:medium` — all pass

The test audit confirms: all existing tests are safe due to flag isolation. Only T-1000-09 needs amendment.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/agents/003-fs-eng-architect-launch/response.md`, then run `nap done` (no message).
