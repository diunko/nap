# design sprint — spec

Constraints for the designer.

## Layout

* three zones: nav (right) | editor/terminal (center-left) | [GitHub in main tab]
* nav is collapsible, ~120-150px, right side
  * collapses to a thin icon strip or hides entirely
* editor fills remaining width — this is where the book lives
* tab bar above content: Editor | Terminal
  * Editor is default, active on load
  * Terminal is secondary — only used for git ops and exploration
* header bar above everything: napkin name, [fetch latest], [settings gear], [collapse nav]
* no horizontal scroll — word wrap everywhere

## Visual language (from nap.app)

* reference: v2-unified.html and nap-app light screenshot
* adapt, don't copy — extension context is different (narrower, reading-focused, alongside GitHub)
* what to carry over:
  * monospace throughout (Menlo/Monaco 13-14px)
  * status dots (green=running, blue=done, gray=backlog)
  * flat visual weight — dots and indentation ARE the hierarchy, no extra chrome
  * bullet markers dimmed, content normal color
  * // comments in green, //DU: //A: with role colors
    * hash-based palette: `packages/v3/src/renderer/role-palette.ts`
    * known prefixes: A=#2563eb (blue), DU=#16a34a (green), FS=#16a34a, TA=#d97706 (orange), TE=#6b7280 (gray)
    * unknown prefixes: djb2 hash → 20 evenly-spaced HSL hues
  * sparse, scannable, high information density
* what's different:
  * light theme: `packages/v3/src/renderer/themes.ts` → lightBlue definition
    * editor bg #f0f4f8, text #2e3440, bullet markers #7a8a9a, comments #16a34a
    * shell CSS vars: --nap-bg, --nap-text, --nap-border, etc.
  * terminal is dark — `packages/bash-poc/index.html` has the working dark palette
    * bg #1e1e1e, fg #e5e5e5, prompt green #22c55e, cursor #e5e5e5
  * no gutter (nap.app has nepic gutter — extension has one nepic context from URL)
  * no kanban (extension is reading, not project management)

## Nav tree

* shows .nap structure for the FOCUSED napkin (from URL)
  * chapters (numbered .md) — the mini-book
  * agents (with status dots and role)
  * napkin file, spec, stories, test files
* "show all" toggle reveals other napkins + architects
* currently open file highlighted
* numeric sort (0100 before 0200, 01 before 02)
* expandable nodes with subtle triangle indicator

## Editor

* Monaco with napkin-markdown tokenizer
* token styling must be visible and intentional:
  * `# heading` → bold, brighter, slightly larger if possible
  * `* bullet` → marker dimmed (#7a8a9a), content default (#2e3440)
  * `//` → green (#16a34a)
  * `//DU:` `//A:` → role-specific colors
  * `` `code` `` → tinted background
  * `**bold**` → bold, markers dimmed
  * links → underlined, link color (#1e50c0), always visible (not just on hover)
* word wrap on, no minimap, no line numbers
* shift-enter continuation
* Cmd+click on links

## Terminal

* dark theme — bash-poc colors (bg #1e1e1e, fg #e5e5e5)
* NOT light theme — terminal must feel like a terminal
* same wterm CSS as bash-poc (dark palette, green prompt)
* compact — 13px font, tight line height
* when terminal tab is active, the whole content area goes dark
  * tab bar stays light (or adapts? designer decides)

## The mock must include

* real space-pizza mini-book content from fixtures
  * at least chapter 01 fully rendered in the editor area
  * with visible file:line links (underlined, colored)
  * with // and //DU: //A: comments styled
  * with headings, bullets, code blocks
* nav tree populated with 0100-delivery-pipeline content
  * chapters, agents, napkin files
* terminal view with dark theme and sample prompt + commands
* tab switching (Editor ↔ Terminal) — interactive
* nav collapse/expand — interactive
* header with napkin name + [fetch latest] + settings
* responsive to width (try at 500px, 700px, 900px)
