# extension workflow

* setup: reviewer on github.com/org/repo/pull/42, opens panel
  * needs .nap repo URL — not discoverable from PR page
  * needs main-repo config — but they're already on it

* .nap repo discovery
  * // should be per-PR
    * // idea: different people own PRs
    * // and they work on them using their agents and napkins
      * // and share their .nap as a sidecar to PR
  * convention: `{org}/{repo}-nap` → auto-derive from URL
  * config file: `.nap-config.json` in main repo root (GitHub API read)
  * manual once, remember: user types URL, stored in chrome.storage.sync
  * PR description: author writes `.nap: org/repo-nap`, extension parses
    * // what's the most reliable way for extension to get it?
    * // should include: 
      * // github repo branch (main by default)
      * // path to napkin in that repo

* main-repo detection — should be automatic
  * content script reads `github.com/{owner}/{repo}/pull/{n}`
  * sends to side panel → mainRepoConfig set, no settings needed
  * branch from PR head ref
  * // we don't have PR in our setup
    * // shoud include it!
    * // makes for more complex stories; but should keep simple
  * // so it should support both:
    * // just main repo
    * // PR

* navigating to different PR
  * same repo, different PR → branch changes
    * // also fully changes git fs i think
    * // can we 
  * different repo → everything changes
  * does panel reset? re-clone? keep multiple in IDB?

* the clone step
  * today: manual `git clone` in terminal
  * better: one-click "clone" button in empty nav state
    * uses derived .nap URL, terminal shows it happening
  * auto-clone on panel open? magic but unprompted network request

* reading flow — works after take1 fixes
  * nav tree → click chapter → editor → Cmd+click file:line → GitHub tab

* push: `git push` from terminal, needs PAT + CORS proxy
  * public cors.isomorphic-git.org not production-ready

* multiple reviewers: v0 ignores, single-reviewer assumed

* full config for main/main-PR + nap:
  * main + nap
    * which main repo? which branch?
    * which nap repo? which branch?
      * which napkin? (path)
        * -> makes that napkin focused
        * -> show _only focused_ by default
          * -> have option to show all napkins in that nepic
  * main PR + nap
    * which main repo? which branch? which PR? // yes
    * which nap repo? which branch? // yes
      * which napkin? (path)
        * -> makes that napkin focused
        * -> show _only focused_ by default
          * -> have option to show all napkins in that nepic



* =========
* okay, i got a better idea
  * we share review with the link: 
    * (pr present) https://github.com/coda/coda/pull/140369#nap-repo=github/diunko/nap-repo&nap-branch=NAP_BRANCH&napkin=NEPIC_SLUG/NAPKIN_SLUG
      * extension parses repo and branch from PR head, yields key of
        * state-key := main repo / main branch / PR-num / nap repo / nap branch
    * (non-pr, just branch) https://github.com/diunko/nap-test-main/blob/main/#nap-repo=github/diunko/nap-repo&nap-branch=NAP_BRANCH&napkin=NEPIC_SLUG/NAPKIN_SLUG
      * => this yields key of 
        * state-key := main repo / main branch / 0 / nap repo / nap branch
          * no PR = 0 for PR number
    * user (reviewer) opens a link
    * clicks [n] to open side-panel
  * extension has state keyed by [state-key]
    * state is:
      * extension ui state
      * fs keyed by [state-key]
  * if ext is not initialized for this [state-key]
    * state gets initialized and stored as [state-key]
    * panel opens
      * shows empty nav and loading state in status panel
      * status panel is focused by default
      * it's one of the panels, in this order: (editor | status | terminal) 
      * nav is empty at this point
    * ext looks up fs id-ed by github/diunko/nap-repo/nap-branch
      * if the fs doesn't exist
        * creates fs
        * does git clone and checkout of that branch
        * shows error if not found
          * if ok, continues ↓ to [if repo exists]
      * if the fs exists and repo exists (and thus points to right branch)
        * shows reader + nav for that branch
        * shows button [fetch latest] (~header)
        * focuses on NEPIC_SLUG/NAPKIN_SLUG napkin
          * by default other napkins are hidden
            * there is a stored setting (can be global) if they are shown/hidden
          * there is a toggle to show-hide (~header)
  * if ext is initialized for this [state-key]
    * it opens in latest known state
    * shows the button [fetch latest] (~header)
      * when clicked on this button, 
        * git fetch && git checkout latest of that branch
  






