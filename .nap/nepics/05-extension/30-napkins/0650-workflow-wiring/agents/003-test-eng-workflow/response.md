# test-eng response — 0650-workflow-wiring

## Test results

| Layer | Tests | Status |
|-------|-------|--------|
| Vitest (97 tests) | url-config, pr-diff, workflow-wiring, store, session, model, adapter | **all pass** |
| TypeScript | `tsc --noEmit` | **zero errors** |
| Build | `vite build` | **clean** |
| Playwright WW-P01 | hash → session switch + mainRepoConfig | **PASS** |
| Playwright WW-P02 | auto-clone + nav + napkin focus (gate test) | **PASS** |
| Playwright WW-P03 | link routing blob fallback | **PASS** |
| Playwright WW-P04 | return visit — IDB has repo, nav from scan, diff ranges hydrated | **PASS** |
| Playwright WW-P05 | diff-aware routing — order-router.ts:54 → PR diff view | **PASS** |
| Playwright WW-P06 | blob fallback — crust-validator.ts:40 → blob view | **PASS** |
| Playwright WW-P07 | fetch latest — git fetch + checkout, nav refresh, diff re-fetch | **PASS** |
| Playwright DS-P2-01 | panel renders (regression) | **PASS** |
| Playwright DS-P2-02 | store actions (regression) | **PASS** |
| Playwright DS-P3-01 | clone → nav (regression) | **PASS** |

**Total: 97 vitest + 10 Playwright = 107 tests passing.**

## Bugs found and fixed

### Bug 1: `fetchLatest` uses wrong branch (code repo branch instead of .nap repo branch)

* **Where:** `model.ts:fetchLatest()`
* **What:** `const branch = store.getState().mainRepoConfig?.branch || 'main'` reads the code repo's PR branch (e.g., `feature/delivery-v2`), but the fetch runs against the cloned .nap repo which uses `napBranch` (typically `main`).
* **Impact:** `git checkout origin/feature/delivery-v2` would fail in the .nap repo — that branch doesn't exist there.
* **Fix:** Changed to `config?.napBranch || 'main'` — reads from the model's local config, which has the correct .nap branch.

### Bug 2: `fetchLatest` runs git commands in wrong directory

* **Where:** `model.ts:fetchLatest()`
* **What:** The shell starts in `/home/user`. After auto-clone, the repo is at `/home/user/nap-test-nap`. But `fetchLatest` sent `git fetch origin` without changing directory first. Since `git fetch` uses `ctx.cwd` (the shell's cwd), it would try to fetch in `/home/user` which has no `.git`.
* **Impact:** `git fetch origin` fails with "not a git repository".
* **Fix:** Added `cd /home/user/${repoName} &&` prefix to the command. Repo name derived from `config.cloneUrl`.

### Bug 3: `onCommandComplete` doesn't detect git commands in compound expressions

* **Where:** `model.ts:onCommandComplete()`
* **What:** Detection used `trimmed.startsWith('git fetch')`. After bug fix #2, the command is `cd /home/user/nap-test-nap && git fetch origin && ...` which starts with `cd`, not `git fetch`.
* **Impact:** Post-fetch actions (nav refresh, diff range invalidation) would never trigger.
* **Fix:** Changed from `startsWith` to regex: `/\bgit fetch\b/.test(trimmed)`. Handles both simple and compound commands.

### Bug 4: `resolveDiffUrl` computes `finalAnchor` but uses `anchor`

* **Where:** `link-routing.ts:resolveDiffUrl()`
* **What:** When no line number is present, `finalAnchor` correctly strips the `R0` from the anchor, but the return statement used `anchor` instead of `finalAnchor`.
* **Impact:** Links without line numbers would produce `#diff-{hex}R0` instead of `#diff-{hex}`. Minor — GitHub still loads the page, but scrolls to line 0 instead of the file header.
* **Fix:** Changed return to use `finalAnchor`.

## What tests verify (DOM, not just model)

Following the lesson from 0600 ("tests that read model state pass while the product is broken"):

* **WW-P04:** Checks napkin card count in DOM (`[data-testid="napkin-card"]`) — not just `navSections.length`
* **WW-P05:** Checks `ghPage.url()` after Cmd+click — verifies the GitHub tab *actually navigated* to `pull/1/files#diff-{hex}R54`. Not just store state.
* **WW-P06:** Checks `ghPage.url()` contains `/blob/` and `crust-validator.ts` and `#L40`. Verifies negative: `not.toContain('files#diff-')`.
* **WW-P07:** Checks terminal DOM for fetch output, napkin card count in DOM after fetch.

## Story coverage

| Story | Test(s) | Status |
|-------|---------|--------|
| W1 (shared link zero-config) | WW-P02 | covered (gate test) |
| W2 (auto-clone shows progress) | WW-P02 (terminal output) | covered |
| W3 (return visit instant resume) | **WW-P04** | **NEW — covered** |
| W4 (fetch latest) | **WW-P07** | **NEW — covered** |
| W5 (different PR, different session) | WW-P04 (verifies session key works on return) | partially covered |
| W7 (napkin focus from URL) | WW-P02 (focusedCardSlug check) | covered |
| W8 (mainRepoConfig from URL) | WW-P01, WW-P02 | covered |
| W10 (link visual affordances) | manual | not automated |
| diff routing (changed file) | **WW-P05** | **NEW — covered** |
| blob routing (unchanged file) | **WW-P06** | **NEW — covered** |

## Known limitations (not bugs — v0 scope)

* **PAT not persisted:** Settings overlay accepts PAT but doesn't store it. Private repos can't clone or fetch diff ranges. Public repos work fine without PAT.
* **`__DIFF_URL__` placeholder pattern:** Diff URL construction is async (SHA256), but `routeLink` is sync (Monaco mousedown). The placeholder + async resolution in ContentPane works but is unusual. Pre-computing anchors when diff ranges are fetched would be cleaner.
* **GitHub API rate limiting:** Unauthenticated requests have a 60/hour limit. Heavy test runs could hit this. The tests handle it gracefully (WW-P04, WW-P07 check for null ranges and continue).

## Files changed

| File | Change |
|------|--------|
| `src/model.ts` | Fixed fetchLatest (napBranch, cd into repo), onCommandComplete regex detection |
| `src/link-routing.ts` | Fixed resolveDiffUrl to use finalAnchor |
| `src/__tests__/workflow-wiring.test.ts` | Updated WW-M03 test for fixed fetchLatest behavior |
| `e2e/tests/ww-workflow-wiring.test.ts` | Added WW-P04, WW-P05, WW-P06, WW-P07 Playwright tests |
