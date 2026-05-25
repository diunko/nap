# test-architect response3 — fixes-02 (PR head branch from API)

## What I produced

`fixes-02/fixes-02.test.md` — 21 test cases across two tiers.

## Structure

- **PB-S01..S11 (11 tests):** `fetchPrHeadBranch` response parsing. Normal PR, slashed branch, deeply slashed, closed PR, 404, 403, network error, malformed response, empty ref, PAT sent, PAT not sent.
- **PB-S12..S14 (3 tests):** store `mainBranch` update and persistence. Branch update via `setMainRepo`, persistence round-trip with slashed branches.
- **PB-S15..S16 (2 tests):** `buildGitHubUrl` with updated branch. Slashed branch in blob URL, SHA as branch cross-reference with fixes-01.
- **PB-M01..M05 (5 tests):** model flow with mocks. `checkDiffRanges` fetches head branch, skips for non-PR, handles failure gracefully, return visit uses cached branch, `refreshPr` re-fetches.

## Key risk I flagged

**`refreshPr` overwrites the API-fetched branch with URL-derived 'main'.** This is the most likely bug. `refreshPr()` calls `resolveBootState(url)` → `buildNapConfig` → `mainBranch: 'main'` (from PR URL path). Then calls `setMainRepo` with this default, overwriting whatever the API previously set. PB-M05 catches this — verifies that after refreshPr, the head branch is re-fetched from API and not left at 'main'.

## Other risks

- `data.head.ref` vs `data.head.label` — label includes fork owner prefix, ref is clean branch name
- Race between head branch fetch and diff ranges fetch — both async, both update store
- Slashed branches in blob URLs must not be percent-encoded

## What I re-read

- `pr-diff.ts` — existing `fetchPrDiffRanges` pattern (fetch + parse + null on failure). The new function follows the same pattern.
- `model.ts` — `checkDiffRanges` is the integration point. Already has `diffFetchInFlight` guard, `destroyed` check, reads from `globalTokens`. The head branch fetch plugs in alongside.
- `link-routing.ts` — `buildGitHubUrl` reads `config.branch` directly, no encoding. Slashed branches work because GitHub expects raw slashes in blob URLs.
- `store.ts` — `mainRepoConfig` is in `PARTIALIZE`, so branch persists to IDB. `setMainRepo` does a full replace (not merge), so updated branch is clean.
