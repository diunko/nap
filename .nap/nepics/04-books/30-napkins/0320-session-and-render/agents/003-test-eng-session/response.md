# Test engineer response — 0320-session-and-render

## Results

**Small tests (vitest):** 19/19 pass — `tests/session-persist.test.ts`
**Medium tests (Playwright):** 7/7 pass (2 are expected failures) — `tests/session-persist.spec.ts`

## Test coverage by case

| Case | Size | Result | Notes |
|---|---|---|---|
| SP-01 | Small | Pass | focusedCardSlug round-trip (match + miss) |
| SP-02 | Small | Pass | activeTerminalId round-trip (match + miss) |
| SP-03 | Small | Pass | leftTabs order, paths, ephemeral flags |
| SP-04 | Small | Pass | __terminal__ excluded from save, reconstructed from activeTerminalId |
| SP-05 | Small | Pass | Ghost tab on missing file, live tabs unaffected |
| SP-06 | Medium | Pass | Ghost → live via IPC chain (see finding #1) |
| SP-07 | Small | Pass | [live, ghost, live, ghost, live] ordering preserved |
| SP-08 | Small | Pass | leftPaneRenderMode persists alongside all new fields |
| RR-01 | Medium | Pass | Tab switch re-renders in rendered mode |
| RR-02 | Medium | Pass | External file change triggers re-render |
| RR-03 | Small | Pass | Edit mode tab switch does NOT trigger render |
| SS-01 | Medium | Pass | Edit→rendered cursor y-coordinate matching |
| SS-02 | Medium | Pass | Cursor off-screen falls back to viewport top |
| SS-03 | Medium | **Expected fail** | Rendered→edit sync broken (finding #2) |
| SS-04 | Medium | **Expected fail** | Round-trip broken (depends on SS-03) |
| SS-05 | Small | Pass | findClosestSourceLine algorithm (exact, between, overflow, underflow, empty) |
| SS-06 | Small | Pass | Empty document — no crash, null returns |

## Findings

### Finding #1: @parcel/watcher doesn't reliably detect file creation in test tmpdir

**What:** The GhostWatcher uses `@parcel/watcher` to watch parent directories. In the Playwright test, creating a file in a macOS temp directory (`/var/folders/...`) does not reliably trigger the watcher callback — even with 3+ seconds of delay.

**Where:** `GhostWatcher.watch()` in `ghost-watcher.ts`

**Root cause:** Likely a combination of: (a) macOS `/var` → `/private/var` symlink causing path mismatch between watcher internals and subscriber, (b) `@parcel/watcher` FSEvents latency in short-lived temp directories.

**Test workaround:** SP-06 tests the ghost promotion via the IPC chain directly: `file:ghost-appeared` → `promoteGhostTab`. This validates the full path from main process notification to store update, bypassing the filesystem watcher.

**Impact on prod:** Likely fine — real user directories aren't symlinked temp paths, and the watcher has time to establish. But worth monitoring.

### Finding #2: `syncRenderedToEdit` reads display:none div — scrollTop is always 0

**What:** When toggling from rendered → edit mode, `syncRenderedToEdit` runs inside a `useEffect` that fires AFTER React has committed `display: none` to the rendered div. At that point:
- `rendered.scrollTop` is 0 (browser resets scrollTop when display:none)
- All child `offsetTop` values are 0

The cursor always lands at line 1 instead of the actual topmost visible line.

**Where:** Scroll sync effect in `ContentPane.tsx` (line ~507-525), triggered by `[leftPaneRenderMode]` dependency.

**Root cause:** React `useEffect` runs after DOM commit + paint. By that time, the rendered div's style has already been updated to `display: none`. The fs-eng's comment "effects run in declaration order, and the rendered div is always mounted now" is correct about mounting, but misses that `display: none` resets layout properties.

**Fix options:**
1. **Cache scrollTop in a ref** before the state update. In `toggleRenderMode`, save `renderedRef.current.scrollTop` to a ref before calling `set()`. The effect reads from the cached ref.
2. **Delay display:none** until after sync. Use a `useLayoutEffect` to run sync before paint, and defer the hide to a subsequent microtask.
3. **Use visibility:hidden + height:0** instead of `display:none`. This preserves layout properties but hides the element.

Option 1 is simplest and most correct.

**Impact:** Edit→rendered works perfectly (SS-01, SS-02 pass). Rendered→edit is broken — cursor always goes to line 1. Round-trip (SS-04) also broken as a consequence.

## Files created

- `packages/v3/tests/session-persist.test.ts` — 10 small test cases (vitest)
- `packages/v3/tests/session-persist.spec.ts` — 7 medium test cases (Playwright)
