You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: wire real data into the React components — replace mock data with filesystem service + SQLite, and add the kanban overlay (Cmd+`).

Read these in order:
1. `.nap/00-org/10-promise.nap.md` — what NAP is
2. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.test.md` — test architecture

**Design reference (mandatory read):**
1. Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
2. Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
3. HTML mocks for kanban: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

Read the existing code:
- `src/main/napkin-watcher.ts` — filesystem service (0500)
- `src/main/napkin-store.ts` — status API (0300)
- `src/main/session-store.ts` — session data with SQLite
- `src/renderer/store.ts` — zustand store with browser state (0400)
- `src/renderer/components/NapkinBrowser.tsx` — currently mock data (0400)
- `src/renderer/mock-data.ts` — what's being replaced
- `src/renderer/index.tsx` — layout, IPC listeners

What to build:
1. **Store integration** — `src/renderer/store.ts`
   - Add `napkinData: NapkinData[]` fed by `napkin:update` IPC
   - Merge with session statuses (from existing `socket:status-changed` IPC)
   - NapkinBrowser reads from this merged state, not mock-data.ts
2. **NapkinBrowser update** — read from store instead of mock data
   - Architects from session data (role='architect')
   - Napkins from napkinData + napkin statuses from SQLite
   - Agent dots from session statuses (running/done/exited)
3. **Kanban overlay** — `src/renderer/components/KanbanOverlay.tsx`
   - Cmd+` toggle (store: `kanbanVisible`)
   - Slides down from top, full width, above terminal
   - Five columns: backlog, todo, doing, review, done
   - Cards: collapsed (name + dots + →) and expanded (napkin bullets + artifact badges)
   - → click: dismiss overlay, scroll sidebar to card, switch terminal
   - Match design sprint screenshots exactly
4. **Breadcrumb** — update to use real session/napkin data instead of mock derivation
5. **IPC wiring** in `src/renderer/index.tsx`
   - Listen for `napkin:update` → update store
   - Listen for `napkin:status-changed` → update store
   - Existing `socket:status-changed` already works for agent dots
6. **Remove mock-data dependency** from NapkinBrowser (keep file for reference/testing)
7. Run `npm run typecheck` — zero errors

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/002-fs-eng-wiring/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
