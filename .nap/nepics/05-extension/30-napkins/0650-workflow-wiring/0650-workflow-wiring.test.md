# workflow wiring — test architecture

## Test strategy overview

Five new subsystems. The seams between them are where bugs hide:

```
content.ts (hash parser)
    → index.tsx (session switch + config)
        → model.ts (auto-clone + scan)
            → store.ts (prDiffRanges + mainRepoConfig)
                → link-routing.ts (diff URL vs blob URL)
```

The pipeline is sequential — each step depends on the previous. Test from the inside out: pure logic first (vitest), then the seams (vitest with mocks), then the full chain (Playwright).

---

## Small tests (vitest) — pure logic, no browser

### WW-S01: URL hash parsing

* **flow:** raw `window.location.hash` string → parsed config object
* **subsystems:** content.ts `parseNapHash(hash)`
* **what to test:**
  - full hash with all fields: `#nap-repo=github/org/repo&nap-branch=dev&napkin=01-v1/0100-feature`
    → `{ provider: 'github', napOwner: 'org', napRepo: 'repo', napBranch: 'dev', napkin: '01-v1/0100-feature' }`
  - defaults: `#nap-repo=github/org/repo` → `napBranch: 'main'`, `napkin: null`
  - gitlab provider: `#nap-repo=gitlab/org/repo` → `cloneUrl: 'https://gitlab.com/org/repo'`
  - no hash → `null` (not a nap link)
  - partial hash (missing nap-repo) → `null`
  - URL-encoded values → decoded correctly
* **where it breaks:** param extraction regex/split. Missing `nap-repo` should fail gracefully, not crash.
* **test size:** small
* **verification:** direct assert on return value

### WW-S02: state-key derivation

* **flow:** page URL + parsed hash → deterministic state-key string
* **subsystems:** content.ts `deriveStateKey(pageUrl, hashConfig)`
* **what to test:**
  - PR page: `github.com/diunko/nap-test-main/pull/1` + hash → key includes `diunko/nap-test-main/1/github/diunko/nap-test-nap/main`
  - non-PR: `github.com/diunko/nap-test-main/blob/main/` → pr-num = `0`
  - different PRs → different keys (the isolation guarantee)
  - same PR, different .nap repos → different keys
  - same PR, same .nap repo, different branches → different keys
* **where it breaks:** pathname parsing. GitHub URLs have many shapes (`/pull/1`, `/pull/1/files`, `/pull/1/commits`). All should extract PR num `1`.
* **test size:** small
* **verification:** direct assert on returned key string

### WW-S03: clone URL construction

* **flow:** provider + owner + repo → HTTPS clone URL
* **subsystems:** content.ts or a shared util
* **what to test:**
  - github: `github/diunko/nap-test-nap` → `https://github.com/diunko/nap-test-nap`
  - gitlab: `gitlab/org/project` → `https://gitlab.com/org/project`
  - unknown provider → sensible error or fallback
* **where it breaks:** unlikely, but the seam exists. Test it once.
* **test size:** small
* **verification:** string equality

### WW-S04: hunk range parsing from GitHub API `patch` field

* **flow:** `patch` string (unified diff without `---`/`+++` headers) → `Array<{start, end}>`
* **subsystems:** pr-diff.ts `parseHunkRanges(patch)`
* **what to test:**
  - single hunk: `@@ -50,5 +50,10 @@` → `[{start: 50, end: 59}]`
  - multiple hunks in one patch: two `@@` headers → two ranges
  - pure addition: `@@ -0,0 +1,30 @@` → `[{start: 1, end: 30}]` (new file)
  - pure deletion: `@@ -5,3 +4,0 @@` → range is at line 4 (marker, zero width on new side)
  - empty patch (binary file, or patch field missing) → `[]`
  - context window expansion: raw range `{50, 59}` → stored as `{47, 62}` (±3 for GitHub context lines)
* **where it breaks:** the `@@ -a,b +c,d @@` regex. GitHub's patch field starts directly with `@@` (no `diff --git` preamble). The existing `parseGitDiff` in v3 works on `git diff --unified=0` output — the adaptation to GitHub's `patch` format is the risky seam.
* **test size:** small
* **verification:** assert on returned range arrays. Use real patch strings from the fixture PR's API response.

### WW-S05: SHA256 diff anchor construction

* **flow:** file path string → `#diff-{64-char-hex}R{line}`
* **subsystems:** link-routing.ts or pr-diff.ts `buildDiffAnchor(filePath, line)`
* **what to test:**
  - known path: `modules/delivery/order-router.ts` → verify hex matches `crypto.subtle.digest` output
  - different paths → different hashes
  - line number appended: `...R54`
  - the hash matches what GitHub actually generates (golden test against known fixture PR anchor)
