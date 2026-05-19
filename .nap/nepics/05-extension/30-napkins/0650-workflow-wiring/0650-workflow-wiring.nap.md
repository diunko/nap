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

* what to build
  * content.ts: URL hash parser + session-key derivation + config message
  * index.tsx: receive config from content script → auto-clone or restore → set mainRepoConfig → set focused napkin
  * git-command.ts: add `git fetch` and `git checkout` subcommands
  * shell programmatic exec: trigger clone from JS, not user keyboard input
  * header bar: wire [fetch latest] button
  * loading state in nav during clone

* polish (small, do alongside)
  * link visual affordances: register Monaco ILinkProvider for pointer cursor + underline on hover
  * remove manual settings for mainRepoConfig (auto-detected from URL)
  * keep settings for PAT only (private repos still need it)

* what's NOT in this napkin
  * PR branch checkout (v0 is main only, placeholder for v1)
  * merge conflict handling on fetch
  * multiple simultaneous sessions in the UI (v0 switches, doesn't split-screen)
