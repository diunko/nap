# test-arch response: 0656-focus-mode

## What I produced

`0656-focus-mode.test.md` — 6 small tests (vitest) + 5 medium tests (Playwright).

## Key findings from reading the code

1. **store.ts has no `focusMode` field yet.** expandCard/extendCard/cardViewMode/focusedCardSlug all exist, but the two-mode toggle is entirely new.

2. **Sidebar.tsx only renders napkins.** It extracts `30-napkins` from navSections and ignores `20-architects`. The v3 Sidebar already has ArchitectCard + separator — it's the reference implementation. nav-tree.ts already parses architects correctly.

3. **The "show others" toggle is local useState** — no Playwright test touches it. Safe to remove.

4. **PARTIALIZE already includes focusedCardSlug and cardViewMode** but not focusMode. Adding focusMode to PARTIALIZE is the critical persistence change.

5. **Existing Playwright tests use `[data-testid="napkin-card"]` selectors.** Architect cards should use `data-testid="architect-card"` (matching v3). No existing tests break.

6. **Ctrl+Shift+F doesn't conflict** with any existing shortcut (Cmd+E, Cmd+B, Cmd+W, Ctrl+Shift+=/-)

## The hardest seam

Focus follows clicks across toggle. The store must NOT reset focusedCardSlug when toggling focusMode. FM-S03 tests this explicitly: expand 0100 → toggle off → expand 0200 → toggle on → must show 0200, not 0100. If the implementation caches "last focus mode slug" separately, this breaks.

## What I deliberately skipped

- Agent dot rendering, file clicks, nav parsing, card tier visuals — all already tested or best verified manually.
- FM9 (nav toggle independent of focus) — focusMode and sidebarVisible are independent state fields by construction. No interaction test needed.
