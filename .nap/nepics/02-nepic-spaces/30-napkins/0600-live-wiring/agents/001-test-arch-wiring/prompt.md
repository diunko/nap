You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0600-live-wiring — connecting real filesystem data and SQLite statuses to the React components, plus the kanban overlay (Cmd+`).

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Look at the design reference:
- Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
- Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`

Read the existing code:
- `src/main/napkin-watcher.ts` — filesystem service (from 0500)
- `src/main/napkin-store.ts` — status API (from 0300)
- `src/renderer/store.ts` — zustand store with browser state (from 0400)
- `src/renderer/components/NapkinBrowser.tsx` — currently using mock data (from 0400)
- `src/renderer/mock-data.ts` — what's being replaced
- `tests/` — existing patterns

Seams to test:
- Filesystem service IPC → store update → sidebar re-renders with real napkin data
- SQLite status → store → sidebar shows correct phase badges
- Agent status changes (nap done) → dots update in real-time
- Kanban overlay: Cmd+` toggle, columns render from real data, cards show .nap.md bullets
- Kanban → navigation: click card → dismiss overlay, scroll sidebar, switch terminal
- Breadcrumb updates with real napkin/agent data (not mock)
- New file created by agent → fs.watch fires → sidebar updates artifact list

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
