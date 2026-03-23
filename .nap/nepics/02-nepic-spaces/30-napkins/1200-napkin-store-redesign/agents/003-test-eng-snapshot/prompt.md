You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 1200-napkin-store-redesign.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/agents/002-fs-eng-snapshot/response.md`

Read the code:
- `src/main/napkin-watcher.ts` — rewritten readNapkinDir
- `src/renderer/store.ts` — new types
- `src/renderer/components/NapkinBrowser.tsx` — renders from entries
- `tests/` — existing patterns, some tests may need updating for new types

Rules: native modules = Playwright. Each suite gets own temp dir. Run commands one at a time. When a test fails, run only that test until it passes.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/agents/003-test-eng-snapshot/response.md`, then run `nap done` (no message).
