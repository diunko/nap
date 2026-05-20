Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — ext-react architecture
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — session isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.nap.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.spec.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.stories.md` — 6 stories

## Read the code

- `packages/ext-react/src/url-config.ts` — current hash parsing, buildCloneUrl
- `packages/ext-react/src/git-command.ts` — onAuth callback
- `packages/ext-react/src/store.ts` — current settings/token state
- `packages/ext-react/src/index.tsx` — settings overlay
- `packages/ext-react/src/session.ts` — how provider flows into the session
- `packages/ext-react/e2e/tests/` — all existing Playwright tests
- `packages/ext-react/src/__tests__/url-config.test.ts` — existing hash parsing tests

Explore freely.

## Your task

This feature adds:
1. Provider registry (pure mapping: key → hostname)
2. Two token fields in settings (github + gitlab)
3. Provider-specific onAuth in git commands
4. Host permissions for gitlab.grammarly.io
5. Fixture sync script for GitLab

Think about:
- **What's pure logic?** Provider registry mapping, clone URL construction — vitest
- **What needs real git clone?** Cloning from gitlab.grammarly.io — Playwright with real network. Needs the GitLab fixture to be populated first. Needs a token.
- **Token handling in tests:** The GitLab PAT is in `.env` (GITLAB_API_TOKEN). How do Playwright tests access it? `process.env` in the test, injected into the panel via `page.evaluate` → `chrome.storage.sync.set`?
- **What can't be tested in CI?** GitLab clone requires VPN access to gitlab.grammarly.io. These tests may only run locally. Flag them.
- **Regressions:** GitHub clone must still work. Existing tests must pass.

Write `0658-gitlab-support.test.md` in the napkin directory.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/agents/001-test-arch-gitlab/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
