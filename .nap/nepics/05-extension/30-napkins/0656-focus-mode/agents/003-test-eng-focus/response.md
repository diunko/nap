# test-eng response: 0656-focus-mode

## Results

| Layer | Pass | Fail | Total |
|---|---|---|---|
| vitest (small) | 123 | 0 | 123 |
| Playwright (medium) — new FM tests | 5 | 0 | 5 |
| Playwright (medium) — existing | 31 | 5 | 36 |
| **Total** | **159** | **5** | **164** |

The 5 failures are pre-existing in `debug-scenarios.test.ts` (DS-P3-01 through DS-P4-01) — they wait for `.wterm` to be visible without switching to the terminal surface. Not related to focus mode.

## Tests written

`packages/ext-react/e2e/tests/fm-focus-mode.test.ts` — 5 Playwright tests:

| Test | What it proves | Story coverage |
|---|---|---|
| FM-P01 | show-all renders architects + separator + napkins in correct DOM order | FM2, FM10 |
| FM-P02 | focus mode shows exactly one card, no separator | FM1, FM4 |
| FM-P03 | focus follows clicks through toggle round-trips (0100 → 0200, not reset) | FM3, FM4, FM6 |
| FM-P04 | Ctrl+Shift+F keyboard shortcut toggles focus mode | FM7 |
| FM-P05 | focusMode + focusedCardSlug persist across close/reopen (two cycles) | FM8 |

### Test design notes

- **ensureFixtures helper**: Creates architect dirs and a second napkin via terminal if the fixture repo doesn't have them. In practice, `nap-test-nap` already has `20-architects/001-architect` and two napkins — the helper was a safety net.
- **DOM assertions**: card count, separator visibility, bounding box order (architects above separator above napkins), `toContainText` for card identity.
- **Store + DOM**: Each test verifies both `__napStore__.getState()` and the rendered DOM. Store checks confirm the logic; DOM checks confirm the rendering.
- **Persistence test**: Two close/reopen cycles — first verifies show-all + 0200 persists, second verifies focus + 0200 persists.

## Bugs found

**None in focus mode.** The implementation is clean. Specific verifications:

1. `toggleFocusMode` correctly flips boolean without touching `focusedCardSlug` — verified by FM-P03 round-trip.
2. `expandCard` works identically for napkin and architect slugs — verified by FM-S04 (vitest) and FM-P01 (architect cards render correctly in show-all).
3. `focusMode` is in PARTIALIZE — verified by FM-P05 (two close/reopen cycles).
4. Sidebar filtering correctly shows/hides cards based on `focusMode` — verified by FM-P01 (show-all) and FM-P02 (focus).
5. Keyboard shortcut `Ctrl+Shift+F` fires without conflicting with Cmd+E/Cmd+B/Cmd+W — verified by FM-P04.
6. Separator only renders when both architects and napkins exist — verified by FM-P01 (present) and FM-P02 (absent in focus mode).

### Pre-existing issue (not focus mode)

`debug-scenarios.test.ts` DS-P3-01 through DS-P4-01 (5 tests) fail on `page.waitForSelector('.wterm', { timeout: 5_000 })`. The terminal pane has `visibility: hidden` when `activeSurface === 'editor'`. These tests should call `switchToTerminal(panel)` before interacting with the terminal. Filed as pre-existing — no regression from focus mode changes.

## Story coverage

| Story | Covered by |
|---|---|
| FM1 (first open — focus mode, URL napkin) | FM-P02, FM-P03 initial state |
| FM2 (switch to show-all) | FM-P01 |
| FM3 (explore another napkin) | FM-P03 step 2 |
| FM4 (focus on new napkin) | FM-P02, FM-P03 step 3 |
| FM5 (explore architect) | FM-P01 (architect cards visible, clickable) |
| FM6 (focus toggle round-trip) | FM-P03 (full round-trip, 5 steps) |
| FM7 (keyboard shortcut) | FM-P04 |
| FM8 (persistence) | FM-P05 (two cycles) |
| FM9 (nav toggle independent) | Not tested — spec says no interaction test needed |
| FM10 (architect card structure) | FM-P01 (architect cards render with correct testid, visible in show-all) |
