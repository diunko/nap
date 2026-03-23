You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 1000-nepic-creation — the (+) button that creates a new nepic space with fresh architect.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read existing code:
- `src/main/main.ts` — startup, nepic handling
- `src/main/session-store.ts` — nepics table
- `src/main/database.ts` — schema
- `src/renderer/components/Gutter.tsx` — (+) button
- `src/renderer/store.ts` — activeNepicId
- `tests/helpers.ts`

Seams:
- Does (+) click scaffold the directory structure correctly?
- Does SQLite get the new nepic row with is_active=1, others deactivated?
- Does the architect boot with correct session (cc_session_uuid, --verbose)?
- Does the UI switch (gutter highlights, sidebar clears, terminal shows architect)?
- Does it handle: first nepic ever, naming collision, missing .nap/ dir?

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/1000-nepic-creation/1000-nepic-creation.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
