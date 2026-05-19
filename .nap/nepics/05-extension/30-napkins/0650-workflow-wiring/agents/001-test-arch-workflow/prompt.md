Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these:

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react package structure
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.nap.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.spec.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.stories.md`

## The link navigation analysis

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/06-link-navigation-cases.nap.md` — 5 cases for link routing (diff view vs blob view)

## Read the code deeply

Read the ext-react source to understand what exists and how to test it:

- `packages/ext-react/src/store.ts` — current state shape, all actions
- `packages/ext-react/src/session.ts` — session factory, context
- `packages/ext-react/src/model.ts` — data pipeline
- `packages/ext-react/src/content.ts` — current content script
- `packages/ext-react/src/link-routing.ts` — current link routing
- `packages/ext-react/src/index.tsx` — app shell, session switching
- `packages/ext-react/e2e/tests/` — all existing Playwright tests
- `packages/ext-react/src/__tests__/` — all existing vitest tests

Also read the fixtures:
- `fixtures/README.md` — how fixtures work
- `fixtures/main-pr/` — the PR branch changes (order-router.ts, warp-queue.ts)
- `fixtures/.nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md` — the chapter with file:line links

Don't limit yourself to these files. Follow imports, read adjacent code, explore freely.

## Your task

Own the test architecture for the workflow wiring. This napkin adds:

1. **URL hash parsing** — content script reads `#nap-repo=...&napkin=...` from GitHub page
2. **Auto-clone** — fresh session triggers `git clone` without user typing
3. **Fetch latest** — `git fetch + checkout` to update to remote HEAD
4. **PR diff-aware link routing** — fetch PR files from GitHub API, parse hunk ranges, route to diff URL or blob URL based on whether the target line is in the diff
5. **Auto-detect mainRepoConfig** — from the GitHub page URL, no manual settings

Think about:

### Debugging scenarios for the fs-eng
At each build phase, what Playwright scenario should they run? What log trace should they expect? This is how they verify the wiring works before moving on. The hash parsing → session switch → auto-clone → nav populates chain is the critical pipeline to verify.

### Integration tests
The diff-aware link routing is the most complex new logic. It involves: GitHub API fetch → hunk parsing → SHA256 computation → URL construction → chrome.tabs navigation. Design tests for this chain — both the pure logic (vitest: hunk parsing, SHA256 anchors, routing decisions) and the integration (Playwright: Cmd+click → lands on correct GitHub page).

The fixture PR exists for this purpose: order-router.ts is changed (link should go to diff view), crust-validator.ts is unchanged (link should go to blob view).

### Story-driven tests
10 stories in the stories file. Map them to tests. The auto-clone story (W1/W2) is the gate test — if it doesn't work, nothing else matters.

Write `0650-workflow-wiring.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/agents/001-test-arch-workflow/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
