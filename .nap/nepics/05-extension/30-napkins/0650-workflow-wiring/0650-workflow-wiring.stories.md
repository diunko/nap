# workflow wiring — stories

## W1: the shared link — zero-config start

* teammate posts link: `github.com/diunko/nap-test-main#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
* reviewer clicks link → GitHub page loads, nap-test-main visible
* reviewer clicks [n] → side panel opens
* nav shows: "cloning nap-test-nap..." loading state
* clone completes → nav populates with 0100-delivery-pipeline focused
* file:line links work immediately (mainRepoConfig auto-detected from URL)
* reviewer is reading within 15 seconds of clicking the link
* no settings, no manual clone, no config step

## W2: auto-clone shows progress

* fresh session (never visited this PR before)
* panel opens → nav shows loading indicator
* terminal tab shows clone progress ("Cloning into 'nap-test-nap'... done.")
* on clone complete: loading indicator disappears, nav tree renders
* the clone is visible in the terminal — not hidden magic

## W3: return visit — instant resume

* same link as W1, second time
* panel opens → IDB has the repo from last time
* nav populates instantly (scanExistingRepos, no network)
* last focused card, last open file restored from Zustand persist
* [fetch latest] button visible in header
* reviewer picks up where they left off

## W4: fetch latest pulls updates

* return visit (W3), repo already in IDB
* teammate pushed new commits to the .nap repo
* click [fetch latest] → git fetch + checkout origin/main
* nav refreshes — new files appear, modified content updates
* editor reloads if the open file was modified

## W5: different PR, different session

* reviewer visited PR 42 → session-key includes pr-42
* navigates to PR 87 (same repo) → hash changes → new state-key
* content script sends new config → session switches
* empty panel (PR 87 never visited) → auto-clone
* navigate back to PR 42 → session switches back → state restored
* the two PRs don't share filesystem or UI state

## W6: non-PR page

* link: `github.com/diunko/nap-test-main/blob/main/#nap-repo=github/diunko/nap-test-nap`
* no PR number → state-key has pr=0
* everything else works the same (clone, nav, reading, links)

## W7: napkin focus from URL

* hash includes `napkin=01-v1/0100-delivery-pipeline`
* after nav populates: 0100-delivery-pipeline card auto-focused (expanded)
* 0200-crust-validation collapsed
* the reviewer sees what the author intended, not the whole tree

## W8: mainRepoConfig from URL

* content script reads `github.com/diunko/nap-test-main` from the page URL
* sends mainOwner=diunko, mainRepo=nap-test-main to the panel
* file:line links resolve to `github.com/diunko/nap-test-main/blob/main/...`
* no settings gear needed for this — it's automatic

## W9: GitLab .nap repo

* hash: `#nap-repo=gitlab/org/project-nap&napkin=...`
* content script parses provider=gitlab
* clone URL: `https://gitlab.com/org/project-nap`
* extension host_permissions include gitlab.com
* clone works (no CORS proxy needed)
* everything else identical

## W10: link visual affordances

* chapter open in editor
* file:line links visible: underlined, link color (#1e50c0)
* Cmd+hover: pointer cursor appears
* Cmd+click: navigates GitHub tab
* .md links: same styling, click loads in editor
