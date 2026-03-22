You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run tests for 0800-architect-resume.

Read:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.test.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/0800-architect-resume.spec.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/agents/002-fs-eng-resume/response.md`

Read the code:
- `src/main/main.ts` — startup resume logic
- `src/renderer/store.ts` — orphaned state
- `src/renderer/components/NapkinBrowser.tsx` — orphaned dot rendering
- `tests/helpers.ts`

Rules: native modules = Playwright. Each suite gets own temp dir. Run commands one at a time, no && chaining.

Run `npm run test:small` and `npm run test:medium` — all pass.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/0800-architect-resume/agents/003-test-eng-resume/response.md`, then run `nap done` (no message).
