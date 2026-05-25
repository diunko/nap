# fixes-01 — test architecture: parsePageUrl mainBranch extraction

## What changed

`parsePageUrl(pathname)` must return `mainBranch` alongside `mainOwner`, `mainRepo`, `prNum`. The `PageInfo` interface gains a `mainBranch: string` field.

## What to test

One function, many URL shapes. This is a pure function enumeration test — no mocks, no browser, no async. Every test case is: pathname string in → `PageInfo` out.

The key risk: GitHub URLs have many shapes and the branch/ref segment sits at different positions depending on the page type. The function must handle all of them without false matches (e.g., treating a file path segment as a branch name).

---

## Small tests (vitest) — all in url-config.test.ts

### UF-S01: bare repo URL — `/owner/repo`

* **input:** `/coda/coda`
* **expected:** `{ mainOwner: 'coda', mainRepo: 'coda', prNum: 0, mainBranch: 'main' }`
* **why:** no tree/blob/pull in path → default to 'main'. This is the most common case for repo homepages.
* **story:** UF5

### UF-S02: tree URL with branch name — `/owner/repo/tree/{branch}`

* **input:** `/org/repo/tree/develop`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'develop' }`
* **why:** the original bug trigger — tree URLs have the ref right after `/tree/`. This is the case DU reported with a SHA.
* **story:** UF2

### UF-S03: tree URL with commit SHA — `/owner/repo/tree/{sha}`

* **input:** `/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0`
* **expected:** `{ mainOwner: 'coda', mainRepo: 'coda', prNum: 0, mainBranch: '0f222eae21cce4612a89fb8fa59ce00f9b78eeb0' }`
* **why:** the exact bug from the napkin. SHA is just a ref string — treat it the same as a branch name. The downstream `buildGitHubUrl` will use it in `blob/{ref}/path`.
* **story:** UF1

### UF-S04: tree URL with nested path — `/owner/repo/tree/{branch}/src/lib`

* **input:** `/org/repo/tree/main/src/lib`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' }`
* **why:** the path after the ref is a directory path, not part of the branch name. Since we take only the first segment after `tree/`, this should work.

### UF-S05: blob URL with branch — `/owner/repo/blob/{branch}/path/to/file`

* **input:** `/org/repo/blob/feature-x/src/main.ts`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'feature-x' }`
* **why:** blob URLs have the same structure as tree URLs for our purpose — ref is right after `/blob/`.
* **story:** UF3

### UF-S06: blob URL with SHA — `/owner/repo/blob/{sha}/path/to/file`

* **input:** `/org/repo/blob/abc123def456/src/index.ts`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'abc123def456' }`
* **why:** same as tree+SHA — SHA works as a ref.

### UF-S07: PR URL — `/owner/repo/pull/{n}`

* **input:** `/org/repo/pull/42`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' }`
* **why:** PR URLs don't contain a branch in the path. The PR head ref comes from the DOM or API later. Default to 'main'.
* **story:** UF4

### UF-S08: PR files URL — `/owner/repo/pull/{n}/files`

* **input:** `/org/repo/pull/42/files`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' }`
* **why:** PR sub-pages (files, commits, checks) should all extract the PR number and default branch.

### UF-S09: PR commits URL — `/owner/repo/pull/{n}/commits`

* **input:** `/org/repo/pull/42/commits`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' }`

### UF-S10: PR specific commit — `/owner/repo/pull/{n}/commits/{sha}`

* **input:** `/org/repo/pull/42/commits/abc123`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 42, mainBranch: 'main' }`
* **why:** commit SHA in PR context is not a branch ref — prNum is what matters.

### UF-S11: issues URL — `/owner/repo/issues/{n}`

* **input:** `/org/repo/issues/123`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' }`
* **why:** issues are not PRs. prNum must be 0, not 123. This catches a regex that matches `issues/123` as a PR number.
* **story:** UF6

### UF-S12: actions URL — `/owner/repo/actions`

* **input:** `/org/repo/actions`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' }`
* **why:** non-code pages have no ref in the path. Default to 'main'.
* **story:** UF6

### UF-S13: wiki, settings, security — non-code pages

