* //DU: thoughts

* for markdown
  * tab-> shifts right the item and all its subtree (anywhere on the bullet line)
  * shift-tab unshifts whole subtree
  * shift-enter breaks the line at cursor, 
    * prepending prefix and then content on next line
    * "//" is also a prefix for shift-enter
    * only "*" followed by "//" token is counted as comments
* for .nap.md files
  * workflowy mode
    * zoom in 
    * breadcrumbs
      * (cut if too long)
    * ...
    * could it work as part of monaco?
      * would be tremendous to have it's parsing capabilities!
        * btw, can different tokens be differnt size?
      * //A: yes — Monaco can do a lot of this
        * //A: workflowy zoom-in
          * Monaco doesn't have native "zoom to node" 
            * but you can fake it
            * fold everything except the target subtree
            * or: filter the model — show only the subtree lines, hide the rest via `setHiddenAreas()`
            * `setHiddenAreas()` is the real power move
              * hides line ranges from the viewport completely
              * user sees only the zoomed subtree
              * breadcrumb shows the path back, click to zoom out
              * edits apply to the full model — hidden lines are still there
              * // wow, cooool! if we pull that off, that's complete gamechanger!
                * // i imagine adding other cool workflowy stuff
                  * // like #hash or @mention etc
                  * //A: yeah — once you have zoom + tree awareness:
                    * `#tags` → monarch token, colored, clickable → zoom to all bullets with that tag
                    * `@agent` → mention token → resolves to agent name, could trigger poke
                      * // omg omg yesss!
                      * //A: the poke path already exists — `nap3 poke <name> "message"`
                        * just need: detect `@fs-eng` under cursor → resolve to running agent → poke
                    * drag-to-reorder bullets (Monaco doesn't have this, but `moveLines` command exists)
                      * // umm guess kinda just editing is fine?
                      * //A: yeah, alt+up/alt+down moves lines — good enough for now
                    * collapse/expand subtrees (Monaco folding, just need a custom fold provider by indent)
                      * // yeah, maybe; should be real careful about not cluttering ui
                        * // hate forests of triangles
                        * // this is v2+ maybe
                        * //A: agreed — folding icons add noise. workflowy zoom is the better UX for this
                          * zoom replaces fold — you don't collapse, you just go deeper
        * //A: breadcrumbs
          * Monaco has a built-in breadcrumb widget (`BreadcrumbsWidget`)
          * but it's tied to symbol navigation, not bullet nesting
          * simpler: custom breadcrumb bar above the editor (same as our current breadcrumb)
          * parse indent levels to build the path: `root > section > subsection`
          * truncate with `...` when too long
        * //A: different token sizes
          * yes — Monaco supports per-token CSS via `ITokenThemeRule`
          * `fontSize` specifically: no, not per-token
            * // i mean, per token class, e.g. headings 
              * // so that we can do kinda "rendered" napkins markdown
              * // e.g. i don't care about tables
                * // there's no way we can have tables in markdown, right?
                * //A: not real rendered tables — Monaco is a text editor, every line is a text line
                  * but: decorations can fake alignment
                    * detect `| col | col |` pattern
                    * add letter-spacing or padding decorations to align columns visually
                      * // could we do some smart css trickery like css grids or smth?
                        * // and before and after? 
                        * // omg, we could kinda create grid fitting the layout, and could assign table cells to elements
                        * // omg, how crazy is that
                          * // should totally work if we have 
                            * // ability to assign individual classes/styles to individual tokens
                            * // maybe tricky if grids need particular elts nesting
                              * // monaco has linear struc of divs and spans inside
                              * //A: you're right that Monaco's DOM is flat: `.view-line > span > span`
                                * CSS grid needs a grid container wrapping the cells
                                * Monaco's lines are independent divs — no shared grid parent across lines
                                * BUT: `position: absolute` + calculated `left`/`width` per cell could fake it
                                  * each `|` token gets a decoration with fixed `left` position
                                  * content between pipes gets `width` to fill the column
                                  * no grid, just absolute positioning per token
                                * wild but plausible — the hard part is measuring column widths across rows
                                  * need a pre-pass: scan all rows, find max width per column, then decorate
                                * definitely v3+ territory — fun research though
                    * looks tabular, edits as text
                  * for real tables → the rendered mode (Cmd+J) is the answer
                  * in edit mode: best we can do is visual alignment, which is honestly pretty good for napkins
          * but: `decorations` can apply CSS classes to line ranges
            * `# heading` line → decoration with `font-size: 18px`
            * `## subheading` → `font-size: 16px`
            * rest stays at 14px
            * // what is decoration? 
              * //A: a CSS class attached to a line range or inline span
                * you define a class name + CSS rules
                * then `editor.deltaDecorations(old, new)` applies them to specific ranges
                * examples:
                  * git gutter: `{ range: line 5-5, options: { linesDecorationsClassName: 'git-added' } }` → green left border
                  * line highlight: `{ range: line 42, options: { className: 'flash-yellow' } }` → yellow background fade
                  * heading size: `{ range: line 1, options: { inlineClassName: 'heading-large' } }` → `font-size: 18px` on that line's text
          * this works today — decorations are how VS Code does render-level styling
            * //wdym by render-level?
              * //A: meaning: visual styling that doesn't change the text content
                * the model (text) stays `# heading` — the decoration makes it LOOK big
                * vs tokenizer which only colors text — decorations can change size, background, borders, icons
          * caveat: Monaco assumes fixed line height for scrollbar math
            * variable line heights break scroll position calculations
              * // oh that's a bummer
              * // actually, what if we make stuff taking space in multiples of one line?
                * // and then vary the font styling within that space
              * //A: not crazy at all — that's exactly the right trick
                * heading line height = 2x base → Monaco sees 2 "lines" worth of space
                * but it's one line with `font-size: 20px` + `line-height: 2em` + `padding-top`
                * Monaco's scroll math stays happy (each line is an integer multiple of base height)
                * same for section dividers: `---` line → 1.5x height, thin horizontal rule centered
            * workaround: `lineHeight` set to the tallest line, or just don't vary too much

* other ideas for workflowy mode?
  * //A: 20 ideas, going wild:
    * star/pin bullets
      * float to top of their level // neat; not now
    * bullet timestamps
      * "last edited 2h ago" subtle annotation
    * mirror/transclusion
      * same bullet appears in two places, edits sync // soso
    * split view
      * two zoom levels side by side in one pane // dk
    * bullet-level permissions
      * lock a subtree from agent edits // -
    * search-then-zoom
      * Cmd+F finds bullet, Enter zooms to its subtree 
      * // I like the idea of filtering somehow
        * // should think what's the behavior
        * // v2+
    * bullet history
      * git blame per-bullet, who wrote this line
    * dependency arrows
      * `→ #other-bullet` renders as a visual connection
    * voting/reactions on bullets
      * emoji annotations, lightweight consensus
      * // haha, no, that's funny! yeah, totally could do that!
        * // encoding like just inline at the end of the line
          * // but tricky with users
          * // idk, maybe v4 or smth
    * AI summary widget
      * collapse subtree, show one-line AI summary instead
        * // riiiight
          * // my idea now: everything should be encoded in markdown itself
          * // but idk, this seems like kinda out-of-band thing
          * // where to store?
          * //A: could be a sibling bullet with a marker:
            * `* //AI-SUMMARY: one-line summary of the collapsed subtree`
            * stored in the markdown itself — no out-of-band
            * generated on demand (cmd+shift+S on a bullet?), overwrites previous summary
            * when collapsed/zoomed-out, the summary bullet shows in place of the subtree
    * bullet templates
      * `@template daily-standup` expands a structure
        * // neat
        * // this reminds me:
          * // various triggers for inline AI
    * color-coded nesting depth
      * each level gets a subtle left-border color
      * // no, save color for threads and roles/names
    * word count per subtree
      * annotation in breadcrumb // soso
    * export subtree
      * copy a zoom level as standalone .md
      * // idk, maybe
      * // maybe not <=v4
    * bullet linking across files
      * `[[other-file#bullet-id]]`
      * // huh
      * // huh
      * // wow
      * // this might be real cool!
        * // should think about how to id bullets
          * // kinda [copy link] triggers including anchor into markdown?
          * //A: bullet ID = content hash of the line (first 8 chars of sha256)
            * stable across edits to other bullets
            * changes when bullet text changes — but that's correct (it's a different bullet now)
            * `[copy link]` writes `<!-- #a1b2c3d4 -->` as invisible anchor after the bullet
            * other files reference it: `[[file.nap.md#a1b2c3d4]]`
            * clicking → opens file in left pane, zooms to that bullet
              * // no, i mean, only bullets that have the anchor are linkable
                * // and anchor is random id that's inserted when [copy link] is clicked
                * // also can be smth simpler linke [anchor:abc123] or smth
                * //A: right — opt-in anchors, not auto-hashed
                  * [copy link] on a bullet → generates random short ID → inserts `[anchor:abc123]` at end of line
                  * only anchored bullets are linkable
                  * ID is stable — survives text edits (it's a separate token, not derived from content)
                  * `[anchor:abc123]` rendered as invisible or as a tiny link icon decoration
                  * reference syntax: `[[file.nap.md#abc123]]`
        * // maybe v2-3
    * presentation mode
      * each top-level bullet is a "slide"
      * // ummm this is nnnuuuuttttts!
      * // yeah! should think about it
        * // maybe v4?
    * diff between two zoom snapshots
      * what changed in this subtree
      * // right, should be able to create new version
        * // and go back and forth
        * // a lot like {01,02,03,04}- now
          * // "glue" versions by prefix? or subfolder? 
          * // v3-4
    * concurrent cursors
      * two humans editing, see each other's position
      * // naaaah, get out
      * // how would we do that?
        * // would be craaaaaazy
        * // this is just :rocket:
          * // could we pull this? like, v3-4
            * //A: haha ok, two approaches:
              * //A: option A — git-based (simple, async)
                * each user's .nap/ is a git repo
                * they push/pull to shared remote
                * file watcher picks up changes
                * "cursor" = a marker file `.nap/cursors/<username>.json` with `{ file, line, col }`
                * each user writes their own, reads others
                * latency: 1-2s (git push/pull interval)
                * no server, no WebSocket, just git
              * //A: option B — WebSocket relay (real-time)
                * tiny relay server (100 lines, just broadcasts cursor positions)
                * each client sends `{ user, file, line, col }` on cursor move
                * others render colored cursor decorations
                * Monaco: `deltaDecorations` with a thin colored line + username label
                * latency: <100ms
                * needs a server, but trivially small
              * //A: both could coexist — git for content sync, WebSocket for cursor presence
              * // yeah, ok, probably i'm buying collab surface
                * // sharedb or yjs simple backend would do it
                * // given that everything is just markdown, should be pretty easy
    * agent assignment per bullet
      * `@fs-eng` tag, cmd-enter pokes that agent
        * // hell yeah, this is tremendous
    * undo tree visualization // soso
      * branching undo, pick which timeline to keep


* other ideas: 
  * show last commit diff in napkin
    * use-case: after comments got commited, 
      * I want to see waht things were changed by latest diff
    * question:
      * what do we do with worktree changes and staged?
        * idk, combination seems tricky
        * any simple ideas?
        * //A: keep it simple — show ONE diff, make it the most useful one:
          * default: `git diff HEAD` (everything not committed — staged + unstaged combined)
          * this is what you care about: "what changed since last commit"
          * don't try to show staged vs unstaged separately — that's git UI, not napkin UI
            * // i think i want to distinguish what you have written (latest commit)
            * // vs what i have written (unstaged)
              * // makes sense? 
              * //A: yes — two layers of diff, two visual treatments:
                * layer 1: `git diff HEAD~1..HEAD` → what the last commit changed (agent's turn)
                  * subtle background tint (e.g. faint blue wash on those lines)
                    * // love this!
                    * // v2? 
                * layer 2: `git diff HEAD` → unstaged changes on top (your current edits)
                  * the green/blue/red gutter bars we already have
                * result: you see the agent's commit as a colored region, your edits as gutter marks on top
                * the two are visually distinct — you can tell "agent wrote this" vs "I wrote this"
                * toggle: maybe Cmd+Shift+D cycles through: off → agent diff → both → off
          * //A: display:
            * same gutter decorations as git gutter (green/blue/red)
            * but also: inline deleted text as faded strikethrough (decoration on the old line range)
            * or: Monaco's built-in diff viewer (`createDiffEditor`) as a toggle
              * Cmd+Shift+D? toggle inline diff view
              * shows old vs new side by side, or inline with red/green
          * //A: the simple version:
            * just the gutter bars we already have — those ARE the diff
            * add a tooltip on hover: "added 3 lines" / "modified" / "2 lines deleted"
            * that's it — no new UI, just better information on what's already there
    

