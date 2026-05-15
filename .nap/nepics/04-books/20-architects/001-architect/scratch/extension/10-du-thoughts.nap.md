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
          * Monaco doesn't have native "zoom to node" but you can fake it
          * fold everything except the target subtree
          * or: filter the model — show only the subtree lines, hide the rest via `setHiddenAreas()`
          * `setHiddenAreas()` is the real power move
            * hides line ranges from the viewport completely
            * user sees only the zoomed subtree
            * breadcrumb shows the path back, click to zoom out
            * edits apply to the full model — hidden lines are still there
        * //A: breadcrumbs
          * Monaco has a built-in breadcrumb widget (`BreadcrumbsWidget`)
          * but it's tied to symbol navigation, not bullet nesting
          * simpler: custom breadcrumb bar above the editor (same as our current breadcrumb)
          * parse indent levels to build the path: `root > section > subsection`
          * truncate with `...` when too long
        * //A: different token sizes
          * yes — Monaco supports per-token CSS via `ITokenThemeRule`
          * `fontSize` specifically: no, not per-token
          * but: `decorations` can apply CSS classes to line ranges
            * `# heading` line → decoration with `font-size: 18px`
            * `## subheading` → `font-size: 16px`
            * rest stays at 14px
          * this works today — decorations are how VS Code does render-level styling
          * caveat: Monaco assumes fixed line height for scrollbar math
            * variable line heights break scroll position calculations
            * workaround: `lineHeight` set to the tallest line, or just don't vary too much

    

