# fs-eng response3 — fixes-02: PR head branch from GitHub API

## The bug

On PR pages, `parsePageUrl('/pull/149187')` returns `mainBranch: 'main'` because the PR URL path has no branch segment. File:line links resolve to `blob/main/...` instead of `blob/{pr-head-branch}/...`.

## The fix

**`pr-diff.ts`** — new `fetchPrHeadBranch(owner, repo, prNum, pat?)`:
- `GET /repos/{owner}/{repo}/pulls/{n}` → extracts `data.head.ref`
- Returns null on 404, 403, network error, malformed response, or empty ref
- Passes PAT in Authorization header when provided

**`model.ts`** — `checkDiffRanges` now fetches head branch and diff ranges in parallel:
```
Promise.all([
  fetchPrHeadBranch(owner, repo, prNum, pat),
  fetchPrDiffRanges(owner, repo, prNum, pat),
])
```
If head branch is returned and differs from current `mainRepoConfig.branch`, updates the store. The `prDiffRanges !== null` guard means on return visits (hydrated from IDB), neither fetch runs — branch is already correct in persisted `mainRepoConfig`.

## The refreshPr flow

`refreshPr()` re-reads the tab URL → `mainBranch` temporarily resets to `'main'` (PR URL has no branch) → then invalidates diff ranges → `checkDiffRanges` re-fetches head branch from API → updates back to the real branch. Brief flash to 'main' is invisible to the user.

## Tests added (16 cases)

| Test | What |
|------|------|
| PB-S01 | normal PR → returns head.ref |
| PB-S02 | slashed branch `nap-pro/0100-restore-version` |
| PB-S03 | deeply slashed `org/team/feature/sub-thing` |
| PB-S04 | closed PR → still returns head.ref |
| PB-S05 | 404 → null |
| PB-S06 | 403 → null |
| PB-S07 | network error → null |
| PB-S08 | malformed (no head field) → null |
| PB-S09 | empty ref → null |
| PB-S10 | with PAT → Authorization header sent |
| PB-S11 | without PAT → no Authorization header |
| PB-S12 | setMainRepo updates branch |
| PB-S13 | slashed branch persists + hydrates from IDB |
| PB-S14 | deeply slashed branch persists |
| PB-S15 | buildGitHubUrl uses slashed branch correctly |
| PB-S16 | buildGitHubUrl with SHA as branch |

## Verification

- `tsc --noEmit`: zero errors
- `npm run test:small`: 246 tests, 16 suites, all passing
- No regressions

## Files changed

| File | Change |
|------|--------|
| `src/pr-diff.ts` | Added `fetchPrHeadBranch` |
| `src/model.ts` | `checkDiffRanges` fetches head branch + diff ranges in parallel, updates store |
| `src/__tests__/pr-head-branch.test.ts` | 16 new test cases (PB-S01..S16) |
