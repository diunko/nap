# gitlab support — provider registry + second token

* what: support GitLab-hosted .nap repos alongside GitHub
  * real use case: gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap
  * the main code repo stays on GitHub (PRs live there)
  * the .nap repo can be on either GitHub or GitLab

* provider registry — one mapping, easy to extend
  ```typescript
  const PROVIDERS: Record<string, { hostname: string; label: string }> = {
    github: { hostname: 'github.com', label: 'GitHub' },
    gitlab: { hostname: 'gitlab.grammarly.io', label: 'GitLab' },
  };
  ```
  * the hash uses the key: `nap-repo=gitlab/owner/repo`
  * the registry maps `gitlab` → `gitlab.grammarly.io`
  * clone URL: `https://{hostname}/{owner}/{repo}`
  * adding a third provider = one line in the registry

* hash format unchanged
  * `#nap-repo=github/owner/repo` → `https://github.com/owner/repo`
  * `#nap-repo=gitlab/owner/repo` → `https://gitlab.grammarly.io/owner/repo`
  * the provider key is the first path segment, not a hostname

* two token fields in settings
  * "GitHub PAT" — for GitHub .nap repos + GitHub API (diff ranges)
  * "GitLab PAT" — for GitLab .nap repos
  * stored in chrome.storage.sync: `{ githubToken: string, gitlabToken: string }`
  * onAuth callback picks the right token based on provider key from the session config
  * no hostname in the UI — just "GitHub" and "GitLab"

* host permissions
  * add `https://gitlab.grammarly.io/*` to manifest.json
  * needed for CORS bypass on git clone/fetch

* what changes
  * url-config.ts: provider registry, buildCloneUrl uses hostname lookup
  * manifest.json: add gitlab.grammarly.io to host_permissions
  * store.ts: settings state gains gitlabToken alongside existing githubToken/pat
  * settings UI: second token field
  * git-command.ts: onAuth reads provider-specific token
  * session.ts or model.ts: pass provider info through to git commands

* what doesn't change
  * hash parsing structure (provider/owner/repo already parsed)
  * session isolation (state-key includes provider)
  * nav tree, editor, terminal — provider-agnostic
  * PR diff routing — only works for GitHub PRs (GitLab has different API, skip for now)

* fixture: push nap-test content to GitLab
  * target: gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap
  * use GITLAB_API_TOKEN from .env for auth
  * script: `fixtures/sync-gitlab.sh` — pushes same .nap fixture content to GitLab
  * keep GitHub and GitLab sync scripts separate (different auth, different remotes)

* testing
  * clone from gitlab.grammarly.io with token → nav populates
  * file:line links still navigate GitHub tab (main repo is on GitHub)
  * provider registry unit tests (pure function)
  * Playwright: clone from GitLab fixture, verify nav + editor work
