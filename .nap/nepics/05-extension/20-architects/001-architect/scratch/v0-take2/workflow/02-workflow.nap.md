# extension workflow v2

* entry: link shared by PR author
  * format: `https://github.com/{owner}/{repo}/pull/{n}#nap-repo={provider}/{nap-owner}/{nap-repo}&nap-branch={branch}&napkin={nepic}/{napkin}`
  * non-PR: `https://github.com/{owner}/{repo}/blob/{branch}/#nap-repo=...&napkin=...`
  * provider: `github` or `gitlab` — determines clone URL + CORS proxy
    * `nap-repo=github/diunko/nap-repo` → `https://github.com/diunko/nap-repo`
    * `nap-repo=gitlab/org/nap-repo` → `https://gitlab.com/org/nap-repo`
    * main repo remains github-only (that's where the PR lives)
    * change is limited to clone-time (URL + transport) and parse-time only
  * nap-branch defaults to `main` (v0 only supports main, placeholder for checkout in v1)
  * who generates: nap.app (`nap3 share-link` or similar) — outside extension scope
  * extension documents expected format

* content script parses the hash
  * fragment survives GitHub SPA navigation (verified)
  * extracts: owner, repo, branch, PR number (0 if non-PR), nap-repo, nap-branch, napkin path
  * sends to side panel on open

* state-key: `{main-repo}/{main-branch}/{pr-num}/{nap-repo}/{nap-branch}`
  * each state-key gets its own LightningFS instance (`nap-ext-{hash}`)
  * switching PRs = switching FS, instant if visited before
  * UI state (open file, scroll position) stored per state-key

* panel open flow
  * if no state for this key → fresh start
    * nav empty, status tab focused
    * auto-clone nap-repo (main branch only in v0)
    * on clone complete → nav populates, focus on napkin from URL
  * if state exists → resume
    * nav + editor restore from last session
    * show [fetch latest] button in header
    * [fetch latest] → `git fetch && git checkout origin/main` (reset to remote HEAD)

* napkin focus
  * URL specifies `napkin={nepic}/{napkin}` → that napkin is focused
  * focused = only this napkin shown in nav by default
  * toggle in header to show all napkins in the nepic
  * essential for review — reviewer sees what the PR author intended, not the whole tree

* main-repo config — automatic
  * content script reads `github.com/{owner}/{repo}` from URL
  * PR branch from head ref (DOM or API)
  * no manual settings for this — it's on screen
  * file:line links resolve to `github.com/{owner}/{repo}/blob/{branch}/...`

* nav tree structure
  * reads from LightningFS: `nepics/{nepic}/30-napkins/{napkin}/`
  * focused napkin expanded by default, others hidden (or collapsed)
  * agents, chapters, specs visible under focused napkin

* fixtures need nepics
  * prod .nap repos have `nepics/` directory
  * update fixtures:
    * `fixtures/.nap/nepics/01-v1/` — current space-pizza content moved here
    * `fixtures/.nap/nepics/02-next/` — placeholder (empty napkins)
  * URL becomes: `napkin=01-v1/0100-delivery-pipeline`

* reading flow (unchanged)
  * nav → click chapter → editor → Cmd+click file:line → GitHub tab

* editing flow
  * add // comments → auto-save to IDB
  * terminal: `git add . && git commit -m "review" && git push`
  * needs PAT for private repos
  * CORS proxy needed (public for now, own proxy for prod)

* what's v0 vs v1
  * v0: main branch only, auto-clone, napkin focus, fetch latest, link-based entry
  * v1: branch checkout from URL, git pull with merge, multiple reviewers
