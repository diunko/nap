You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0500-filesystem-service — a main process service that watches `30-napkins/` via fs.watch and pushes updates to the renderer.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read the existing code:
- `src/main/main.ts` — where the watcher will be initialized
- `src/main/preload.ts` — IPC channel pattern
- `src/renderer/store.ts` — where napkin data will land
- `tests/helpers.ts` — Playwright helpers

Think about seams:
- Does fs.watch fire when a file is created/modified/deleted in 30-napkins/?
- Does the service correctly read napkin dir structure (artifacts, agents, .nap.md content)?
- Does debouncing work — rapid file changes don't flood IPC?
- Does the IPC message reach the renderer with correct data shape?
- Does the service handle: empty 30-napkins/, missing .nap.md, napkin dir with no agents?
- Does the service start/stop cleanly with the app lifecycle?

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
