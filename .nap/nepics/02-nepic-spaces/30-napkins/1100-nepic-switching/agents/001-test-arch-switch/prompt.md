You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 1100-nepic-switching — clicking a nepic icon in the gutter to swap the sidebar and terminal context.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read existing code:
- `src/renderer/components/Gutter.tsx`
- `src/renderer/store.ts` — activeNepicId
- `src/main/napkin-watcher.ts` — needs to switch watched directory
- `src/main/main.ts`
- `tests/helpers.ts`

Seams:
- Does clicking a nepic icon swap activeNepicId in store?
- Does the sidebar re-render with the new nepic's napkins?
- Does the terminal switch to the new nepic's architect?
- Does the filesystem watcher switch to the new nepic's 30-napkins/?
- Do sessions from the old nepic keep running?
- Does gutter highlight move to the clicked icon?

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
