# panel boot — stories

## B1: shared link — normal start

* teammate posts link with `#nap-repo=...&napkin=...`
* reviewer clicks → opens panel
* panel reads tab URL → session → auto-clone → nav → idle pane
* reviewer picks a chapter → reading
* also works after extension reload (no content script dependency)
* also works in separate windows (browser isolates sessions)

## B2: return visit

* same link, panel reopened
* session hydrates from IDB — nav instant, diff ranges cached, no clone
* reviewer picks up where they left off

## B3: no nap link / wrong page

* panel opens on github.com without hash → "ask the author for a review link"
* panel opens on non-github → "open on a GitHub page"
* no session, no terminal, no sidebar — just the message

## B4: refresh PR

* author pushes new code commits
* reviewer clicks [refresh PR] → re-reads tab URL → re-fetches diff ranges
* link routing reflects updated diff (changed files → diff view, removed files → blob)
* .nap content untouched

## B5: fetch latest

* author pushes new guide chapters
* reviewer clicks [fetch latest] → git fetch + checkout
* nav refreshes, editor reloads if open file changed
* diff ranges untouched

## B6: idle pane

* panel boots, nav shows cards, no file selected
* main area: repo/branch status, calm bg
* terminal hidden until reviewer clicks Terminal tab
* reviewer scans nav, picks a chapter → editor replaces idle pane
