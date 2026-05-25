# fixes-01 — parse mainBranch from URL, enumerate all GitHub URL patterns

* the bug
  * URL: `github.com/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0#nap-repo=...`
  * `parsePageUrl` doesn't extract the ref from `/tree/{ref}` or `/blob/{ref}`
  * `mainBranch` defaults to `'main'`
  * file:line links resolve to `blob/main/...` instead of `blob/{actual-ref}/...`

* the fix
  * `parsePageUrl` extracts mainBranch from the URL path
  * return it in `PageInfo` alongside mainOwner, mainRepo, prNum

* all GitHub URL patterns to handle
  * `/owner/repo` → branch: default 'main', prNum: 0
  * `/owner/repo/tree/{branch}` → branch from path, prNum: 0
  * `/owner/repo/tree/{sha}` → sha from path, prNum: 0
  * `/owner/repo/blob/{branch}/path/to/file` → branch from path, prNum: 0
  * `/owner/repo/blob/{sha}/path/to/file` → sha from path, prNum: 0
  * `/owner/repo/pull/{n}` → branch: default 'main' (or from DOM), prNum: n
  * `/owner/repo/pull/{n}/files` → same as pull/n
  * `/owner/repo/pull/{n}/commits` → same as pull/n
  * `/owner/repo/pull/{n}/commits/{sha}` → same as pull/n
  * `/owner/repo/issues/{n}` → no branch, prNum: 0 (not a PR)
  * `/owner/repo/actions` → no branch, prNum: 0
  * edge: branch names with slashes (`feature/my-branch` in tree URL)
    * `/owner/repo/tree/feature/my-branch` — ambiguous, can't tell where branch ends and path begins
    * pragmatic: take the first segment after tree/blob as the ref. won't work for slashed branches.
    * acceptable for v0 — most links use main or a SHA

* what changes
  * url-config.ts: `parsePageUrl` returns `{ mainOwner, mainRepo, prNum, mainBranch }`
  * `PageInfo` interface: add `mainBranch: string`
  * `buildNapConfig`: use `page.mainBranch` instead of hardcoded fallback
  * tests: enumerate all URL patterns above

* what doesn't change
  * hash parsing (nap-repo, napkin — works fine)
  * session key derivation
  * pipeline, loading gate, tokens