* **inputs:** `/org/repo/wiki`, `/org/repo/settings`, `/org/repo/security`
* **expected:** all `{ prNum: 0, mainBranch: 'main' }`
* **why:** sanity — these have no tree/blob/pull.

### UF-S14: edge — branch name with slash (pragmatic limit)

* **input:** `/org/repo/tree/feature/my-branch`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'feature' }`
* **why:** ambiguous — can't tell if `feature` is the branch and `my-branch` is a directory, or if the branch is `feature/my-branch`. Napkin says: "take the first segment after tree/blob as the ref." This test documents the known limitation.
* **where it breaks:** if the implementation tries to be smart about slashed branches (e.g., stat the path), it overcomplicates. Accept the limitation.

### UF-S15: edge — empty pathname

* **input:** `/`
* **expected:** `{ mainOwner: '', mainRepo: '', prNum: 0, mainBranch: 'main' }`
* **why:** defensive — should not crash on GitHub root page.

### UF-S16: edge — owner only, no repo

* **input:** `/coda`
* **expected:** `{ mainOwner: 'coda', mainRepo: '', prNum: 0, mainBranch: 'main' }`
* **why:** user profile page — no repo, no ref.

### UF-S17: tree URL with `v`-prefixed tag — `/owner/repo/tree/v2.1.0`

* **input:** `/org/repo/tree/v2.1.0`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'v2.1.0' }`
* **why:** tags are refs too. The function shouldn't special-case them.

### UF-S18: blob URL with no file path — `/owner/repo/blob/{branch}/`

* **input:** `/org/repo/blob/main/`
* **expected:** `{ mainOwner: 'org', mainRepo: 'repo', prNum: 0, mainBranch: 'main' }`
* **why:** trailing slash edge case. Should still extract branch.

---

## Integration with buildNapConfig

### UF-S19: buildNapConfig uses mainBranch from parsePageUrl

* **flow:** `parsePageUrl('/coda/coda/tree/0f222eae21cce...')` → page with `mainBranch: '0f222eae21cce...'` → `buildNapConfig(page, hash)` → `config.mainBranch` is the SHA, not 'main'
* **why:** this is the end-to-end pure-function test. After the fix, `buildNapConfig` should use `page.mainBranch` instead of requiring a separate `mainBranch` parameter.
* **what to test:**
  - `buildNapConfig` with a page that has `mainBranch: 'develop'` → `config.mainBranch === 'develop'`
  - `buildNapConfig` with a page that has `mainBranch: 'main'` (default) → `config.mainBranch === 'main'`
* **note:** the `mainBranch` parameter on `buildNapConfig` may become redundant after this fix. If it's removed, update the existing test `buildNapConfig defaults mainBranch to main`.

### UF-S20: resolveBootState end-to-end with tree URL

* **flow:** `resolveBootState('https://github.com/coda/coda/tree/0f222eae21cce...#nap-repo=...')` → `{ state: 'session', config: { mainBranch: '0f222eae21cce...' }, key }`
* **why:** boot-gate.ts calls `parsePageUrl` → `buildNapConfig`. If the mainBranch plumbing is broken anywhere in the chain, this catches it.

---

## What NOT to test

* Hash parsing — already covered by existing WW-S01 tests, unchanged by this fix
* State-key derivation — unchanged, existing tests sufficient
* Clone URL construction — unchanged
* DOM rendering — this is pure function testing, no browser needed
* PR branch from DOM/API — that's a future enhancement (PR pages default to 'main' for now)

---

## Where it breaks

1. **tree/blob detection:** the function must check for `tree` and `blob` path segments specifically at position `parts[2]`. If it matches on a repo named `tree` (`/someone/tree/blob/main/...`), it'll misparse.
2. **Off-by-one in parts index:** `parts[0]` = owner, `parts[1]` = repo, `parts[2]` = page-type, `parts[3]` = ref. If the filter(Boolean) removes empty strings differently than expected, indexes shift.
3. **Existing test breakage:** the `PageInfo` interface changes (adds `mainBranch`). All existing tests that destructure or compare `PageInfo` need updating. The existing `WW-S02` tests compare `parsePageUrl` return values — they must now include `mainBranch`.
