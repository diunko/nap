# v0-take2 — wishlist

* fixtures
  * move to /fixtures/{main,.nap} in monorepo
  * keep same github urls (diunko/nap-test-main, diunko/nap-test-nap)
  * replace copy-pipeline fiction with something new
  * main repo: a tiny fictional project, not referencing any internal codebase
  * .nap repo: mini-book chapters with file:line links into main repo
  * idea: space-pizza — interplanetary pizza delivery API
    * main repo has: order-router.ts, warp-queue.ts, crust-validator.ts
    * .nap mini-book walks through "how an order gets from Earth to Mars"
    * file:line links: [order-router.ts:23](modules/delivery/order-router.ts#L23) etc
    * funny enough to not look corporate, small enough to clone in 2s

* v0 scope gaps — what was specified but not built or half-built
  * layout
    * file tree should be on the RIGHT as a collapsible sidebar (~120px)
      * currently: nav tree is on the LEFT, 280px, always visible
      * 33-v0 says: "right sidebar: file tree (collapsible, ~120px)"
      * the book/editor should be the main surface, nav is secondary
    * tab bar at top switches terminal and editor — this works
    * resize handle — this works
  * nav tree quality
    * shows .nap structure but feels like a raw listing
    * should show: architects, napkins, agents as groupings (like nap.app)
    * status labels (doing, backlog) — implemented but not styled like nap.app
    * expand/collapse works but defaults to collapsed — awkward after clone
    * no visual distinction between file types (.nap.md vs .spec.md vs prompt.md)
  * editor
    * napkin-markdown tokenizer — works
    * shift-enter continuation — copied from v3 but untested manually
    * link STYLING missing — links should be underlined + link color in the tokenizer
      * currently: links are plain text, only underline on Cmd+hover
      * 33-v0 says: "link styling (underline file:line paths, markdown links)"
    * auto-save — works but no visual indicator (no "saved" dot, no dirty state)
    * refresh-on-focus — works
  * link routing
    * file:line → GitHub — works (after bug fix)
    * .md → load in editor — works
    * https:// → new tab — works
    * Cmd+click — works via editor.action.openLink override
    * .ts/.tsx → open GitHub blob — works? (single-click reuses tab)
    * missing: link styling in tokenizer (bare file.ts:42 should be colored/underlined)
  * terminal
    * works well, from POC
    * greeting message could be more helpful (currently "nap extension — browser bash + git over IndexedDB")
    * prompt is generic (user@nap:~$) — fine for now
  * auth
    * PAT in settings overlay — works
    * test connection button — missing from inline settings (was in popup.html)
    * public repos work without token — works
  * theme
    * lightBlue applied — works
    * terminal colors match — works
    * but: nav tree bg is #e6eaee (bgSecondary) while editor is #f0f4f8 (bg)
      * creates a two-tone look that may or may not be intentional
  * what triggers side panel
    * extension icon click → opens panel — works
    * auto-detect GitHub PR page → pre-fill clone URL — NOT built (nice-to-have in scope)
  * UX polish not in the code at all
    * no empty state guidance beyond "Clone a .nap repo" text
    * settings: no "test connection" for PAT
    * no breadcrumb or filename indicator for what's open in editor
    * no way to know which file you're looking at once it's open
    * nav tree doesn't highlight the currently open file
