# fixes-02 — PR head branch from GitHub API

* the bug
  * on a PR page, file:line links resolve to `blob/main/...`
  * should resolve to `blob/{pr-head-branch}/...`
  * PR head branch not in the URL path — only available from DOM or API
  * `parsePageUrl('/pull/149187')` → `mainBranch: 'main'` (wrong)

* the fix
  * fetch PR metadata: `GET /repos/{owner}/{repo}/pulls/{n}`
  * response has `head.ref` → the PR's head branch name
  * update `mainBranch` in the store after fetch
  * file:line links then resolve to `blob/{head.ref}/...`

* where it fits
  * the model already fetches diff ranges in `checkDiffRanges`
  * add a PR metadata fetch alongside it (or before it)
  * same auth (githubToken), same timing (on boot for PRs)
  * cache the result — persist `mainBranch` in store (already persisted)
  * on return visit: hydrated from IDB, no re-fetch

* new function in pr-diff.ts
  ```
  fetchPrHeadBranch(owner, repo, prNum, pat?) → string | null
  ```
  * `GET /repos/{owner}/{repo}/pulls/{n}`
  * returns `data.head.ref`
  * one call, small response

* what changes
  * pr-diff.ts: add `fetchPrHeadBranch`
  * model.ts: in `checkDiffRanges` flow, also fetch head branch → update store `mainBranch`
  * store.ts: `setMainBranch(branch)` action (or update mainRepoConfig)
  * link routing: already reads `mainBranch` from store — no change needed

* what doesn't change
  * non-PR pages: `mainBranch` from URL path (fixes-01)
  * hash parsing, session key, pipeline, tokens
  * diff ranges fetch (separate endpoint, same flow)

* edge cases
  * PR with slashed branch name: `nap-pro/0100-restore-version` — API returns it correctly
  * closed/merged PR — API still returns head.ref
  * private repo without token — API returns 404, mainBranch stays default 'main'
