# fixes-01 — stories

## UF1: tree URL with commit SHA

* URL: `github.com/coda/coda/tree/0f222eae21cce4612a89fb8fa59ce00f9b78eeb0#nap-repo=...`
* settings shows: Code repo: coda/coda, Branch: 0f222eae21...
* file:line links resolve to `blob/0f222eae21.../path#L54`

## UF2: tree URL with branch name

* URL: `github.com/org/repo/tree/develop#nap-repo=...`
* branch detected: `develop`
* file:line links resolve to `blob/develop/path#L54`

## UF3: blob URL with branch

* URL: `github.com/org/repo/blob/feature-x/src/main.ts#nap-repo=...`
* branch detected: `feature-x`
* file:line links resolve to `blob/feature-x/path#L54`

## UF4: PR URL — branch from PR, not path

* URL: `github.com/org/repo/pull/42#nap-repo=...`
* prNum: 42, mainBranch: 'main' (default — PR branch detected via DOM or API later)
* diff-aware routing active (prNum > 0)

## UF5: bare repo URL

* URL: `github.com/org/repo#nap-repo=...`
* no tree/blob/pull in path
* mainBranch: 'main' (default)
* file:line links resolve to `blob/main/path#L54`

## UF6: non-code pages (issues, actions)

* URL: `github.com/org/repo/issues/123#nap-repo=...`
* prNum: 0, mainBranch: 'main'
* extension works — clone, nav, reading — just no diff routing
