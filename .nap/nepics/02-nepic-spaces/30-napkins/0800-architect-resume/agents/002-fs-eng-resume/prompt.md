You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement architect auto-resume on app restart and orphaned agent states.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.test.md`

Read the existing code:
- `src/main/main.ts` — startup sequence
- `src/main/session-store.ts` — sessions with cc_session_uuid, role field
- `src/renderer/store.ts` — terminal state
- `src/renderer/components/NapkinBrowser.tsx` — agent dots

What to build:
1. On startup after UI state restore (0700): query sessions for architect of active nepic
2. If cc_session_uuid exists: spawn `claude --resume <uuid>` in architect terminal
3. If no uuid: spawn fresh `claude` session
4. Orphaned agents: sessions with status=running but no live pty
   - Add orphaned visual state to store/rendering (dotted border, dimmed)
   - On click: option to resume via `claude --resume <uuid>`
5. Handle multiple architects (001 retired, 002 active) — resume the active one
6. Run `npm run typecheck` — zero errors

IMPORTANT: When running bash commands, run them one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/agents/002-fs-eng-resume/response.md`, then run `nap done` (no message).
