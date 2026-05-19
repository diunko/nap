# design impl — stories round 2

Based on reading the v3 app's tests (tabs-store.test.ts, content-nav.spec.ts, tabs.spec.ts) and the bugs found during manual testing. Each story maps to a real behavior tested in the app.

## S2a: nav tree shows full directory tree

* fixture 0100-delivery-pipeline contains:
  * `0100-delivery-pipeline.nap.md`
  * `mini-book/` → 01-order-routing.md through 05-putting-it-together.md
  * 3 agents (test-arch, fs-eng, test-eng)
* when card is focused, ALL of these are visible
  * mini-book/ as expandable directory with its 5 children
  * agents with dots at same level as files
  * the main .nap.md file
* any file or subdirectory that exists in the napkin shows in the nav

## S3a: navigate between chapters, nav highlight follows

* open chapter 01 via nav click → editor shows it, nav highlights 01
* Cmd+click .md link to chapter 02 → editor loads 02, tab updates, nav highlights 02 (not 01)
* click chapter 01 in nav → editor loads 01, tab updates, nav highlights 01
* no stale content at any point

## S4a: ephemeral tab reuse (from app T01, T02)

* click file A in nav → ephemeral tab (italic)
* click file B → same tab slot reused, label changes to B, content changes to B
* only one editor tab exists (plus Terminal)

## S4b: pin on edit, new ephemeral after pin (from app T03, T04)

* click file A → ephemeral tab
* edit file A (type something) → tab becomes permanent (not italic)
* click file B → new ephemeral tab appears alongside permanent A
* two editor tabs now: A (permanent) + B (ephemeral)
* click file C → ephemeral slot reuses, B becomes C

## S4c: close tab activates neighbor (from app T06)

* open and pin A, open and pin B → two permanent tabs
* close A → B becomes active, editor shows B's content
* close B → no editor tabs, editor area shows empty state

## S4d: tab names and overflow

* open file with long name (0100-delivery-pipeline.nap.md)
* tab truncates with ellipsis, doesn't push other tabs off screen
* X close button is always reachable regardless of name length

## S4e: switching between tabs shows correct content (from app N04)

* open A (permanent), open B (permanent)
* click tab A → editor shows A's content
* click tab B → editor shows B's content
* click tab A → A's content again, not stale, not blank
* cursor/scroll position preserved per tab

## S4f: terminal round-trip preserves editor state

* open chapter in editor, scroll partway down
* click Terminal tab → dark terminal
* type something in terminal
* click editor tab → chapter content exactly as before, scroll position preserved

## S2b: card focus scroll behavior

* focused napkin (0100) is expanded
* click "show others" → 0200 appears
* click 0200 header → 0200 focuses, 0100 collapses
* the clicked card scrolls into view but doesn't jump to top of nav
* click 0100 header → 0100 focuses again

## Monaco config

* tabSize: 2 (matching napkin indent)
* fontSize: 13px (matching mock-e and nav)
