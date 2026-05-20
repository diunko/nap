# link decorations — test architecture

## What this feature adds

Three behaviors, one pattern:

1. **Always-on link underlines** — `refreshLinkDecorations()` runs on file load and content change, same pattern as `refreshRoleDecorations()`. Uses `detectLinks()` to find ranges, applies `inlineClassName: 'nap-link'` via `deltaDecorations`.
2. **Cmd+hover state** — `onMouseMove` + `keydown`/`keyup` listeners. When metaKey held and mouse over a link range, swap class to `nap-link-hover` (pointer cursor + blue). On keyup or mouse-leave, revert.
3. **Decorations track edits** — `refreshLinkDecorations()` called from `onDidChangeModelContent`, same hook that already calls `refreshRoleDecorations()`.

## What's already tested

- **Cmd+click navigation** — IM-05 (file:line → GitHub tab), IM-06 (.md → editor loads). These prove the `onMouseDown` handler + `routeLink` + `detectLinks` work end-to-end. Decorations add CSS classes but don't touch the click pipeline.
- **Role decorations** — `refreshRoleDecorations` is the proven pattern. Link decorations follow it exactly: scan lines, build `IModelDeltaDecoration[]`, call `deltaDecorations`. No new structural risk.
- **detectLinks** — NOT directly unit-tested (no vitest suite), but proven indirectly by IM-05/IM-06. Cmd+click depends on the same regex matching and column math. If `detectLinks` were off-by-one, link clicks would miss.

## What's NOT worth testing

- **Decoration colors / CSS values** — `--nap-link: #1e50c0`, `--nap-accent: #2563eb`. These are visual. Manual verification. Testing hex values is brittle and catches nothing interesting.
- **Cursor shape** — `cursor: pointer` on hover. CSS property, not a logic seam.
- **LD3 (Cmd+click still works)** — covered by IM-05/IM-06. Decorations add `inlineClassName` which doesn't change the onMouseDown handler. If it somehow interferes, IM-05/IM-06 fail in the regression suite.
- **LD4 (editable without Cmd)** — Monaco's default behavior. No code change for this. Click without Cmd = cursor placement. Nothing to test.
- **detectLinks unit tests** — considered and rejected for this feature. detectLinks is a pre-existing function tested indirectly. Its range accuracy will be validated by LD-P01 (decorations must appear on the right text). If we add detectLinks vitest coverage later, it's a separate effort.

## Test strategy

No small tests. The feature adds no new pure logic — `refreshLinkDecorations` is a thin loop over `detectLinks` → `deltaDecorations`, same as the role pattern. The interesting failures are all in the rendering pipeline.

Three Playwright tests. All medium. They verify that decorations actually appear in the DOM (the lesson from IM-02-DOM: if a human needs to see it, the test checks the DOM).

```
detectLinks() → refreshLinkDecorations() → deltaDecorations → DOM spans with .nap-link
                                                                     |
                                              onMouseMove + metaKey → class swap to .nap-link-hover
                                                                     |
                                              onDidChangeModelContent → re-scan → decorations update
```

---

## Playwright tests — real browser, real extension

### LD-P01: links decorated on file load (all three types)

* **flow:** open chapter containing markdown links, bare URLs, bare file paths → verify DOM spans have `nap-link` class
* **subsystems:** ContentPane (refreshLinkDecorations), content-link-provider (detectLinks), Monaco deltaDecorations, CSS injection
* **what to test:**
  - open a chapter file (click in nav or use openDoc)
  - wait for editor surface visible, view-lines rendered
  - query `.monaco-editor .nap-link` — count > 0
  - verify at least one of each type is decorated:
    - markdown: `[order-router.ts:54](...)` — the `nap-link` span contains "order-router"
    - bare URL: `https://...` — the `nap-link` span contains "https://"
    - bare file path: `warp-queue.ts:31` — the `nap-link` span contains "warp-queue"
  - non-link text does NOT have `nap-link` class (spot-check a bullet or heading)
* **where it breaks:**
  - `refreshLinkDecorations` not called after `setModel` (missed in the file-load effect)
  - CSS class name mismatch between code and stylesheet (typo: `nap-link` vs `napLink`)
  - `generatePaletteCss` or equivalent doesn't inject `.nap-link` rules into `<style>`
  - `detectLinks` ranges off-by-one → decoration covers wrong characters (visual but not caught by count alone — verify span text content matches expected link text)
* **test size:** medium
* **verification:** DOM — `.nap-link` selector count, span text content, `.toBeVisible()`
* **fixture requirement:** the test repo chapter must contain all three link types. The fixture repo (`nap-test-nap`) chapter `01-order-router.md` already has markdown links and bare file paths. May need a bare URL added.

### LD-P02: decorations update on content change

