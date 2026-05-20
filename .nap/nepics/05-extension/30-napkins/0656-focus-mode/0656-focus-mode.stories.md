# focus mode — stories

## FM1: first open — focus mode, URL napkin

* reviewer opens panel from link with `napkin=01-v1/0100-delivery-pipeline`
* nav shows only 0100-delivery-pipeline card, focused (top-level files + agents visible)
* no architects visible, no other napkins
* focus icon in header indicates "focused" state
* Cmd+E extends the card to show full tree (scratch/ contents, agent files)
* reviewer reads chapters, clicks files — all within this napkin

## FM2: switch to show-all

* from FM1, reviewer clicks focus toggle icon (or Ctrl+Shift+F)
* nav expands: architects section at top (001-architect with dot), separator, then all napkins
* 0100-delivery-pipeline still expanded (it was focused)
* 0200-crust-validation visible, collapsed
* reviewer can now browse everything

## FM3: explore another napkin in show-all

* from FM2, reviewer clicks 0200-crust-validation header
* 0200 expands, 0100 collapses (one expanded at a time)
* reviewer browses 0200's files

## FM4: focus on the new napkin

* from FM3 (0200 expanded), reviewer clicks focus toggle
* nav collapses to show only 0200-crust-validation
* 0100 and architects hidden
* focus followed the click — not stuck on the URL napkin

## FM5: explore an architect

* from show-all mode, reviewer clicks 001-architect card header
* architect goes to focused state: prompt.md, scratch/ visible (depth 0)
* 0200 collapses
* Cmd+E → extended: scratch/ contents visible (full tree)
* click focus toggle → only 001-architect visible
* architect works exactly like a napkin — same three states, same shortcuts

## FM6: focus toggle round-trip

* start in focus (0100)
* toggle → show-all (everything visible, 0100 expanded)
* click 0200 → 0200 expands
* toggle → focus (only 0200)
* toggle → show-all (everything visible, 0200 expanded)
* toggle → focus (only 0200 — not reset to 0100)

## FM7: keyboard shortcut

* Ctrl+Shift+F toggles between focus and show-all
* works regardless of where focus is (editor, terminal, nav)
* same behavior as clicking the icon

## FM8: focus mode persists

* reviewer switches to show-all, expands 0200
* closes panel, reopens
* panel restores: show-all mode, 0200 expanded
* toggle to focus → 0200 only
* close, reopen → focus mode, 0200

## FM9: nav toggle independent of focus

* hamburger button hides/shows the entire nav
* in focus mode: hide nav → editor fills width. show nav → focused napkin appears
* in show-all mode: same behavior, all cards appear/disappear
* focus mode and nav visibility are independent states

## FM10: architect card structure

* in show-all mode, architects section shows:
  * 001-architect card: `* 001-architect [dot] lead`
  * collapsed: header only
  * click → focused: prompt.md, scratch/ visible (depth 0)
  * Cmd+E → extended: scratch/ contents, all nested files
  * architect dot: blue (role color), filled/dashed-check/hollow (status)
* same `*` bullet, same indentation, same three states as napkin cards
