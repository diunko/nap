# v0 gap analysis — specified but not built or half-built

* layout
  * file tree should be on the RIGHT as a collapsible sidebar (~120px)
    * currently: nav tree is on the LEFT, 280px, always visible
    * 33-v0 says: "right sidebar: file tree (collapsible, ~120px)"
    * the book/editor should be the main surface, nav is secondary
  * tab bar at top switches terminal and editor — works
  * resize handle — works

* nav tree quality
  * shows .nap structure but feels like a raw listing
  * should show: architects, napkins, agents as groupings (like nap.app)
  * status labels (doing, backlog) — implemented but not styled like nap.app
  * expand/collapse works but defaults to collapsed — awkward after clone
  * no visual distinction between file types (.nap.md vs .spec.md vs prompt.md)

* // the two above are understatement
  * // panel currently basically a placeholder
  * // we should think through the design
  * // launch designer agent? 
  * // here are app reference materials:
    * // original app design html mock (dark theme):
      * .nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-unified.html
      * // but should apply light theme (like on screenshot)
    * // light theme screenshot:
      * .nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take1/session1/screenshots/nap-app.png
  * // in extension it might look different, should be smart about layout and stuff
    * // here's current state:
      * .nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take1/session1/screenshots/extension-take1-state.png
  * // hmm, I think we need richer content 
    * // for nap-test-nap to be able to see if design works:
      * // more agents
      * // more materials
      * // one 5-chapter book (can be rel. short, with couple going beyond the scroll)
      * // say in one napkin mini-book/ subfolder

* editor
  * napkin-markdown tokenizer — works
  * shift-enter continuation — copied from v3 but untested manually
    * // speced line break doesn't work, it's just a copy from v3
  * link STYLING missing — links should be underlined + link color in the tokenizer
    * currently: links are plain text, only underline on Cmd+hover
    * 33-v0 says: "link styling (underline file:line paths, markdown links)"
  * auto-save — works but no visual indicator (no "saved" dot, no dirty state)
    * // we don't have that in Nap.app, right?
    * // 500ms debounce save is ok, don't bother with those statuses
  * refresh-on-focus — works
    * // what about everything we've discussed on shortcuts?

* link routing
  * file:line → GitHub — works (after bug fix)
  * .md → load in editor — works
  * https:// → new tab — works
  * Cmd+click — works via editor.action.openLink override
  * .ts/.tsx → open GitHub blob — works? (single-click reuses tab)
    * // yes, works! 
      * // do we have a test for that?
    * // okay, but how do i pin a tab permanently?
      * // we don't have dbl-click on a tab
        * // (i think it's harder and not kinda not worth it?)
    * // or, maybe an alternative: how do i make a new tab? 
    * //A: <ideas?>
  * missing: link styling in tokenizer (bare file.ts:42 should be colored/underlined)

* terminal
  * works well, from POC
  * greeting message could be more helpful (currently "nap extension — browser bash + git over IndexedDB")
    * // ffs remove that greeting; it's debug tool anyway
      * // we'll hide it for prod
      * // or, actually, let's make it second tab after editor
      * // it's a fallback for case when there's no git repo checked out
  * prompt is generic (user@nap:~$) — fine for now
    * // ok

* // how should we map accompanying .nap repo to PR?
  * // maybe it's not quite about mapping
  * // it's more about how do we have separate git / fs 

* auth
  * PAT in settings overlay — works
  * test connection button — missing from inline settings (was in popup.html)
  * public repos work without token — works

* theme
  * lightBlue applied — works
    * // nope; 
    * // or, i mean, maybe i just can't see it as "applied" bc of nav completely flat
  * terminal colors match — works
    * // why we did that? omg
    * // terminal should be dark color, prev version colors (bash-poc) were great!
    * // it's a completely broken theme for terminal
  * but: nav tree bg is #e6eaee (bgSecondary) while editor is #f0f4f8 (bg)
    * creates a two-tone look that may or may not be intentional
      * // i think this matches the app theme overall, 
      * // it's just that design is broken 
        * // it's different from original
        * // also it completely doesn't work for extension
    * // btw, we should be able to adjust zoom level
      * // to accomodate content on screen
      * // and currently it's possible to do for main browser (cmd +/-)
        * // but when i do that with focus on extension panel, 

* what triggers side panel
  * extension icon click → opens panel — works
  * auto-detect GitHub PR page → pre-fill clone URL — NOT built (nice-to-have in scope)

* UX polish not in the code at all
  * no empty state guidance beyond "Clone a .nap repo" text
  * settings: no "test connection" for PAT
  * no breadcrumb or filename indicator for what's open in editor
  * no way to know which file you're looking at once it's open
  * nav tree doesn't highlight the currently open file

* // yep, agree on the above
  * // so, what do we do next?
