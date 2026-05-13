# Test architect response — 0100-content-pane

Wrote `0100-content-pane.test.md` with 25 strategic test cases across 6 seam areas.

## What I focused on

The three-pane layout has one critical property: **the two content panes are independent**. Most of my store tests (S01-S07) exist to prove this independence holds under various mutations and snapshot cycles.

The routing rules (R01-R04) are the other high-leverage target — it's a pure function, easy to test, and catches the most common path-matching bugs before any UI code exists.

## Where I expect bugs

1. **Routing edge cases** — `.nap` appearing as substring vs path segment. Naive `includes('.nap')` will false-positive on filenames like `snapshot.ts`.

2. **Write-echo suppression** — The existing `hasPendingWrite` flag in the model handles directory structure writes. Content writes from Monaco auto-save are a different channel. Without a separate suppression mechanism, the file watcher will see the auto-save write and trigger a re-read, potentially overwriting the user's in-progress edits.

3. **Monaco scroll position** — When an agent writes to an open file, `model.setValue()` resets scroll to top. Need `model.applyEdits()` or save/restore scroll position. This is Story 4's "scroll position is preserved (or close to it)."

4. **Tokenizer rule ordering** — `//A:` must match before generic `//`. Monarch processes rules top-to-bottom; if generic `//` is listed first, role-specific rules never fire.

5. **ResizeObserver on new container** — Terminal.tsx has a working ResizeObserver, but it's attached to a specific DOM parent. When Terminal moves into the right pane, that parent changes. If the observer isn't re-attached, xterm won't refit on layout resize.

## What I deliberately skipped

- Visual layout testing (pixel positions, colors) — manual testing is better
- Monaco bundle/worker loading — build configuration, not a test case
- Obvious happy paths that never break (e.g., "does React render a div")
- Tab management — explicitly out of scope per napkin ("no tabs")
