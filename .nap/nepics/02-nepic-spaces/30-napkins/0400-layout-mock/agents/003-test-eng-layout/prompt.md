You're a test engineer on the NAP project. Read your role in `.nap/00-org/40-roles/test-eng.md`.

Your task: implement and run the test cases for 0400-layout-mock.

Read these:
1. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.test.md` — 12 test cases
2. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.spec.md` — the spec
3. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/agents/002-fs-eng-layout/response.md` — what was built (note: old Sidebar test selectors need updating)

Read the code:
- `src/renderer/components/Gutter.tsx` — new
- `src/renderer/components/NapkinBrowser.tsx` — new
- `src/renderer/components/Terminal.tsx` — breadcrumb added
- `src/renderer/store.ts` — browser state added
- `src/renderer/mock-data.ts` — mock data
- `tests/helpers.ts` — Playwright helpers

Rules:
- Native modules = Playwright medium tests. Pure TS/React = vitest small.
- Each Playwright suite gets its own temp dir via `--cwd`.
- Update any existing tests that reference old Sidebar selectors (`sidebar-filter`, `agent-card`) to use new ones (`browser-filter`, `napkin-card`).

Implement:
- Small tests in `tests/layout-mock.test.ts` (T-0400-01, T-0400-04, T-0400-08, T-0400-10, T-0400-11)
- Medium tests in `tests/layout-mock.spec.ts` (T-0400-02, T-0400-03, T-0400-05, T-0400-06, T-0400-07, T-0400-09)
- T-0400-12 is regression — just run the full suite and verify

Run:
- `npm run test:small` — all pass
- `npm run test:medium` — all pass

Report failures with specifics.

Write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/agents/003-test-eng-layout/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
