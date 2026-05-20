Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## The feature

- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.nap.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.spec.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.stories.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.test.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/agents/002-fs-eng-gitlab/response.md`

## Your task

1. **Run vitest.** Confirm 143 tests pass.

2. **Run existing Playwright tests.** Confirm no regressions on GitHub clone, diff routing, session, etc.

3. **Sync GitLab fixture.** Run `./fixtures/sync-gitlab.sh` — it reads GITLAB_API_TOKEN from `.env` and pushes fixture content to gitlab.grammarly.io. If VPN is required and not available, note it and skip.

4. **Implement GL-M01 through GL-M03** from the test.md:
   - GL-M01: Clone from GitLab — navigate with `#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap`, enter GitLab token, verify clone + nav. **Requires VPN.**
   - GL-M02: GitHub regression — existing auto-clone from GitHub still works (run existing WW-P02).
   - GL-M03: Token persistence — enter GitLab PAT, close panel, reopen, verify token survives.

5. **Fix bugs you find.**

Note: GL-M01 requires VPN access to gitlab.grammarly.io. If unreachable, write the test and mark it as `test.skip` with a comment explaining. The vitest layer (20 GL-S* tests) covers the pure logic. The Playwright test confirms the wiring works in a real browser.

Write response.md, then `nap3 done`.
