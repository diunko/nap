# design sprint — reviewer journeys

The extension is a reviewer tool. These journeys define what "working" feels like from the reviewer's perspective.

## R1: the shared link

* teammate posts in Slack: "review my delivery pipeline changes"
  * link: `github.com/org/space-pizza/pull/42#nap-repo=github/org/space-pizza-nap&napkin=01-v1/0100-delivery-pipeline`
* you click it — GitHub opens, PR diff visible
* you click [n] — side panel opens
* panel shows: loading state, "cloning space-pizza-nap..."
* clone finishes — nav populates, focused on 0100-delivery-pipeline
* mini-book chapters visible: 01-order-routing, 02-warp-queue, 03-dispatch...
* you click chapter 01 — editor shows it
* you're reading within 10 seconds of clicking the link

## R2: reading the mini-book

* chapter 01 fills the editor — warm paper background, monospace, comfortable
* headings are bold and bigger, bullets have dimmed markers
* // comments are green, //DU: and //A: have distinct role colors
* code blocks have tinted background
* file:line links are underlined in link color — [order-router.ts:54] is obviously clickable
* you read top to bottom — the chapter explains how orders route to warp gates
* you reach a file:line link — Cmd+click
* GitHub tab jumps to `order-router.ts` line 54 — the actual `routeOrder()` function
* you read the code, understand, go back to reading the chapter
* at the bottom: "Next: 02-warp-queue.md" — Cmd+click, editor loads chapter 2
* you're bouncing between prose and code, prose and code
* the side panel is the guide, GitHub is the codebase

## R3: the nav tree

* right side of the panel, ~120px, collapsible
* shows the focused napkin: 0100-delivery-pipeline
  * chapters (01, 02, 03, 04, 05) — click to open
  * agents (001-test-arch, 002-fs-eng, 003-test-eng) — expandable
  * napkin file, spec file
* currently open file is highlighted
* toggle at top: "show all napkins" → expands to show 0200-crust-validation (backlog)
* architects section if you expand further
* the tree is navigation, not the main surface — small, scannable, out of the way

## R4: adding comments

* you're reading chapter 03 about dispatch
* something looks wrong — the alignment window math seems off
* you type on a new line: `//DU: is the 30s buffer enough? Europa alignment drifts by ~45s`
* text turns green (// comment token)
* the comment is there, inline, part of the document
* auto-save happens — no indicator needed, it just works
* you keep reading, add two more comments in chapter 04

## R5: committing the review

* you've read all 5 chapters, added 4 comments across 3 files
* click Terminal tab — dark terminal, prompt ready
* `cd space-pizza-nap`
* `git status` → three modified files listed
* `git add . && git commit -m "review: delivery pipeline questions"`
* `git push` → pushed to .nap repo
* your teammate pulls and sees your // comments in their nap.app
* the review happened in prose, in context, alongside the code

## R6: return visit

* next day — teammate says "I responded to your comments, take a look"
* you open the same PR link (or just click [n] — panel remembers)
* panel opens with your previous state
* [fetch latest] button in header — click it
* repo updates — teammate's //A: responses appear inline
* you read their responses, continue the conversation

## R7: the terminal as escape hatch

* you want to see the git log, or grep for something, or check a file
* Terminal tab is right there — dark, dense, bash+git
* `git log --oneline` → see the commit history
* `cat 30-napkins/0100-delivery-pipeline/0100-delivery-pipeline.spec.md` → read the spec
* it's a real shell — ls, grep, cat, pipes work
* but it's the escape hatch, not the primary surface
* you switch back to Editor tab — back to reading
