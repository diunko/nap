You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run the test cases for 0600-live-wiring.

Read these:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.test.md` — test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/0600-live-wiring.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/002-fs-eng-wiring/response.md` — what was built

Read the code:
- `src/renderer/store.ts` — merged napkin data, kanban state
- `src/renderer/components/NapkinBrowser.tsx` — now reads from store
- `src/renderer/components/KanbanOverlay.tsx` — new
- `src/renderer/index.tsx` — IPC listeners
- `tests/helpers.ts` — Playwright helpers

Rules:
- Native modules = Playwright medium tests. Pure TS = vitest small.
- Each Playwright suite gets its own temp dir.
- For tests that need real napkin dirs on disk, create them in the temp dir's `.nap/nepics/` structure.

Run:
- `npm run test:small` — all pass
- `npm run test:medium` — all pass

Write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/003-test-eng-wiring/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
