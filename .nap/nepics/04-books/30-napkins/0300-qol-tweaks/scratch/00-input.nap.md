
* thoughts on quality of life
  * tab jumps by 4 in markdown? too large (editing empty md now)
    * (when pressing tab on empty line, or shift-tab unshifts by 4 too)
    * btw, for pre-existing md it auto-detects the 2
    * what do we do with it?
    * //A: Monaco `tabSize` defaults to 4, auto-detect overrides for existing files
      * for new/empty files there's nothing to detect → falls back to 4
      * fix: set `tabSize: 2` and `insertSpaces: true` in the napkin-markdown editor config
      * one-liner in ContentPane.tsx editor options
  * file links from terminal open in external editor
    * tricky: they often are absolute
    * what do we do?
    * //A: today terminal file-link-provider calls `window.electronAPI.openFilePath` → shell.openPath → OS editor
      * //A: should route through our routing rules instead
        * absolute path inside .nap/ → left pane
        * absolute path outside .nap/ → right pane (code view)
        * with :line → scroll to line
      * //A: the regex + extractPathAndLocation already exist in file-link-provider.ts
      * //A: just need to swap the `onOpen` callback from shell.openPath to routing dispatch
      * //A: small change — wire terminal links through the same `routeLink()` path
      * 
  * reading books
    * love dark theme for kinda coding and napkin commenting
      * when reading a lot of text, dark somehow is less scannable
      * got my habit of reading from pdf papers, so having them on black somehow throws me off from scan/read mode
      * what can we do? 
        * i love colored by role comments
        * also it's hard to dial right theme for code
      * maybe some simple way to switch themes
        * shortcut? like what?
        * //A: Cmd+Shift+T to toggle light/dark?
          * //A: two themes: `napkin-dark` (current) and `napkin-light`
          * //A: define napkin-light: cream/warm background, dark text, same role colors adjusted for contrast
          * //A: toggle applies to left pane only (code pane stays dark — code on light is a different beast)
            * //DU: toggle applies to all the window
              * for me it's switching from comprehension (light)
              * to brainstorm and implementation (dark)
              * as part of it, let's implement 4 light themes, 
                * and cmd-t (simplify) would rotate through all light + dark
                * themes should be set in a separate .ts file
                * i'll choose what i like and will comment out all others
                  * so in the end it will be one light and one dark
              * //A: makes sense — whole window, not per-pane
                * //A: implementation:
                  * `src/renderer/themes.ts` — all theme definitions
                    * each theme: Monaco editor theme + app shell CSS variables (sidebar bg, borders, text)
                    * 4 light variants + 1 dark to start
                      * light-cream (warm, paper-like)
                      * light-gray (cool, neutral)
                      * light-sepia (warm, slightly yellow — e-reader feel)
                      * light-blue (cool, slight blue tint)
                      * dark (current napkin-dark)
                    * exported as array: `const THEMES: ThemeDef[]`
                    * you comment out what you don't want — array shrinks
                  * Cmd+T rotates: index = (current + 1) % THEMES.length
                  * both Monaco instances (left + right) get the same theme
                  * app shell (sidebar, breadcrumbs, tab bar, gutter) picks up CSS variables
                  * role colors: same hues, adjusted per theme for contrast
                    * each ThemeDef includes its own role color map
          * //A: persist choice in ui-state.json
            * //DU: guess should be a switch by theme name?
              * or did you think just light/dark?
              * guess that would conflict with cmd-t rotation idea
              * //A: persist by theme name (string, not index)
                * `{ "theme": "light-cream" }` in ui-state.json
                * if saved theme not in array (commented out) → fall back to first in list

    * tables, links, headers, sections
      * are more messy in raw markdown then in rendered
      * can we have rendered version too? 
        * idk how to switch between them
        * wild idea: 
          * can we keep at least bullets editable in rendered mode?
          * we could bail from rendered by some shortcut
            * not dbl-click, i use that to select a sentence/paragraph/line
            * any ideas?
        * how does that map to colored comments?
        * //A: this is the hardest item here. two approaches:

          * //A: approach 1 — "enhanced raw" (small scope)
            * keep Monaco, keep raw markdown, but render more inline
            * tables: Monaco can't render tables natively
              * but: proportional column alignment via decorations (pad columns to align)
              * headers get horizontal rule decoration below
            * links: already clickable via link provider — just style them more (underline, color)
            * sections: horizontal rule decoration after `---`
            * result: still raw editable text, just prettier
            * role comments work naturally (they're already styled)

          * //A: approach 2 — "split render" (bigger scope)
            * Esc to toggle between edit (Monaco) and render (HTML) mode
              * not dbl-click (you use that for selection, agreed)
              * Esc is natural — you're "escaping" from rendered view into editing
              * or: Cmd+Shift+R for explicit "render toggle"
                * //DU: cmd-r
                * //A: Cmd+R works — short, memorable, "render"
                  * careful: Cmd+R is "reload page" in Electron by default
                  * need to intercept it in the renderer before Electron eats it
                  * `event.preventDefault()` in the keydown handler — same pattern as Cmd+B, Cmd+D
                  * //DU: okay, let's avoid that conflict
                    * cmd-shift-r conflicts too
                    * umm, let's take cmd-h
                    * btw, should be global flag for all left pane
                    * //A: Cmd+Shift+H — no conflicts, clean
                    * //A: global flag — yes
                      * store: `leftPaneRenderMode: 'edit' | 'rendered'`
                      * all left pane tabs share the mode
                      * toggle applies instantly to whatever tab is active
                      * switching tabs keeps the mode
            * rendered mode: parse markdown → HTML, render in a div
              * tables render as actual tables
              * links render as styled anchors
              * headers render with proper sizing
            * editable bullets in rendered mode — very hard
              * contentEditable + markdown round-trip is fragile
              * simpler: rendered mode is read-only, Esc drops you back to edit at the same scroll position
                * //DU: okay, i think i'm happy with this
                  * blocker: click-to-edit on a rendered thing (cmd-click?)
                    * i should be able to switch real fast to that place where i want edits to go
                    * //A: Cmd+click on rendered element → edit mode at that source line
                      * //A: how it works:
                        * markdown-it (or remark) parser tracks source line maps
                        * rendered HTML gets `data-source-line="42"` on each block element
                        * Cmd+click handler: walk up DOM to nearest `[data-source-line]`
                        * switch to Monaco, `editor.setPosition({ lineNumber: 42, column: 1 })`
                        * editor.focus()
                      * //A: the source mapping is the only hard part
                        * markdown-it has a `map` property on tokens — `[startLine, endLine]`
                        * we pass these through to the HTML renderer as data attributes
                        * works for paragraphs, headers, list items, table rows
                        * inline elements (bold, links) inherit parent block's line number
                      * //A: this is doable and not fragile — the mapping is structural, not character-level
            * role comments in rendered mode
              * parse `//A:` etc → colored blocks/highlights in HTML
              * straightforward — just a custom markdown-it plugin or regex post-process
            * bigger investment but genuinely better reading experience

        * //A: my take: start with approach 1 (enhanced raw) in 0300
          * it's low-risk, improves readability without a mode switch
          * approach 2 can be a separate napkin (0400?) once we know what "reading mode" really needs
  * tabs
    * terminal tabs
      * don't have to hang around
        * uuids are just taking up space meaninglessly
        * i'll use agent [termina] entries to switch between them
        * so i guess we just need kinda always-ephemeral tab for terminal
          * (separate from ephemeral file tab, i like that as it is)
          * tehre will always be 1 terminal tab on left
            * and i will switch active terminals by using agent handles
      * //A: agreed — terminal tab should be:
        * always exactly 1 in right pane
          * //DU: umm right, so should be first one always
          * //A: yes — terminal tab is always leftmost in the right pane tab bar
            * pinned to position 0, file tabs appear after it
        * always ephemeral (can't pin, can't close, can't accumulate)
        * title shows agent name (not UUID)
        * clicking different agent [terminal] entries swaps what it shows
        * it's a viewport into whichever agent is active, not a tab per agent
      * //A: current implementation creates a terminal tab per `setActiveTerminal` call
        * fix: single permanent terminal slot, `setActiveTerminal` just changes what it points to
        * file tabs in right pane are separate and work as they do now
  * bugs/issues
    * git decorations sometimes doesn't refresh
      * and sometimes drop to non-decorated state
      * (e.g. closing the app and then opening the file)
        * although the file gets updated when changed on disk
      * //A: likely causes:
        * //A: on app open → file loads → `file:git-diff` either:
          * doesn't fire (race: model ready before IPC handler registered?)
          * fires but response arrives after Monaco model swap → decorations applied to old model, lost
        * //A: on external change → content updates but git-diff not re-requested
          * the auto-save path re-runs diff, but external changes don't go through auto-save
        * //A: fix:
          * re-request `file:git-diff` on EVERY model update (content change from disk OR save)
          * not just on auto-save — also on external file change callback
          * add a small delay (200ms) after model update before requesting diff
            * gives git time to see the new file content
    * once the file has cursor focus, it should update git status
      * //A: good trigger — `editor.onDidFocusEditorText` → request fresh git diff
        * catches the case where you switch tabs, come back, and decorations are stale
        * cheap — one `git diff` per focus event, debounced
