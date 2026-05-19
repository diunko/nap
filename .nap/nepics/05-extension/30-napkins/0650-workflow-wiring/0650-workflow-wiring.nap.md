# workflow wiring — link entry → session → auto-clone

* what: connect the reviewer workflow to the extension
  * teammate shares a link → reviewer clicks → panel opens → repo clones → reading starts
  * the session isolation is built (0600) — this napkin connects it to the entry point

* the link format
  * `https://github.com/{owner}/{repo}/pull/{n}#nap-repo={provider}/{nap-owner}/{nap-repo}&nap-branch={branch}&napkin={nepic}/{napkin}`
  * non-PR: `https://github.com/{owner}/{repo}/blob/{branch}/#nap-repo=...&napkin=...`
  * provider: `github` or `gitlab` — determines clone URL
  * nap-branch: defaults to `main` (v0 only)

* content script parses the hash
  * on github.com page load: read window.location.hash
  * parse: nap-repo, nap-branch, napkin path
  * derive state-key: `{main-owner}/{main-repo}/{pr-num}/{nap-provider}/{nap-owner}/{nap-repo}/{nap-branch}`
  * send to side panel via chrome.runtime.sendMessage({ type: 'session-key-changed', key, config })
  * config includes: clone URL, napkin focus path, main repo (from the GitHub page URL)

* side panel receives config
  * on session-key-changed message:
    * createSession(key) — gets own LFS + store + model (already built in 0600)
    * store.setMainRepoConfig from the parsed URL (auto-detect, no manual settings needed)
    * store.setFocusedNapkin from the napkin path in the hash

* auto-clone on fresh session
  * if LFS is empty (no repos in /home/user/):
    * show loading state in nav: "cloning {nap-repo}..."
    * terminal executes `git clone {clone-url}` programmatically (not user-typed)
    * onCommandComplete → model scans → nav populates → focus on specified napkin
  * if LFS has the repo (return visit):
    * model.scanExistingRepos → nav populates immediately
    * show [fetch latest] button in header

* fetch latest
  * button in header bar (already exists in mock-e)
  * executes: `cd {repo} && git fetch origin && git checkout origin/{branch}`
  * resets working tree to remote HEAD
  * onCommandComplete → model refreshes nav → store updates → React re-renders
  * if user had uncommitted edits: they're lost (git checkout overwrites)
    * v0: acceptable — warn in UI before fetch? or just do it?

* napkin focus from URL
  * hash has `napkin={nepic}/{napkin}` — e.g. `napkin=01-v1/0100-delivery-pipeline`
  * after nav populates: store.expandCard(napkin-slug)
  * focused card expanded by default, others collapsed
  * the reviewer sees the napkin the PR author intended

* auto-detect mainRepoConfig
  * content script is on `github.com/{owner}/{repo}/pull/{n}`
  * owner + repo from the URL, branch from PR head ref (DOM: `.head-ref` element, or API)
  * send to panel alongside the session key
  * no manual settings step — file:line links just work

* what's already built (from 0600)
  * createSession(key) → LFS + store + model per key
  * __switchSession__(key) console API
  * chrome.runtime.onMessage handler for session-key-changed in index.tsx
  * Zustand persist with IndexedDB per key
  * model.init() with scanExistingRepos
  * all 55 tests passing

* PR diff-aware link routing
  * the problem: half the mini-book links point to files NOT in the PR diff
    * changed files → should navigate to PR diff view (Files Changed tab)
    * context files → should navigate to blob view (regular file view)
    * wrong choice → reviewer lands on wrong page or nothing scrolls
  * the solution: fetch PR file list, parse hunk ranges, route intelligently
  * GitHub API: `GET /repos/{owner}/{repo}/pulls/{n}/files`
    * response includes `patch` field with unified diff hunk headers
    * parse `@@ -N,N +N,N @@` → extract per-file line ranges on the new side
    * we already have `parseGitDiff` in the app (49 lines, pure function)
  * diff URL construction (no library needed):
    * `SHA256(filepath)` → 64-char hex → `pull/{n}/files#diff-{hex}R{line}`
    * `crypto.subtle.digest` built into every browser, 3 lines of code
    * `R{line}` = right-side (new file version) line number
  * the link router checks:
    * file in diff map AND line within hunk range (±3 context) → diff URL
    * file in diff map but line outside all hunks → blob URL at PR branch
    * file NOT in diff map → blob URL at PR branch
    * not a PR page → blob URL at branch
  * persisted in store (per-session IDB via Zustand persist)
    * first visit: fetch API → parse → store → persist
    * return visit: hydrate from IDB → links work instantly, no network
    * fetch latest: re-fetch API → update map → persist
  * stored as: `prDiffRanges: Record<string, Array<{start: number, end: number}>> | null`

* what to build
  * content.ts: URL hash parser + session-key derivation + config message
  * index.tsx: receive config from content script → auto-clone or restore → set mainRepoConfig → set focused napkin
  * git-command.ts: add `git fetch` and `git checkout` subcommands
  * shell programmatic exec: trigger clone from JS, not user keyboard input
  * header bar: wire [fetch latest] button
  * loading state in nav during clone
  * link-routing.ts: diff URL builder (SHA256 + hunk range check + blob fallback)
  * pr-diff.ts (new): fetch PR files, parse patch hunks, build diff range map
  * store.ts: add prDiffRanges to state + partialize for persistence

* polish (small, do alongside)
  * link visual affordances: register Monaco ILinkProvider for pointer cursor + underline on hover
  * remove manual settings for mainRepoConfig (auto-detected from URL)
  * keep settings for PAT only (private repos still need it)

* fixture PR
  * create a PR in diunko/nap-test-main with real file changes
  * branch `feature/delivery-v2` off main
  * modify order-router.ts (~10 lines around line 54)
  * modify warp-queue.ts (~5 lines)
  * leave crust-validator.ts unchanged
  * keep PR open permanently — it's a test fixture
  * mini-book chapters link to all three files — tests both diff and blob paths

* what's NOT in this napkin
  * PR branch checkout (v0 is main only, placeholder for v1)
  * merge conflict handling on fetch
  * multiple simultaneous sessions in the UI (v0 switches, doesn't split-screen)
