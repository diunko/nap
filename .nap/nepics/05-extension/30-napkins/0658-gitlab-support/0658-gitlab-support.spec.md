# gitlab support — spec

## Provider registry

Single source of truth for hostname mapping. Lives in `url-config.ts` (or a new `providers.ts`).

```typescript
const PROVIDERS: Record<string, { hostname: string; label: string }> = {
  github: { hostname: 'github.com', label: 'GitHub' },
  gitlab: { hostname: 'gitlab.grammarly.io', label: 'GitLab' },
};
```

`buildCloneUrl('gitlab', 'dmitry.unkovsky', 'nap-test-nap')` → `https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`

Unknown provider key → error (not a silent fallback to github.com).

## Host permissions

```json
"host_permissions": [
  "https://github.com/*",
  "https://gitlab.grammarly.io/*"
]
```

Both needed for CORS-free git clone/fetch.

## Auth — provider-specific tokens

Settings stores two tokens:
- `githubToken` — used when provider is `github`
- `gitlabToken` — used when provider is `gitlab`

Both in chrome.storage.sync (or Zustand persist — match the existing pattern).

`onAuth` callback in git-command.ts:
```typescript
onAuth: () => {
  const token = provider === 'gitlab' ? gitlabToken : githubToken;
  return token ? { username: 'oauth2', password: token } : undefined;
}
```

GitLab PATs use `oauth2` as username with the token as password for HTTP basic auth. GitHub PATs use the same pattern. Both work with isomorphic-git's `onAuth`.

## Settings UI

Two fields:
- "GitHub PAT" — existing field, keep as-is
- "GitLab PAT" — new field, same pattern

No hostname visible. No provider selector. The extension knows which token to use from the URL hash.

## GitLab fixture

Target: `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`

Script: `fixtures/sync-gitlab.sh`
- Reads `GITLAB_API_TOKEN` from `.env`
- Uses token for git push auth: `https://oauth2:${token}@gitlab.grammarly.io/...`
- Pushes the same `.nap/` fixture content as `sync.sh` pushes to GitHub
- Creates repo if it doesn't exist? Or assume it exists (it does — empty, created by DU).

The script should NOT be part of `sync.sh` — separate script, separate auth, different remote. Run manually when GitLab fixtures need updating.

## State-key includes provider

The state-key already includes the full nap-repo path (`provider/owner/repo`). Same .nap repo on GitHub vs GitLab = different sessions. This is correct — different hosts, different credentials, different content potentially.

## PR diff routing — GitHub only

`prDiffRanges` fetch only fires when the main code repo is on GitHub (which it always is — PRs live on GitHub). The .nap repo provider doesn't affect diff routing. No GitLab API integration needed for diff ranges.

## What "done" looks like

- Navigate to `github.com/diunko/nap-test-main/pull/1#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
- Enter GitLab PAT in settings
- Panel auto-clones from gitlab.grammarly.io
- Nav populates, chapters load, file:line links navigate to GitHub (the code repo)
- Return visit: IDB has repo, instant restore
- The reviewer experience is identical regardless of where the .nap repo is hosted
