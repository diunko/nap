# fixes-02 — test architecture: PR head branch from GitHub API

## What changed

PR pages have no branch in the URL path. `parsePageUrl('/pull/149187')` returns `mainBranch: 'main'` (default). The fix adds `fetchPrHeadBranch(owner, repo, prNum, pat?)` that hits `GET /repos/{owner}/{repo}/pulls/{n}` and returns `data.head.ref`. The model calls this in the `checkDiffRanges` flow and updates `store.mainRepoConfig.branch`.

## The chain

```
panel boots on PR page
    → model.checkDiffRanges (already exists)
    → NEW: fetchPrHeadBranch → data.head.ref
    → store.setMainRepo({ ...existing, branch: head.ref })
    → link-routing reads mainRepoConfig.branch
    → buildGitHubUrl uses the real PR branch
```

The existing link-routing code already reads `mainRepoConfig.branch` — no change needed there. The test surface is: the new fetch function, the store update, and the end-to-end flow.

---

## Small tests (vitest) — fetchPrHeadBranch response parsing

### PB-S01: normal PR — returns head.ref

* **what to test:** mock fetch returns `{ head: { ref: 'feature/delivery-v2' } }` → function returns `'feature/delivery-v2'`
* **why:** happy path. The API response is a large object; the function must extract exactly `data.head.ref`.
* **where it breaks:** wrong JSON path. If the function reads `data.base.ref` instead of `data.head.ref`, it returns the target branch (usually `main`) — looks right, is wrong.
* **story:** PB1

### PB-S02: slashed branch name — `nap-pro/0100-restore-version`

* **what to test:** mock fetch returns `{ head: { ref: 'nap-pro/0100-restore-version' } }` → returns the full string including the slash
* **why:** the original bug report uses a slashed branch name. This is the exact case that `parsePageUrl` can't handle from the URL path (fixes-01 limitation). The API doesn't have this limitation.
* **where it breaks:** if the return value gets split on `/` or truncated somewhere downstream. The function itself is fine — the risk is in consumers.
* **story:** PB5

### PB-S03: deeply slashed branch — `org/team/feature/sub-thing`

* **what to test:** mock returns `{ head: { ref: 'org/team/feature/sub-thing' } }` → returned verbatim
* **why:** some workflows use deeply nested branch names. The API returns them exactly as created.

### PB-S04: closed PR — API still returns head.ref

* **what to test:** mock returns `{ head: { ref: 'old-branch' }, state: 'closed' }` → returns `'old-branch'`
* **why:** closed/merged PRs still have head.ref in the API response. The branch may have been deleted, but the ref string is still there. The function should return it regardless — link routing will construct URLs that may 404, but that's expected for deleted branches.
* **story:** PB1 (implied)

### PB-S05: 404 response — private repo, no token

* **what to test:** mock fetch returns `{ ok: false, status: 404 }` → function returns `null`
* **why:** graceful degradation. No crash, no throw. The caller keeps `mainBranch` at the URL-derived default ('main').
* **where it breaks:** if the function throws instead of returning null. The model's `checkDiffRanges` must handle null without crashing.
* **story:** PB4

### PB-S06: 403 response — rate limited

* **what to test:** mock fetch returns `{ ok: false, status: 403 }` → returns `null`
* **why:** GitHub API rate limits are 60/hour without auth. Extension without PAT will hit this on heavy use.

### PB-S07: network error — fetch throws

* **what to test:** mock fetch throws `TypeError('Failed to fetch')` → returns `null`
* **why:** offline, DNS failure, CORS error. Must not bubble up as unhandled rejection.

### PB-S08: malformed response — no head field

* **what to test:** mock fetch returns `{ base: { ref: 'main' } }` (missing `head`) → returns `null`
* **why:** defensive. API schema changes or unexpected response shape.

### PB-S09: empty ref — head.ref is empty string

* **what to test:** mock returns `{ head: { ref: '' } }` → returns `null` (or empty string — spec should decide)
* **why:** edge case. An empty branch name is invalid but the function should handle it without downstream breakage. Prefer returning null so the caller keeps the default.

### PB-S10: with PAT — Authorization header sent

* **what to test:** mock fetch, inspect request headers → `Authorization: Bearer ghp_xxx`
* **why:** private repos need auth. Verify the PAT is actually passed to the API, not silently dropped.

### PB-S11: without PAT — no Authorization header

* **what to test:** mock fetch, inspect request headers → no Authorization header present
* **why:** public repos shouldn't send a token. Sending an invalid/empty token could trigger 401 instead of getting the public response.

---

## Small tests (vitest) — mainBranch update in store

### PB-S12: setMainRepo updates branch

* **what to test:** `store.setMainRepo({ owner: 'coda', repo: 'coda', branch: 'main' })`, then `store.setMainRepo({ owner: 'coda', repo: 'coda', branch: 'nap-pro/0100-restore-version' })` → `store.getState().mainRepoConfig.branch === 'nap-pro/0100-restore-version'`
* **why:** the fix calls `setMainRepo` with the updated branch. This verifies the store action works for branch updates, not just initial set.
* **where it breaks:** if `setMainRepo` does a shallow merge that drops the branch field, or if the branch is normalized/truncated.

### PB-S13: mainBranch persists and hydrates

* **what to test:** set `mainRepoConfig` with branch `'nap-pro/0100-restore-version'` → persist → recreate store → `mainRepoConfig.branch === 'nap-pro/0100-restore-version'`
* **why:** return visit (PB2). The branch must survive IDB round-trip including the slash.
* **test size:** small (uses `createMemoryStorage()`)
* **story:** PB2

