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
                  * //A: <??>
          * but: `decorations` can apply CSS classes to line ranges
            * `# heading` line → decoration with `font-size: 18px`
            * `## subheading` → `font-size: 16px`
            * rest stays at 14px
            * // what is decoration? 
              * //A: <short explainer and 2-3 examples>
          * this works today — decorations are how VS Code does render-level styling
            * //wdym by render-level?
          * caveat: Monaco assumes fixed line height for scrollbar math
            * variable line heights break scroll position calculations
              * // oh that's a bummer
              * // actually, what if we make stuff taking space in multiples of one line?
                * // and then vary the font styling within that space
              * //A: <wdyt? crazy?>
            * workaround: `lineHeight` set to the tallest line, or just don't vary too much

* other ideas for workflowy mode?
  * //A: <jot down 20, 5-6 word ideas, go wild. what's interesting for collab <human/human/ai>?>
    

