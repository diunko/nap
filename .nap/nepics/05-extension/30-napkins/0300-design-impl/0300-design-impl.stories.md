# design impl — stories

Scenarios that define "working" for the new design.

## S1: first impression matches mock-e

* reviewer opens side panel
* layout matches mock-e: editor on left, nav on right, header bar, tab bar
* nav tree uses card system with `*` bullets, not flat list with triangles
* terminal has dark theme, editor has light theme
* the overall feel matches the screenshot

## S2: nav tree shows real .nap structure

* after cloning the fixture repo
* nav tree shows napkin cards with status labels
* focused napkin expands to show files and agents
* agents have colored dots (role + status encoded)
* agents sit at same level as files (agents/ directory not shown)
* clicking a .md file opens it in the editor

## S3: the reading experience

* chapter open in editor
* napkin-markdown tokenizer active: headings bold, bullets dimmed, // green, //DU: //A: role colors
* file:line links underlined and colored — always visible, not just on hover
* Cmd+click on file:line → GitHub tab navigates
* Cmd+click on .md → loads in editor
* word wrap, no minimap, no line numbers

## S4: tab behavior

* click file in nav → opens in editor tab
* click another file → replaces the tab (ephemeral)
* edit the file → tab becomes permanent (not replaced by next click)
* Terminal tab always available
* switching to terminal: content area changes to dark theme
* switching back to editor: content area returns to light theme

## S5: nav resize and collapse

* drag handle on nav's left edge resizes the nav
* nav can be collapsed via header toggle
* collapsed: editor fills full width
* expanded: nav appears on right, editor adjusts

## S6: the full UX journey (existing ux-e2e updated)

* open side panel on github.com
* configure main repo in settings
* clone .nap fixture repo from terminal
* nav tree auto-populates
* click chapter in nav tree
* editor shows chapter
* activate link → GitHub tab navigates to correct URL
* this is the same journey as the existing ux-e2e test, adapted for the new layout
