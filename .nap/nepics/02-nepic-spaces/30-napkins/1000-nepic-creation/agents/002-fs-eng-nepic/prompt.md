You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement nepic creation — the (+) button that creates a fresh nepic space.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.test.md`

Read the design reference:
1. Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png`
2. Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`

Read existing code:
- `src/renderer/components/Gutter.tsx` — (+) button
- `src/main/main.ts` — startup, session handling
- `src/main/session-store.ts` — nepics table
- `src/main/database.ts` — schema

What to build:
1. IPC handler for `nepic:create` — receives name, scaffolds dirs, inserts SQLite row
2. Directory scaffolding: 10-docs/, 15-feedback/, 20-architects/001-architect/, 30-napkins/, 40-board/ with status subdirs
3. Architect prompt template in 20-architects/001-architect/prompt.md
4. Architect session: generate UUID, spawn `claude --verbose --session-id <uuid> "read prompt.md ..."`
5. SQLite: INSERT nepic with is_active=1, UPDATE all others to is_active=0
6. Gutter: (+) click triggers name input (simple prompt or inline input), sends IPC
7. UI update: gutter re-renders, sidebar clears to new nepic, terminal shows architect
8. Run `npm run typecheck` — zero errors

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/agents/002-fs-eng-nepic/response.md`, then run `nap done` (no message).
