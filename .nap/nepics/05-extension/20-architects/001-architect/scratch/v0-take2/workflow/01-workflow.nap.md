# extension workflow — how a reviewer actually uses this

* the setup moment
  * reviewer lands on github.com/org/main-repo/pull/42
  * opens side panel
  * now what?
    * they need to clone the .nap repo — but which one?
    * they need to set the main repo — but it's the one they're already on
    * two manual steps before anything works

* connecting .nap repo to main repo
  * today: user manually types git clone URL + sets main-repo in settings
  * the tension: .nap repo URL is not discoverable from the PR page
    * .nap is gitignored in main repo — no reference to it in the PR
    * .nap repo has its own GitHub remote — different owner/repo potentially
  * options
    * convention: .nap repo is always `{org}/{main-repo}-nap`
      * auto-derive clone URL from the GitHub page the user is on
      * simple but rigid — what if naming doesn't match?
    * config file: `.nap-config.json` in main repo root (not gitignored)
      * `{ "napRepo": "org/main-repo-nap" }`
      * extension reads it via GitHub API on PR page load
      * explicit, works for any naming, but requires a file in main repo
    * manual first time, remember after
      * user types clone URL once, extension stores the mapping
      * `github.com/org/main-repo` → `github.com/org/main-repo-nap`
      * persisted in chrome.storage.sync — works across devices
    * PR description convention
      * author puts `.nap: org/repo-nap` somewhere in PR description
      * extension parses it — auto-clone on panel open

* main-repo detection
  * today: manual settings → set owner/repo/branch
  * should be automatic — user is ON the main repo page
  * content script reads URL: `github.com/{owner}/{repo}/pull/{n}`
  * sends to side panel: { owner, repo, branch }
  * side panel sets mainRepoConfig automatically
  * branch: from PR head ref (API or DOM scraping)
  * no settings needed for this — it's already on screen

* what happens when user navigates to a different PR
  * same repo, different PR → branch changes, .nap content may differ
  * different repo → everything changes
  * does the panel reset? reload from IDB? re-clone?
  * IDB stores one clone at a time? multiple?

* the clone step itself
  * user types `git clone` in terminal — that's deliberate, explicit
  * but it's friction for the 90% case
  * alternative: "clone" button in the empty nav tree state
    * one click, uses the derived .nap URL
    * still uses git clone under the hood (terminal shows it happening)
  * or: auto-clone on first panel open for a PR
    * feels magic but could be slow/confusing
    * user didn't ask for it — network request happening unprompted

* after clone — the reading flow
  * nav tree shows .nap structure
  * user clicks a chapter → editor opens
  * user reads, Cmd+clicks file:line → GitHub tab shows code
  * user adds // comment → auto-saves → git add/commit/push from terminal
  * this part works (after take1 fixes)

* the push step
  * user adds comments, commits locally
  * `git push` from terminal
  * needs PAT for private repos
  * CORS proxy needed — currently using public cors.isomorphic-git.org
    * not reliable for production
    * own proxy needed eventually
  * after push: .nap repo on GitHub has the review comments
  * PR author sees them on next pull

* multiple reviewers
  * each reviewer clones .nap into their own IDB
  * each pushes their own commits
  * merge conflicts if two reviewers edit same line
  * git handles this — but the UX of merge conflicts in the terminal is rough
  * v0: ignore this, single-reviewer assumed