### PB-S14: mainBranch with slash persists correctly

* **what to test:** same as PB-S13 but with deeply slashed branch `'org/team/feature/sub'`
* **why:** JSON serialization handles slashes fine, but this is a paranoia test for the persistence layer.

---

## Small tests (vitest) — buildGitHubUrl with updated branch

### PB-S15: blob URL uses branch from mainRepoConfig

* **what to test:** `buildGitHubUrl('/modules/code_store.ts', 5, { owner: 'coda', repo: 'coda', branch: 'nap-pro/0100-restore-version' })` → `https://github.com/coda/coda/blob/nap-pro/0100-restore-version/modules/code_store.ts#L5`
* **why:** end-to-end pure function test. The branch flows from store → link-routing → URL. Slashes in the branch name must not break the URL.
* **where it breaks:** URL encoding. If the branch is percent-encoded, GitHub won't match it. GitHub expects raw slashes in blob URLs.
* **story:** PB1

### PB-S16: blob URL with SHA as branch

* **what to test:** `buildGitHubUrl('/src/index.ts', 10, { owner: 'org', repo: 'repo', branch: '0f222eae21cce4612a89fb8fa59ce00f9b78eeb0' })` → URL contains the full SHA in the blob path
* **why:** cross-reference with fixes-01. If `parsePageUrl` provides a SHA (tree URL) and the PR API isn't called (prNum=0), the SHA should flow through cleanly.

---

## Medium tests (vitest with mocks) — model flow

### PB-M01: checkDiffRanges also fetches head branch → updates store

* **flow:** model created with `config.prNum > 0` → `checkDiffRanges` triggered → fetches PR metadata → `store.setMainRepo` called with updated branch
* **what to mock:**
  - `fetchPrHeadBranch` → returns `'feature/delivery-v2'`
  - `fetchPrDiffRanges` → returns diff range map (existing behavior)
* **what to verify:**
  - after checkDiffRanges completes: `store.getState().mainRepoConfig.branch === 'feature/delivery-v2'`
  - diff ranges also set (existing behavior still works)
* **where it breaks:** ordering. If the head branch fetch happens after diff ranges, the store is updated twice. If it's a separate promise that rejects independently, one failure shouldn't block the other.
* **story:** PB1

### PB-M02: checkDiffRanges skips head branch fetch for non-PR

* **flow:** model with `config.prNum === 0` → `checkDiffRanges` → no API call for head branch
* **what to verify:** `fetchPrHeadBranch` not called. `mainRepoConfig.branch` unchanged from URL-derived value.
* **story:** PB3

### PB-M03: head branch fetch fails → mainBranch stays at default

* **flow:** model with `prNum > 0` → `fetchPrHeadBranch` returns null (404) → `mainRepoConfig.branch` stays at `'main'` (from URL)
* **what to verify:** no crash, store not updated with null branch, diff ranges fetch still proceeds independently
* **story:** PB4

### PB-M04: return visit — cached branch, no re-fetch

* **flow:** store hydrated from IDB with `mainRepoConfig.branch === 'nap-pro/0100-restore-version'` → model starts → `checkDiffRanges` sees cached prDiffRanges → no fetch
* **what to verify:** `fetchPrHeadBranch` not called. Branch still `'nap-pro/0100-restore-version'`.
* **note:** this depends on whether the head branch is cached separately or only as part of `mainRepoConfig` (which is persisted). If `mainRepoConfig` is hydrated with the correct branch, no re-fetch is needed.
* **story:** PB2

### PB-M05: refreshPr re-fetches head branch

* **flow:** user clicks [refresh PR] → `model.refreshPr()` → invalidates diff ranges → `checkDiffRanges` → re-fetches head branch
* **what to verify:** `fetchPrHeadBranch` called. If the branch changed (force-push to different branch), store updated.
* **where it breaks:** `refreshPr` currently re-reads the tab URL and re-derives config. If the head branch was only set from API (not URL), re-reading the URL would overwrite it back to 'main'. The fix must ensure the API fetch runs again after refresh.

---

## What NOT to test

* `parsePageUrl` branch extraction — that's fixes-01, already tested
* Diff range fetching/parsing — already covered by WW-S04, WW-S07, WW-M04 (existing)
* DOM rendering of links — visual, manual verification
* Content script changes — no content script changes in this fix

---

## Where it breaks — ranked by likelihood

1. **refreshPr overwrites API branch with URL-derived 'main'.** `refreshPr()` calls `resolveBootState(url)` → `buildNapConfig(page, hash)` → `mainBranch: 'main'` (from PR URL). It then calls `setMainRepo` with this config, overwriting the API-fetched branch. The fix must ensure `checkDiffRanges` re-fetches head branch after `refreshPr` invalidates.

2. **Race between head branch fetch and diff ranges fetch.** Both are async, both update the store. If the head branch fetch resolves after a link click but before diff ranges, the URL uses the right branch but routing is blob (no ranges yet). Acceptable but worth documenting.

3. **`data.head.ref` vs `data.head.label`.** The API response has both. `ref` is the branch name. `label` includes the fork owner prefix (`fork-owner:branch-name`). Using `label` by mistake would break URL construction.

4. **Slashed branch in URL construction.** `blob/feature/delivery-v2/src/file.ts` — GitHub interprets this correctly, but if any URL encoding is applied to the branch segment, it breaks.
