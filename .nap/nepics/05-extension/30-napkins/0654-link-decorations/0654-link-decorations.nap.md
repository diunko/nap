# link decorations — visible, interactive, no link provider

* what: make links in the editor look and feel like links
  * always underlined + link color (not just on hover)
  * Cmd+hover: pointer cursor + blue highlight
  * Cmd+click: navigate (already works)
  * editable when Cmd not held (already works — Monaco default)

* why: links are invisible right now
  * `[order-router.ts:54](/modules/delivery/order-router.ts#L54)` looks like plain text
  * the reviewer doesn't know what's clickable until they Cmd+hover
  * the whole reading experience depends on links being obvious

* approach: decorations + mouse events, no ILinkProvider
  * ILinkProvider conflicts with our onMouseDown handler (double navigation)
  * instead: use deltaDecorations for visuals, onMouseMove for hover state
  * same pattern as refreshRoleDecorations — already proven

* always-on link styling
  * `refreshLinkDecorations()` runs alongside `refreshRoleDecorations()` on content change
  * uses `detectLinks()` from content-link-provider.ts — already detects all 3 link types
  * applies `inlineClassName` with: underline + link color (--nap-link, #1e50c0)
  * covers: `[text](href)` markdown links, bare `https://` URLs, bare `file.ts:42` paths

* Cmd+hover state
  * `editor.onMouseMove` — when metaKey held and mouse over a link range:
    * add temporary decoration: pointer cursor + blue color (#2563eb)
    * change via CSS class swap (link-default → link-hover)
  * when metaKey releases or mouse leaves link range:
    * remove temporary decoration, back to link-default
  * `keydown`/`keyup` listeners for Cmd key state

* CSS classes
  * `.nap-link` — `text-decoration: underline; color: var(--nap-link);`
  * `.nap-link-hover` — `color: var(--nap-accent); cursor: pointer;`

* what doesn't change
  * `onMouseDown` Cmd+click handler — still does the actual navigation
  * `detectLinks` — already works, three regex types with priority
  * role decorations — unaffected, different line ranges
