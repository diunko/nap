You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0800-architect-resume — auto-resuming the architect on app restart and showing orphaned agent states.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read the existing code:
- `src/main/main.ts` — startup, pty spawning
- `src/main/session-store.ts` — sessions with cc_session_uuid
- `src/renderer/store.ts` — terminal state
- `src/renderer/components/NapkinBrowser.tsx` — agent dot rendering
- `tests/helpers.ts` — Playwright helpers

Seams:
- Does architect auto-resume with `claude --resume <uuid>` on app restart?
- Do orphaned agents (status=running in SQLite, no live pty) show distinct visual?
- Does it handle: no uuid (legacy session), expired CC session, multiple architects?
- Does the architect terminal become active on launch?

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.test.md`.

IMPORTANT: When running bash commands, run them one at a time. Do not chain commands with && or ;. This avoids permission issues.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
