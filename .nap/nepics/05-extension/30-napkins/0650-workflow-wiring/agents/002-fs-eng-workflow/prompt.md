Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these:

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react architecture
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.nap.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.spec.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.stories.md`

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.test.md` — 17 test cases. Read the debugging scenarios FIRST — they define what "working" looks like at each phase.
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/agents/001-test-arch-workflow/response.md` — TA reasoning

## The link navigation analysis

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/06-link-navigation-cases.nap.md`

## CRITICAL: Read the ext-react source deeply

You're adding features to an existing React+Zustand extension. Read the code yourself before changing anything:

- `packages/ext-react/src/store.ts` — state shape you're extending (add prDiffRanges, mainRepoConfig auto-set)
- `packages/ext-react/src/session.ts` — session factory you're wiring the hash parser to
- `packages/ext-react/src/model.ts` — data pipeline you're extending (auto-clone, fetch latest)
- `packages/ext-react/src/content.ts` — content script you're adding hash parsing to
- `packages/ext-react/src/link-routing.ts` — link routing you're upgrading (diff URL vs blob URL)
- `packages/ext-react/src/index.tsx` — app shell where session switching wires in
- `packages/ext-react/src/git-command.ts` — git commands you're extending (fetch, checkout)
- `packages/ext-react/src/ContentPane.tsx` — link click handling that needs the diff/blob routing
- `packages/ext-react/src/Sidebar.tsx` — loading state during auto-clone
- `packages/ext-react/e2e/tests/fixtures.ts` — Playwright fixture you're extending

Don't limit yourself to these files. Follow imports, read adjacent code. Understand how the session system works end-to-end before you add auto-clone and hash parsing.

Also read the fixtures — they're your test data:
- `fixtures/README.md` — how fixtures + PR work
- `fixtures/main-pr/` — the PR branch changes
- `fixtures/.nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md` — chapter with file:line links

## Your task

Build the workflow wiring. Work in phases, run debugging scenarios at each phase, verify the log trace matches expectations before moving on.

**Phase 1: Hash parsing + session wiring**
- content.ts: parse URL hash, derive state-key, send config message to panel
- index.tsx: receive config → createSession(key) → auto-set mainRepoConfig
- Write WW-S01 through WW-S03 vitest (hash parsing, key derivation, clone URL)
- Run debugging scenario: navigate to fixture URL with hash → verify session switch in console

**Phase 2: Auto-clone + fetch latest**
- model.ts: auto-clone on fresh session (LFS empty → programmatic git clone)
- git-command.ts: add fetch and checkout subcommands
- header: wire [fetch latest] button → git fetch + checkout
- loading state in Sidebar during clone
- Write WW-M01 through WW-M04 vitest (auto-clone trigger, fetch sequence)
- Run debugging scenario: open panel with hash → auto-clone fires → nav populates → napkin focused

**Phase 3: Diff-aware link routing**
- New: pr-diff.ts — fetch GitHub API `/pulls/{n}/files`, parse patch hunks, build range map
- link-routing.ts: upgrade buildGitHubUrl → diff URL or blob URL based on prDiffRanges
- SHA256 anchor computation: `crypto.subtle.digest`
- store.ts: add prDiffRanges to state + partialize for persistence
- Write WW-S04 through WW-S07 vitest (hunk parsing, SHA256, routing decisions, persistence)
- Run debugging scenario: Cmd+click order-router.ts:54 → diff URL. Cmd+click crust-validator.ts:40 → blob URL.

**Phase 4: Polish + gate test**
- Link visual affordances: Monaco ILinkProvider for pointer cursor + underline on hover
- Settings: PAT only (mainRepoConfig auto-detected)
- Run WW-P02 gate test (auto-clone on first visit) — must pass green
- Run all existing ext-react tests — must not regress

Log every state transition. Run the debugging scenarios. Fix the pipeline before moving on. Own the quality.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/agents/002-fs-eng-workflow/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
