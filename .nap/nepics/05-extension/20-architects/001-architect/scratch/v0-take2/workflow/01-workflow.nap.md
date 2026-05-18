# extension workflow

* setup: reviewer on github.com/org/repo/pull/42, opens panel
  * needs .nap repo URL — not discoverable from PR page
  * needs main-repo config — but they're already on it

* .nap repo discovery
  * convention: `{org}/{repo}-nap` → auto-derive from URL
  * config file: `.nap-config.json` in main repo root (GitHub API read)
  * manual once, remember: user types URL, stored in chrome.storage.sync
  * PR description: author writes `.nap: org/repo-nap`, extension parses

* main-repo detection — should be automatic
  * content script reads `github.com/{owner}/{repo}/pull/{n}`
  * sends to side panel → mainRepoConfig set, no settings needed
  * branch from PR head ref

* navigating to different PR
  * same repo, different PR → branch changes
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
