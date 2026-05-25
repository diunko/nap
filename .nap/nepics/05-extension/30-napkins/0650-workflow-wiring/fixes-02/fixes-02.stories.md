# fixes-02 — stories

## PB1: PR link — file:line resolves to PR branch

* URL: `github.com/coda/coda/pull/149187#nap-repo=...`
* PR head branch: `nap-pro/0100-restore-version`
* panel boots, fetches PR metadata → `mainBranch` updated to `nap-pro/0100-restore-version`
* Cmd+click `[code_store.ts:5](/modules/.../code_store.ts#L5)`
* → `github.com/coda/coda/blob/nap-pro/0100-restore-version/modules/.../code_store.ts#L5`
* NOT `blob/main/...`

## PB2: return visit — branch cached

* same PR link, panel reopened
* `mainBranch` hydrated from IDB: `nap-pro/0100-restore-version`
* links work immediately, no API call
* [refresh PR] re-fetches and updates if branch changed

## PB3: non-PR page — branch from URL

* URL: `github.com/org/repo/tree/develop#nap-repo=...`
* no PR → no API fetch → `mainBranch` from URL path: `develop`
* unaffected by this fix

## PB4: private repo without token — graceful fallback

* PR page, no GitHub token
* API fetch returns 404
* `mainBranch` stays at default from URL ('main')
* links resolve to `blob/main/...` — not perfect but not broken

## PB5: slashed branch name

* PR head branch: `feature/my-thing`
* API returns `head.ref: "feature/my-thing"`
* links resolve to `blob/feature/my-thing/path#L5`
