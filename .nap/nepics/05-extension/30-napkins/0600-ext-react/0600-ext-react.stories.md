# ext-react — stories

## S1: first open — the panel renders

* reviewer opens side panel on github.com
* layout matches mock-e: editor/terminal on left, nav on right, header bar, tab bar
* nav is empty (no repo cloned yet)
* terminal surface active by default (editor has nothing to show)
* header shows settings gear, nav toggle

## S2: clone and auto-populate

* reviewer types `git clone https://github.com/diunko/nap-test-nap` in terminal
* clone completes ("done." in terminal output)
* nav tree auto-populates — NO manual refresh
  * 0100-delivery-pipeline card visible with status "doing"
  * agent dots visible (3 dots: orange, green, gray)
  * 0200-crust-validation visible as collapsed card with "backlog"
* the push happened: adapter emitted repo-changed → model re-read → store updated → React re-rendered

## S3: reading a chapter

* click 0100-delivery-pipeline card header → card focuses (blue left accent, body expands)
* body shows: 0100-delivery-pipeline.nap.md (bold), mini-book/ directory, 3 agents with dots
* click 01-order-routing.md under mini-book/ → editor loads chapter
* tab bar shows ephemeral tab (italic) with "01-order-routing.md"
* napkin-markdown tokenizer active:
  * `# heading` bold
  * `* bullet` dimmed marker
  * `//DU:` green, `//A:` blue (role decorations, not just tokenizer)
  * `[order-router.ts:54]` underlined in link color
* word wrap on, no minimap, no line numbers, tabSize 2

## S4: navigate between chapters

* at bottom of chapter 01: "Next: 02-warp-queue.md"
* Cmd+click the .md link → editor loads chapter 02
* tab updates to "02-warp-queue.md" (ephemeral reuses slot)
* nav highlights 02, not 01
* click 01 in nav → editor loads 01, tab updates, nav highlights 01
* no stale content at any point

## S5: ephemeral and permanent tabs (from app T01-T04)

* click file A → ephemeral tab (italic)
* click file B → same tab slot reused, shows B
* edit file B (type something) → tab becomes permanent (not italic)
* click file C → new ephemeral tab alongside permanent B
* two tabs now: B (permanent) + C (ephemeral)
* click file D → ephemeral slot reuses, C becomes D

## S6: close tabs (from app T06)

* open and pin A, open and pin B → two permanent tabs
* close A → B becomes active, editor shows B
* close B → no tabs, editor shows empty state
* terminal tab always available

## S7: tab content switching (from app N04)

* open A (permanent), open B (permanent)
* click tab A → editor shows A's content
* click tab B → editor shows B's content
* click tab A → A's content, not stale, not blank
* scroll position and cursor preserved per tab

## S8: terminal round-trip

* chapter open in editor, scrolled partway down
* click Terminal → dark terminal, prompt ready
* type `git status` → output appears
* click editor tab → chapter exactly as before, scroll position preserved
* the switch is clean — no flash of wrong theme

## S9: file:line link navigates GitHub tab

* chapter showing with `[order-router.ts:54](/modules/delivery/order-router.ts#L54)` link
* set main-repo config (settings gear → fill owner/repo → save)
* Cmd+click the link → GitHub tab navigates to diunko/nap-test-main/.../order-router.ts#L54
* the link goes to the MAIN code repo, not the .nap repo

## S10: push data flow — terminal writes, editor sees

* chapter open in editor
* switch to terminal
* `echo "// terminal note" >> /home/user/nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md`
* switch to editor → content includes "// terminal note"
* the push happened: adapter emitted write → model re-read → store updated → editor reloaded

## S11: push data flow — editor writes, terminal sees

* chapter open in editor
* type `//DU: this looks fragile` on a new line
* auto-save fires (1s debounce)
* switch to terminal → `cat <filepath>` → output includes "//DU: this looks fragile"
* the write went through: editor → adapter.writeFile → LFS (echo suppressed — editor didn't re-read its own write)

## S12: card focus and nav scroll

* 0100 focused and expanded
* click "show others" → 0200 appears
* click 0200 header → 0200 focuses, 0100 collapses
* the clicked card scrolls into view, doesn't jump to top
* click 0100 header → 0100 focuses, 0200 collapses

## S13: zoom

* Ctrl+Shift+= → everything scales up
* Ctrl+Shift+- → scales down
* Ctrl+Shift+0 → resets to 1.0
* zoom persists across panel close/reopen

## S14: nav shows full directory tree

* 0100-delivery-pipeline focused
* visible: 0100-delivery-pipeline.nap.md (bold, main file)
* visible: mini-book/ directory with 5 chapter .md files inside
* visible: 3 agents with colored dots (orange test-arch, green fs-eng, gray test-eng)
* every file and subdirectory in the napkin is visible and clickable

## S15: return visit

* clone repo, open chapter, add comment, commit
* close panel
* reopen panel → IDB has repo, store restores from chrome.storage
* nav tree repopulates without re-clone
* open same chapter → content includes the committed edit
* [fetch latest] button in header → pulls updates from remote
