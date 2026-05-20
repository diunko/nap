# response — test architect (001-test-arch-gitlab)

## What I produced

`0658-gitlab-support.test.md` — 9 test cases (6 small, 3 medium).

## Key findings from reading the code

1. **Auth is unwired.** `TerminalPane` accepts `getAuth` but Panel doesn't pass it (`index.tsx:359`). Settings overlay has a PAT input but `handleSave` is a no-op. The fullstack engineer needs to wire the full path: settings → store/chrome.storage.sync → Panel → TerminalPane → createGitCommand → isomorphic-git onAuth.

2. **Wrong GitLab hostname.** `buildCloneUrl` returns `gitlab.com` (url-config.ts:94), manifest has `gitlab.com/*` (manifest.json:14). Spec says `gitlab.grammarly.io`. Both need fixing.

3. **NapConfig missing provider field.** The config carries `cloneUrl` but not the provider key. The auth callback needs the provider to pick the right token. Add `provider: string` to `NapConfig`.

4. **Unknown provider silently falls back to GitHub.** Should throw — wrong provider is a bug in the link, not a graceful degradation.

## Test strategy

* **6 small tests (vitest):** Provider registry mapping, clone URL construction, token selection, state-key isolation, buildNapConfig with GitLab, two-token persistence. All pure logic, no browser needed.
* **1 regression checkpoint:** Run existing IM-01/PB-P04/PB-P05 tests. If they pass, GitHub path is unbroken.
* **2 medium tests (Playwright, VPN-gated):** GitLab clone full pipeline, GitLab token persistence across reopen. These need VPN + GITLAB_API_TOKEN. Skip in CI.

## Notes for downstream

* Token injection in Playwright: prefer `chrome.storage.sync.set` (tests real flow) over direct store injection.
* GitLab fixture must be populated before Playwright tests: `fixtures/sync-gitlab.sh`.
* `.env` at repo root has a literal `GITLAB_API_TOKEN` — should use 1Password reference per org guidelines.
