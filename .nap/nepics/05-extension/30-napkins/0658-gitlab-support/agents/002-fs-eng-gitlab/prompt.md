Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md`
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

## The feature

- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.nap.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.spec.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.stories.md`

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/0658-gitlab-support.test.md`
- `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/agents/001-test-arch-gitlab/response.md`

## Read the code deeply

- `packages/ext-react/src/url-config.ts` — hash parsing, buildCloneUrl. This is where the provider registry goes.
- `packages/ext-react/src/git-command.ts` — onAuth callback. This needs provider-specific token selection.
- `packages/ext-react/src/store.ts` — settings state. Needs gitlabToken field.
- `packages/ext-react/src/index.tsx` — settings overlay UI. Needs second token field.
- `packages/ext-react/src/model.ts` — how token flows into git commands (checkAutoClone, fetchLatest)
- `packages/ext-react/src/session.ts` — how provider info flows into the session
- `packages/ext-react/manifest.json` — host_permissions to update
- `packages/ext-react/src/__tests__/url-config.test.ts` — existing tests to extend

Explore freely. Follow imports.

## Your task

1. **Provider registry.** Add to `url-config.ts`:
   ```typescript
   const PROVIDERS: Record<string, { hostname: string; label: string }> = {
     github: { hostname: 'github.com', label: 'GitHub' },
     gitlab: { hostname: 'gitlab.grammarly.io', label: 'GitLab' },
   };
   ```
   Update `buildCloneUrl` to use registry lookup.

2. **Host permissions.** Add `https://gitlab.grammarly.io/*` to manifest.json.

3. **Two token fields.** Add `gitlabToken` to store state + partialize. Settings UI gets a second field. Both stored independently.

4. **Provider-specific auth.** git-command.ts `onAuth` reads the right token based on provider. The provider comes from the session config.

5. **GitLab fixture script.** Create `fixtures/sync-gitlab.sh`:
   - Reads `GITLAB_API_TOKEN` from `.env` (use `source .env` or `grep`)
   - Pushes same `.nap/` fixture content to `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`
   - Auth: `https://oauth2:${GITLAB_API_TOKEN}@gitlab.grammarly.io/...`
   - The repo exists (empty), just needs content pushed
   - Keep separate from `sync.sh` (different auth, different remote)

6. **Write vitest tests** from the test.md (provider registry, token selection, clone URL).

7. **Run debugging scenarios.** Build the extension. Try cloning from GitLab — does it work with the token? Read the console traces. Fix the pipeline.

8. **Run all existing tests.** No regressions on GitHub clone, diff routing, etc.

Note: GitLab clone requires VPN access to gitlab.grammarly.io. If you can't reach it, verify the code is correct via vitest and leave the Playwright GitLab test for manual/local validation.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0658-gitlab-support/agents/002-fs-eng-gitlab/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
