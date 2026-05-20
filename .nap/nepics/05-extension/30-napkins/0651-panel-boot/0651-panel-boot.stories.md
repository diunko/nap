# panel boot — stories

## B1: shared link — normal start

* teammate posts: `github.com/org/repo/pull/42#nap-repo=github/org/nap-repo&napkin=01-v1/0100-feature`
* reviewer clicks → GitHub page loads
* reviewer opens side panel (icon or keyboard shortcut)
* panel reads tab URL → parses hash → creates session → auto-clones
* nav populates, napkin focused, file:line links work
* reviewer is reading within 15 seconds
* terminal visible only after session initialized — no blank black screen

## B2: return visit — instant resume

* same link as B1, panel reopened (or browser restarted)
* panel reads tab URL → same state key → session hydrates from IDB
* nav populates from filesystem scan (no clone)
* diff ranges hydrated from IDB (no API fetch)
* reviewer picks up where they left off

## B3: extension reload — no broken state

* developer reloads extension (chrome://extensions → reload)
* GitHub tab still open with the PR
* developer opens panel — panel reads tab URL directly
* works immediately — no "reload the page" dance
* content script may or may not be injected — doesn't matter for boot

## B4: two PRs, two windows

* reviewer clicks link A → window A, panel A reviewing PR 42
* reviewer clicks link B → window B, panel B reviewing PR 87
* each panel has its own session, filesystem, diff ranges
* switching between windows switches reviews — browser manages it
* no session-switching logic, no cross-contamination

## B5: panel open on non-nap page

* reviewer opens panel on `github.com/org/repo` (no hash)
* panel reads tab URL → no nap hash found
* shows connect modal: "connect to a .nap repo"
* fields: nap repo URL, branch, napkin path
* main repo owner/name auto-filled from current page URL
* reviewer fills in nap repo → submit → session created → clone → reading

## B6: panel open on non-GitHub page

* reviewer opens panel on `google.com` or `localhost`
* panel reads tab URL → not github.com
* shows message: "open on a GitHub page to start reviewing"
* no terminal, no sidebar, no session — just the message

## B7: refresh PR — code repo updated

* reviewer is mid-review on PR 42
* author pushes new code commits to the PR
* reviewer clicks [refresh PR] in header
* panel re-reads tab URL → re-parses hash → updates mainRepoConfig
* re-fetches diff ranges from GitHub API (new hunks from new commits)
* link routing now reflects the updated diff
* no .nap repo change — guide content untouched

## B8: fetch latest — .nap repo updated

* reviewer is mid-review on PR 42
* author pushes new guide chapters to the .nap repo
* reviewer clicks [fetch latest] in header
* git fetch + checkout in IDB filesystem
* nav refreshes — new/modified chapters appear
* editor reloads if open file was modified
* diff ranges untouched — this is guide content, not code

## B9: manual connect then link visit

* reviewer first opened panel on a bare page → used connect modal (B5)
* later, teammate sends the proper nap link for the same PR
* reviewer clicks link → new tab opens with hash
* opens panel → panel reads URL → gets full config from hash
* auto-clone (or IDB resume if same repo) — normal flow
* the manual session from B5 lives in a different tab — no conflict

## B10: Cmd+click link routing after refresh PR

* reviewer is on PR with diff ranges loaded
* author force-pushes, changing which files are in the diff
* reviewer clicks [refresh PR] → diff ranges re-fetched
* Cmd+click on a file that was in old diff but not new → now routes to blob
* Cmd+click on a file newly in diff → now routes to diff view
* routing reflects current PR state, not stale cache