* **flow:** open chapter → count decorations → type a new link → verify count increases → delete a line with a link → verify count decreases
* **subsystems:** onDidChangeModelContent → refreshLinkDecorations → deltaDecorations
* **what to test:**
  - open file, note initial `.nap-link` count (call it N)
  - click into editor, type a new line: `see [dispatch.ts:10](/modules/dispatch.ts#L10)`
  - wait for decorations to refresh (inline — same tick as content change)
  - `.nap-link` count is N + 1
  - select the line just typed, delete it
  - `.nap-link` count returns to N
* **where it breaks:**
  - `refreshLinkDecorations` not wired to `onDidChangeModelContent` (forgot to add the call alongside `refreshRoleDecorations`)
  - old decorations not cleared — `deltaDecorations` called with wrong ref (stale decoration IDs from a different ref)
  - role decorations and link decorations share the same ref → one overwrites the other. This is the most likely bug: copying `refreshRoleDecorations` and forgetting to create a separate `linkDecorationsRef`.
* **test size:** medium
* **verification:** DOM — `.nap-link` element count before/after edit
* **implementation note:** counting decorations via DOM is stable because `inlineClassName` decorations produce real CSS classes on `<span>` elements inside `.view-line`. Use `panel.locator('.monaco-editor .nap-link').count()` — this works as long as the decorated lines are in the visible viewport (Monaco virtualizes off-screen lines).

### LD-P03: Cmd+hover adds and removes hover decoration

* **flow:** open chapter → locate a decorated link → dispatch mousemove with metaKey over link coordinates → verify `nap-link-hover` class appears → dispatch keyup for Cmd → verify `nap-link-hover` removed
* **subsystems:** onMouseMove handler, keydown/keyup listener, temporary deltaDecorations
* **what to test:**
  - open file with links, verify `.nap-link` present
  - find a `.nap-link` span, measure its bounding rect
  - dispatch `mousemove` on overflow-guard with `{ metaKey: true, clientX, clientY }` at span center
  - verify: `.nap-link-hover` count > 0 (at least one span has hover class)
  - dispatch `keyup` with `{ key: 'Meta' }` on the document
  - verify: `.nap-link-hover` count === 0 (all hover decorations removed)
  - also: dispatch `mousemove` with `metaKey: true` OUTSIDE any link → no `.nap-link-hover`
* **where it breaks:**
  - Monaco's `onMouseMove` doesn't fire for synthetic `mousemove` events (same issue as mousedown — `isTrusted: false`). **This is the main brittleness risk.** Mitigation: if `onMouseMove` doesn't fire, fall back to checking the decoration collection directly via `__monaco__` editor.deltaDecorations.
  - `keyup` listener not attached to the right target (window vs document vs editor DOM)
  - temporary decorations not cleaned up — hover class stays after Cmd release
  - line/column mapping from pixel coordinates fails (Monaco's `getTargetAtClientPoint` may not work for synthetic events)
* **test size:** medium
* **verification:** DOM — `.nap-link-hover` selector count during hover vs after release
* **brittleness note:** this test depends on Monaco processing synthetic mouse events. If it proves unreliable, downgrade to a model-level check: use `editor.getLineDecorations(lineNumber)` via `__monaco__` to verify the decoration options include `nap-link-hover`. This loses DOM verification but is stable. The fs-eng should expose both paths.

---

## Test IDs and stories coverage

| Test | Stories | What it proves |
|---|---|---|
| LD-P01 | LD1 | Links visible on load — all three types underlined |
| LD-P02 | LD5 | Decorations track edits — new links decorated, deleted links cleared |
| LD-P03 | LD2 | Cmd+hover state — hover class on, hover class off |
| IM-05 (existing) | LD3 | Cmd+click navigation — not broken by decorations |
| — | LD4 | Editable without Cmd — Monaco default, not tested |

## Implementation guidance for the fs-eng

1. **Separate ref for link decorations.** `linkDecorationsRef = useRef<string[]>([])` — do NOT reuse `roleDecorationsRef`. This is the most likely copy-paste bug.
2. **CSS injection alongside role palette.** Add `.nap-link` and `.nap-link-hover` rules in the same `<style>` element (or a new one). Check `ensureRegistered()` — that's where role palette CSS is injected.
3. **refreshLinkDecorations scope.** Only decorate lines in the visible viewport? No — decorate all lines, like `refreshRoleDecorations` does. Monaco handles virtualization. The `deltaDecorations` call covers the full document.
4. **Cmd+hover cleanup.** The `keyup` listener must clear ALL temporary hover decorations, not just the last one. If the user moves the mouse across multiple links while holding Cmd, each link gets a hover decoration. On keyup, clear the entire hover ref.
5. **Test fixture.** The test repo chapter needs all three link types on visible lines. Verify `01-order-router.md` in `nap-test-nap` has: a markdown link (`[text](href)`), a bare URL (`https://...`), and a bare file path (`file.ts:NN`). If not, add them.
