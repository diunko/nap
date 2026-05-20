# link decorations — stories

## LD1: links always visible

* chapter open in editor
* `[order-router.ts:54](/modules/delivery/order-router.ts#L54)` is underlined in link color
* `https://example.com` is underlined in link color
* bare `warp-queue.ts:31` is underlined in link color
* visible without any interaction — you can see what's clickable by scanning

## LD2: Cmd+hover changes color

* hold Cmd, hover over a link
* cursor changes to pointer (finger)
* link color changes to blue (#2563eb, accent color)
* move mouse off the link → back to default link color, cursor back to text
* release Cmd → back to default everywhere

## LD3: Cmd+click navigates (existing behavior)

* Cmd+click on `[order-router.ts:54]` → GitHub tab navigates
* Cmd+click on `02-warp-queue.md` → editor loads chapter 2
* Cmd+click on `https://example.com` → new tab
* this already works — the decorations don't interfere

## LD4: editable without Cmd

* click on a link without Cmd → cursor lands there for editing
* type inside a link → text changes, link decoration updates on next content change
* the editor is always editable — links are visual, not interactive barriers

## LD5: decorations update on content change

* type a new line: `see [dispatch.ts:10](/modules/delivery/dispatch.ts#L10)`
* the new link gets underlined + link color after typing completes
* delete a link → decoration disappears
