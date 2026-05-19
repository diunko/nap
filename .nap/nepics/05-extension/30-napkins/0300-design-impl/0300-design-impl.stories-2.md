# design impl — stories round 2 (minute-two pass)

What the user does immediately after each S1-S6 story succeeds. The obvious next actions.

## S2a: nav tree shows the FULL directory tree

* the fixture 0100-delivery-pipeline contains:
  * `0100-delivery-pipeline.nap.md` (main file)
  * `mini-book/` with 5 chapters (01-order-routing.md through 05-putting-it-together.md)
  * 3 agents (test-arch, fs-eng, test-eng) with prompt.md, response.md each
* ALL of these must be visible in the nav tree when the card is focused
* mini-book/ appears as a directory entry, expandable, showing its 5 .md children
* scratch/ under the architect should also be visible if present
* if a file or directory exists in the napkin, it shows in the nav. no exceptions.

## S3a: reading then navigating between chapters

* reviewer reads chapter 01, reaches the bottom: "Next: 02-warp-queue.md"
* Cmd+clicks the .md link → editor loads chapter 02
* the tab updates to show "02-warp-queue.md"
* the nav tree highlights 02-warp-queue.md (not still highlighting 01)
* reviewer wants to go back to chapter 01 — clicks it in the nav tree
* editor loads chapter 01, tab updates, nav highlights correctly
* at no point do stale contents appear in the editor

## S3b: reading a chapter with code blocks

* chapter 01 has inline code (backtick) and fenced code blocks
* inline code has tinted background, monospace (already monospace, but visually distinct)
* fenced code blocks have full-width tinted background
* code inside blocks is not word-wrapped — horizontal scroll if needed
* the code block doesn't break the reading flow — it's visually contained

## S4a: tab overflow and closing

* reviewer opens file A (ephemeral), then edits it (permanent)
* opens file B (ephemeral), edits it (permanent)
* opens file C (ephemeral) — now 3 tabs: A, B, C + Terminal
* all tab names are visible, or truncated with ellipsis if too long
* the X close button is always reachable — not obscured by long filenames
* reviewer closes tab B — tab disappears, active tab switches to the nearest tab
* reviewer closes tab A — same behavior
* only tab C and Terminal remain

## S4b: switching between editor tabs

* two files open in permanent tabs: A and B
* click tab A → editor shows A's content
* click tab B → editor shows B's content
* click tab A again → back to A, content is correct (not stale, not blank)
* the active tab is visually distinct (background color from mock-e)
* switching is instant — no loading, no flicker

## S4c: terminal and back

* reviewer is reading a chapter in editor
* clicks Terminal tab → dark terminal appears, prompt ready
* types `git status` → sees output
* clicks the editor tab they were on → editor content is exactly as they left it
* cursor position is preserved
* the transition between light editor and dark terminal is clean — no flash of wrong theme

## S2b: show-all toggle and card focus

* initially only the focused napkin (0100-delivery-pipeline) is expanded
* 0200-crust-validation is visible but collapsed (just the header line)
* reviewer clicks "show others" or clicks 0200's header
* 0200 expands — shows its files
* 0100 collapses (only one focused card at a time)
* clicking 0100's header again focuses it, 0200 collapses
* the scroll position doesn't jump to the top — the clicked card stays visible
* if the card was off-screen, it scrolls into view, but doesn't teleport to the top

## S5a: resize at different widths

* reviewer drags nav handle to make nav narrower (~150px)
* long napkin names truncate with ellipsis
* agent dots still visible next to names
* file names truncate but are still clickable
* reviewer drags nav wider (~400px)
* full names visible, no truncation
* editor area shrinks but Monaco reflows content (word wrap adjusts)

## S6a: the journey continued — add comments and commit

* after S6 (opened chapter, clicked link, navigated to GitHub)
* reviewer goes back to reading in the editor
* types `//DU: this alignment check looks wrong` on a new line
* text appears green
* switches to Terminal tab
* `cd nap-test-nap && git status` → shows the modified chapter file
* `git add . && git commit -m "review comments" && git push`
* the review is done

## S6b: return visit after push

* next day, reviewer opens the same PR link
* side panel opens, IDB has the repo from yesterday
* clicks [fetch latest] → pulls new commits (teammate responded to comments)
* opens the same chapter → sees teammate's `//A:` responses in blue
* the conversation happened in the code, not in Slack

## Monaco config

* tab size should be 2 (matching napkin indent), not Monaco's default of 4
* font size should be 13px (matching the nav and mock-e), not Monaco's default of 14px
* Cmd+/- zoom should work when focus is on the extension panel
  * if Chrome doesn't support this natively for side panels, note it as a known limitation