* **where it breaks:** encoding. GitHub SHA256s the file path as UTF-8 bytes. If the implementation uses a different encoding, the anchor won't match. The golden test catches this.
* **test size:** small (crypto.subtle available in Node 18+)
* **verification:** assert hex string. Golden test: manually grab the real anchor from the fixture PR's HTML and compare.

### WW-S06: diff-aware link routing decisions

* **flow:** `(filePath, line, prDiffRanges, isPR)` → `'diff'` | `'blob'`
* **subsystems:** link-routing.ts routing logic
* **what to test:**
  - not a PR page → always blob
  - file in diff, line within hunk range → diff URL
  - file in diff, line outside all hunks → blob URL (at PR branch)
  - file NOT in diff → blob URL (at PR branch)
  - file added in PR (entire file is one hunk) → diff URL
  - null prDiffRanges (not fetched yet) → blob URL fallback
  - edge: line exactly at hunk boundary (start and end) → diff URL
  - edge: line at context boundary (start-3, end+3) → diff URL (context window)
* **where it breaks:** the range check. Off-by-one on hunk boundaries. The ±3 context window calculation.
* **test size:** small
* **verification:** assert on routing decision + constructed URL

### WW-S07: prDiffRanges persistence round-trip

* **flow:** store prDiffRanges → persist to IDB → recreate store → hydrate → same data
* **subsystems:** store.ts (partialize must include prDiffRanges)
* **what to test:**
  - set prDiffRanges with a sample map → persist → recreate store with same key → ranges hydrated
  - different session key → null ranges (no cross-contamination)
  - null ranges → persist → hydrate → still null (not accidentally defaulted to empty)
* **where it breaks:** `partialize` function doesn't include `prDiffRanges`. This is the most likely bug — forgetting to add the new field to the persist list.
* **test size:** small (uses `createMemoryStorage()` like existing SS-03 tests)
* **verification:** assert hydrated state matches written state

---

## Medium tests (vitest with mocks) — seams between subsystems

### WW-M01: content script → panel message flow

