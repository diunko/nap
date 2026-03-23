You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement nepic switching — clicking a nepic icon in the gutter swaps the sidebar and terminal context.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/1100-nepic-switching.test.md`

Read existing code:
- `src/renderer/components/Gutter.tsx` — click handler
- `src/renderer/store.ts` — activeNepicId, napkins
- `src/main/main.ts` — IPC handlers
- `src/main/napkin-watcher.ts` — needs to switch directories
- `src/main/session-store.ts` — query sessions by nepic

What to build:
1. Gutter click handler → IPC to main → update activeNepicId in SQLite
2. Main process: switch napkin watcher to new nepic's `30-napkins/`
3. Main process: send new nepic's sessions and napkin data to renderer
4. Renderer: store updates activeNepicId → sidebar re-renders with new nepic's data
5. Terminal: switch to new nepic's architect (or last viewed agent)
6. Old nepic's sessions keep running (ptys don't care about UI focus)
7. Gutter: highlight moves to clicked icon
8. Run `npm run typecheck` — zero errors

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/agents/002-fs-eng-switch/response.md`, then run `nap done` (no message).
