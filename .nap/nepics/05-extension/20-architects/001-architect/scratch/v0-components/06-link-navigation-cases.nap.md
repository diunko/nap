# link navigation — what happens when you click a file:line link

The mini-book has `[order-router.ts:54](/modules/delivery/order-router.ts#L54)`. The reviewer Cmd+clicks it. Where should they land?

## the cases

* case 1: file exists in the PR diff (changed file)
  * the PR modified order-router.ts
  * the reviewer is on github.com/org/repo/pull/42
  * ideal: navigate to the Files Changed tab, scroll to order-router.ts, highlight line 54 in the diff
  * GitHub URL: `github.com/org/repo/pull/42/files#diff-{sha256(path)}R54`
    * the `diff-{hash}` is SHA256 of the file path
    * `R54` is right-side line number
    * but: line 54 in the source might not be R54 in the diff (lines above may have been added/removed)
  * this is the primary use case — the mini-book explains the PR change, the link takes you to the changed code

* case 2: file exists in the repo but NOT in the PR diff (unchanged file)
  * the mini-book references a utility used by the PR (e.g. crust-validator.ts) but that file wasn't changed
  * it won't appear in Files Changed
  * ideal: navigate to the blob view at the PR branch: `github.com/org/repo/blob/{pr-branch}/modules/validation/crust-validator.ts#L40`
  * this is context — "here's the existing code you need to understand"

* case 3: non-PR context (just browsing a branch)
  * reviewer opened `github.com/org/repo/blob/main/#nap-repo=...`
  * no PR, just code
  * navigate to blob: `github.com/org/repo/blob/main/{path}#L54`
  * simplest case — what we build today

* case 4: file was ADDED in the PR (new file)
  * the PR created a new file, the mini-book references it
  * it exists in Files Changed (full file shown as added)
  * navigate to diff view: same as case 1
  * but: `#L54` in the blob might not exist before the PR

* case 5: file was DELETED in the PR
  * rare but possible — the mini-book explains why something was removed
  * the file exists in Files Changed (shown as deleted)
  * navigate to diff view shows the deleted content

## the question: which cases matter for v0?

* case 3 (non-PR blob) — already works, this is what we have today
* case 2 (unchanged file, blob at PR branch) — easy: just use the PR branch instead of main in the blob URL
* case 1 (changed file, PR diff view) — the real value, but hard:
  * need to construct diff anchors (SHA256 of file path)
  * line mapping: source line 54 might be diff line R58 (if lines were added above)
  * GitHub's own line-to-anchor mapping is complex

## a simpler approach for v0?

* always navigate to blob view at the PR head branch
  * `github.com/org/repo/blob/{pr-head-branch}/{path}#L54`
  * works for case 1 (file shows latest content with PR changes), case 2 (context file), case 3 (non-PR)
  * doesn't land in the diff view, but the reviewer sees the right code at the right line
  * from the blob view, they can click "Viewed in #42" or navigate to the PR diff themselves

* the diff view is a v1 enhancement
  * requires: knowing which files changed (GitHub API), computing diff anchors, line mapping
  * the GitHub API call adds latency and complexity
  * the blob view is 90% as useful for 10% of the effort

## what the fixture PR should have

* regardless of which approach: the PR should modify files the mini-book references
* branch: `feature/delivery-v2` off main
* changes:
  * `modules/delivery/order-router.ts` — add express priority handling (~10 lines around line 54)
  * `modules/queue/warp-queue.ts` — add capacity warning (~5 lines)
  * `modules/validation/crust-validator.ts` — unchanged (case 2 testing)
* the mini-book in nap-test-nap references all three files
  * links to order-router.ts:54 → lands in changed file (case 1/blob)
  * links to crust-validator.ts:40 → lands in unchanged file (case 2)
* keep PR open permanently — it's a test fixture