* **flow:** content.ts parses hash → sends `nap-config` message → index.tsx receives → session switch + config set
* **subsystems:** content.ts, index.tsx (App component's message listener)
* **what to test:**
  - mock `chrome.runtime.sendMessage` in content.ts context
  - verify message shape: `{ type: 'nap-config', key, config: { cloneUrl, napBranch, napkinFocus, mainOwner, mainRepo } }`
  - on the receiving side: mock `chrome.runtime.onMessage` listener, fire the message
  - verify `createSession(key)` called with correct key
  - verify `store.setMainRepo()` called with `{ owner, repo, branch }` from config
  - verify `store.expandCard()` called with napkin slug from config
* **where it breaks:** message shape mismatch. Content script sends one shape, panel expects another. Also: the listener must handle missing fields gracefully (user navigates to a page without a hash).
* **test size:** medium (needs message passing mock, but no real browser)
* **verification:** spy on store actions

### WW-M02: auto-clone trigger on empty session

* **flow:** session created → model.init() → LFS empty → programmatic `git clone` → onCommandComplete → nav populates
* **subsystems:** model.ts, shell exec, store
* **what to test:**
  - create session with empty LFS (mock adapter returns empty readdir for /home/user/)
  - fire the config message with a cloneUrl
  - verify shell receives clone command (spy on shell.exec or terminal input)
  - simulate clone completion: write repo files to mock adapter → trigger onCommandComplete
  - verify nav populates (store.refreshNav called with non-empty sections)
* **where it breaks:** the handoff between "config received" and "clone started". Who triggers the clone — index.tsx after session creation, or model.init()? The answer: index.tsx, because model.init() just scans existing repos. The clone must be triggered explicitly after session setup.
* **test size:** medium
* **verification:** spy chain: config received → clone command issued → nav populated

### WW-M03: fetch latest end-to-end mock

* **flow:** click [fetch latest] → git fetch + checkout → onCommandComplete → nav refreshes + prDiffRanges re-fetched
* **subsystems:** header bar, shell exec, model, pr-diff fetch
* **what to test:**
  - mock shell to accept fetch+checkout commands
  - verify commands executed in order: `git fetch origin`, then `git checkout origin/main`
  - after command completion: model.refreshNav called
  - after nav refresh: PR diff ranges re-fetched (fetch spy called)
* **where it breaks:** command sequencing. Two separate git commands that must run in order. If fetch fails, checkout shouldn't run. If checkout fails, nav should still refresh (fetch might have updated refs).
* **test size:** medium
* **verification:** command spy sequence + store state after

### WW-M04: GitHub API fetch → diff range map

* **flow:** `fetchPrFiles(owner, repo, prNum)` → GitHub API → parse response → `Record<filepath, ranges[]>`
* **subsystems:** pr-diff.ts
* **what to test:**
  - mock fetch with fixture PR response (order-router.ts changed, warp-queue.ts changed, crust-validator.ts absent)
  - verify map has `modules/delivery/order-router.ts` with hunk ranges
  - verify map has `modules/queue/warp-queue.ts` with hunk ranges
  - verify `modules/validation/crust-validator.ts` is NOT in the map
  - 404 response (private repo, no PAT) → graceful failure, null ranges
  - rate-limited response (403) → graceful failure
  - network error → graceful failure
* **where it breaks:** response parsing. The GitHub API returns `filename` (full path) and `patch` (unified diff). If the path normalization differs from what link-routing expects (leading slash? no leading slash?), the lookup fails silently — links fall back to blob, which is wrong but looks like "it works." This is a sneaky bug.
* **test size:** medium (mock fetch)
* **verification:** assert map keys match expected file paths exactly

---

## Medium tests (Playwright) — real browser, real extension

### WW-P01: hash parsing → session switch

* **flow:** navigate to `github.com/diunko/nap-test-main/pull/1#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline` → panel receives config → session key set
* **subsystems:** content.ts, index.tsx, store
* **what to test:**
  - navigate to the fixture PR URL with hash
  - open side panel
  - verify `__napStore__.getState().mainRepoConfig` is set: `{ owner: 'diunko', repo: 'nap-test-main', branch: ... }`
  - verify session key is derived correctly (check via exposed debug API or store inspection)
* **where it breaks:** content script timing. The hash must be parsed BEFORE the panel opens, or the message arrives after session creation. Also: GitHub SPA navigation may strip or modify the hash.
* **test size:** medium (real Chrome, real GitHub page load)
* **verification:** store state inspection via `panel.evaluate()`

### WW-P02: auto-clone on first visit (gate test)

* **flow:** navigate with hash → panel opens → clone starts automatically → nav populates → napkin focused
* **subsystems:** content.ts → index.tsx → terminal → model → store → sidebar
* **what to test:**
  - navigate to fixture PR URL with hash (first visit — clean IDB)
  - open side panel
  - clone should start without user typing (verify terminal shows clone progress OR nav populates)
  - wait for nav to populate (navSections.length > 0)
  - verify focused card matches the napkin from the hash (focusedCardSlug contains 'delivery-pipeline' or '0100')
  - verify mainRepoConfig is set (auto-detected from URL, no settings step)
* **why this is the gate test:** if auto-clone doesn't work, W1/W2/W3/W7/W8 all fail. This test must pass before anything else matters.
* **where it breaks:**
  - programmatic clone: writing `git clone ...\r` to shell input vs calling shell.exec()
  - timing: config message arrives before panel is ready to receive it
  - session key derivation mismatch between content script and panel
* **test size:** medium (network: git clone ~5-10s)
* **verification:** store state + DOM (napkin card visible in sidebar)

### WW-P03: return visit — instant restore

* **flow:** same URL as WW-P02, second visit → IDB has repo → nav populates instantly → no clone
* **subsystems:** model.scanExistingRepos(), Zustand persist hydration
* **what to test:**
  - run WW-P02 first (or seed IDB)
  - close panel, reopen (or navigate away and back)
  - nav populates without git clone (no terminal output for clone)
  - focused card, active file, mainRepoConfig restored from IDB
  - [fetch latest] button visible
* **where it breaks:** session key must be identical on return visit. If the hash changes (GitHub normalizes it), a new session is created → empty LFS → unnecessary re-clone.
* **test size:** medium
* **verification:** timing (nav populated in <2s, not 10-30s of clone) + store state

### WW-P04: session switch between PRs

* **flow:** visit PR 42 → auto-clone → navigate to PR 87 → new session → navigate back to PR 42 → state restored
* **subsystems:** content.ts hash change detection, index.tsx session switching, IDB isolation
* **what to test:**
  - navigate to PR page (with hash) → clone → nav populates
  - navigate to a different PR page (different hash) → session switches → empty panel (or auto-clone for new PR)
  - navigate back to first PR → session restored from IDB
  - verify no cross-contamination: tabs, focused card, mainRepoConfig are independent
* **where it breaks:** hash change listener. GitHub SPA navigation doesn't always trigger `hashchange`. The content script must also listen for `popstate` or mutation observer on the URL.
* **test size:** medium
* **verification:** store state at each step. Compare focusedCardSlug and tabs across sessions.

### WW-P05: diff-aware link routing — changed file → diff view

* **flow:** Cmd+click `order-router.ts:54` in mini-book → GitHub tab navigates to `pull/1/files#diff-{hash}R54`
* **subsystems:** link-routing.ts, pr-diff.ts, content.ts (navigate message)
* **what to test:**
  - set up: auto-clone, open chapter 01, verify link exists
  - Cmd+click `order-router.ts:54` link
  - GitHub tab URL contains `pull/` and `files#diff-`
  - URL contains `R54` (or appropriate mapped line)
  - the diff view actually renders (page load succeeds, no 404)
* **where it breaks:** SHA256 anchor mismatch. If `buildDiffAnchor('modules/delivery/order-router.ts')` produces a hash that doesn't match GitHub's, the page loads but doesn't scroll to the file. The reviewer sees the PR diff page but not the right file. Subtle, frustrating.
* **test size:** medium (network: GitHub page load)
* **verification:** URL inspection + optionally verify the diff element is visible on the GitHub page

### WW-P06: diff-aware link routing — unchanged file → blob view

* **flow:** Cmd+click `crust-validator.ts:40` in mini-book → GitHub tab navigates to `blob/{branch}/modules/validation/crust-validator.ts#L40`
* **subsystems:** link-routing.ts (blob fallback path)
* **what to test:**
  - same setup as WW-P05
  - Cmd+click `crust-validator.ts:40` link
  - GitHub tab URL contains `blob/` (not `pull/` or `files#diff-`)
  - URL contains `crust-validator.ts`
  - URL contains `#L40`
* **where it breaks:** the diff range lookup. If crust-validator.ts accidentally ends up in prDiffRanges (API response parsing error), it routes to diff view where it doesn't exist → blank scroll.
* **test size:** medium
* **verification:** URL string assertions

### WW-P07: fetch latest updates content

* **flow:** click [fetch latest] → git fetch + checkout → nav refreshes → editor content updated
* **subsystems:** header bar, shell, model, store
* **what to test:**
  - start from WW-P02 state (repo cloned)
  - click [fetch latest] button
  - wait for terminal to show fetch/checkout output
  - verify nav refreshes (or at minimum, no crash)
  - if a file was open in editor, verify it reloads after fetch
* **where it breaks:** git fetch in isomorphic-git + LightningFS. This is a real I/O operation in an in-browser git implementation. Fetch might fail silently, or checkout might fail if there are uncommitted changes (the user was editing a file).
* **test size:** medium (network: git fetch)
* **verification:** terminal output inspection + store state

---

## Debugging scenarios for the fs-eng

The fs-eng builds these subsystems incrementally. At each phase, they need a Playwright scenario to verify the wiring works before moving on.

### Phase 1: hash parsing + config message

**Build:** content.ts hash parser + `nap-config` message
**Run:** WW-P01
**Expected log trace:**
```
[content] loaded on https://github.com/diunko/nap-test-main/pull/1#nap-repo=...
[content] parsed hash: { provider: 'github', napOwner: 'diunko', napRepo: 'nap-test-nap', ... }
[content] derived state-key: diunko/nap-test-main/1/github/diunko/nap-test-nap/main
[content] sending nap-config message
```
**Verify:** open panel, check `__napStore__.getState().mainRepoConfig` in console.

### Phase 2: session switch + mainRepoConfig

**Build:** index.tsx `nap-config` handler → createSession + setMainRepo + expandCard
**Run:** WW-P01 (extended — also check session key and focused card)
**Expected log trace:**
```
[session] switching to key: diunko/nap-test-main/1/github/diunko/nap-test-nap/main
[session] created: key=diunko/nap-test-main/1/..., lfs=nap-fs-diunko/..., ui=nap-ui-diunko/...
[store] setMainRepo { owner: 'diunko', repo: 'nap-test-main', branch: '...' }
[store] expandCard 0100-delivery-pipeline
```
**Verify:** `__napStore__.getState()` shows correct `mainRepoConfig` and `focusedCardSlug`.

### Phase 3: auto-clone

**Build:** programmatic clone trigger after session setup
**Run:** WW-P02 (gate test)
**Expected log trace:**
```
[model] ensured /home/user exists
[model] scanning for existing repos on startup
[model] startup scan: no existing repos found
[auto-clone] starting: git clone https://github.com/diunko/nap-test-nap
... (git clone progress) ...
[terminal] commandComplete git clone https://github.com/diunko/nap-test-nap
[model] git command detected → scanning for nepic root
[model] found nepic root: /home/user/nap-test-nap/nepics/01-v1
[model] repo-changed → refreshNav
[store] refreshNav → navSections updated (N sections)
```
**Verify:** sidebar shows napkin cards. Terminal tab shows clone output.

### Phase 4: fetch latest

**Build:** wire [fetch latest] button → git fetch + checkout
**Run:** WW-P07
**Expected log trace:**
```
[fetch-latest] starting: git fetch origin
[terminal] commandComplete git fetch origin
[fetch-latest] git checkout origin/main
[terminal] commandComplete git checkout origin/main
[model] git command detected → scanning for nepic root
[model] repo-changed → refreshNav
```
**Verify:** no crash. Nav still shows cards after fetch.

### Phase 5: diff-aware routing

**Build:** pr-diff.ts (API fetch + parse), updated link-routing.ts
**Run:** WW-P05 + WW-P06
**Expected log trace (diff path):**
```
[link] routing: href=/modules/delivery/order-router.ts#L54 source=...
[link] file in prDiffRanges, line 54 within hunk {start: 46, end: 62}
[link] → diff URL: https://github.com/diunko/nap-test-main/pull/1/files#diff-{hex}R54
[content] navigating to https://github.com/...
```
**Expected log trace (blob path):**
```
[link] routing: href=/modules/validation/crust-validator.ts#L40 source=...
[link] file NOT in prDiffRanges
[link] → blob URL: https://github.com/diunko/nap-test-main/blob/{branch}/modules/validation/crust-validator.ts#L40
[content] navigating to https://github.com/...
```
**Verify:** GitHub tab URL matches expected pattern.

---

## Story-to-test mapping

| Story | Test(s) | Gate? |
|---|---|---|
| W1 (shared link zero-config) | WW-P02 | YES — the gate test |
| W2 (auto-clone shows progress) | WW-P02 (terminal output check) | YES |
| W3 (return visit instant resume) | WW-P03 | |
| W4 (fetch latest) | WW-P07 | |
| W5 (different PR, different session) | WW-P04 | |
| W6 (non-PR page) | WW-S02 (key has pr=0) + WW-P01 variant | |
| W7 (napkin focus from URL) | WW-P02 (focusedCardSlug check) | |
| W8 (mainRepoConfig from URL) | WW-P01 + WW-P02 | |
| W9 (GitLab .nap repo) | WW-S01 (gitlab provider) + WW-S03 (gitlab URL) | |
| W10 (link visual affordances) | manual verification (visual) | |

---

## Test execution order

The fs-eng should run tests in this order as they build each phase:

1. **WW-S01..S03** — hash parsing, key derivation, clone URL (pure, instant, no infra)
2. **WW-P01** — hash → panel config (first real browser test, proves content script works)
3. **WW-P02** — auto-clone gate test (proves the full pipeline, slow but essential)
4. **WW-S04..S06** — hunk parsing, SHA256, routing decisions (pure logic for diff-aware routing)
5. **WW-M04** — GitHub API fetch mock (proves API integration before hitting real network)
6. **WW-P05, WW-P06** — diff-aware links in real browser (the payoff)
7. **WW-P03, WW-P04** — return visit + session switch (persistence and isolation)
8. **WW-P07** — fetch latest (least critical, can be deferred)
9. **WW-S07** — prDiffRanges persistence (should "just work" if partialize is correct)

---

## Key risks and mitigations

### Risk 1: SHA256 anchor mismatch with GitHub
GitHub computes `SHA-256(filepath)` where filepath is the path relative to repo root. If we compute it with a leading slash or different encoding, the anchor won't match. **Mitigation:** golden test (WW-S05) with a real anchor from the fixture PR.

### Risk 2: content script timing
The hash must be parsed and config sent before the panel requests it. If the panel opens before the content script runs, the config is lost. **Mitigation:** WW-P01 verifies the end-to-end flow. If timing is an issue, the panel should poll or the content script should re-send on connection.

### Risk 3: GitHub API patch format vs git diff format
The existing `parseGitDiff` in v3 parses `git diff --unified=0` output. GitHub's API `patch` field has a slightly different format (starts with `@@`, no `diff --git` header). **Mitigation:** WW-S04 uses real patch strings from the fixture PR API response.

### Risk 4: prDiffRanges not persisted
If `partialize` doesn't include `prDiffRanges`, return visits will re-fetch the API on every panel open. Not a crash, but unnecessary latency. **Mitigation:** WW-S07 explicitly tests the persistence round-trip.

### Risk 5: hash change detection on GitHub SPA
GitHub uses SPA navigation — `hashchange` may not fire on pushState transitions. **Mitigation:** WW-P04 tests navigation between PRs. If detection fails, the test catches it.
