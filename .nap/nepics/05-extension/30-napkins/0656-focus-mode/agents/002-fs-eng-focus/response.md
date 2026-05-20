# fs-eng response: 0656-focus-mode

## What I built

Focus mode — two nav modes (focus/show-all) with a single toggle.

### 1. Store (`packages/ext-react/src/store.ts`)

- Added `focusMode: boolean` to `NapStore` (initial: `true`)
- Added `toggleFocusMode()` action — simple boolean flip, does NOT touch `focusedCardSlug`
- Added `focusMode` to `PersistedState` type and `PARTIALIZE` function
- This is the critical design decision: toggle is orthogonal to card focus. `focusedCardSlug` is updated only by `expandCard`, never by `toggleFocusMode`. This is what makes FM-S03 (focus follows clicks across toggle) work naturally.

### 2. Sidebar (`packages/ext-react/src/Sidebar.tsx`)

- **ArchitectCard component**: mirrors NapkinCard pattern — same three tiers (collapsed/focused/extended via `maxDepth`), same styling, same `expandCard(architect.name)` on header click. Uses `data-testid="architect-card"`. Status label derived from `extractAgentStatus` (maps 'run' → 'lead').
- **Focus mode filtering**: in focus mode, finds the single card (napkin or architect) matching `focusedCardSlug` and renders only that. In show-all mode, renders architects + separator + napkins (matching v3 pattern).
- **Removed "show others" / "hide others"**: deleted `useState(showAll)` and the toggle div. No references remain.
- **Separator**: `data-testid="section-separator"`, only rendered when both architects and napkins exist.

### 3. Header (`packages/ext-react/src/index.tsx`)

- Focus-toggle button between refresh-pr and settings: `data-testid="focus-toggle-btn"`
- Icon: `⤢` (expand arrows) in focus mode, `⤡` (collapse arrows) in show-all mode
- Title tooltip shows mode and shortcut hint
- **Ctrl+Shift+F** keyboard shortcut added to Panel's keydown handler
  - Uses `e.ctrlKey` (not `e.metaKey`) — spec explicitly says Ctrl, not Cmd
  - Checks `e.key === 'F'` (capital, because shift is held)
  - No conflict with existing shortcuts (Cmd+E, Cmd+B, Cmd+W use metaKey/ctrlKey without shift; zoom uses Ctrl+Shift+=/-)

### 4. Focus follows clicks

Works by construction — `expandCard` already updates `focusedCardSlug`. ArchitectCard calls `expandCard(architect.name)`, so clicking an architect sets the slug. `toggleFocusMode` never resets the slug. Verified by FM-S02, FM-S03, FM-S04.

## Tests written

`packages/ext-react/src/__tests__/focus-mode.test.ts` — 7 tests in 6 suites:

| Test | What it proves |
|---|---|
| FM-S01 | toggleFocusMode cycles true → false → true |
| FM-S02 | toggleFocusMode preserves focusedCardSlug through toggles |
| FM-S03 | focus follows expandCard across toggle (0100 → show-all → expand 0200 → focus → shows 0200) |
| FM-S04a | expand/extend/collapse cycle works for architect slugs |
| FM-S04b | switching between napkin and architect slugs |
| FM-S05 | focusMode persistence round-trip (createMemoryStorage, save, recreate, verify) |
| FM-S06 | focusMode default is true |

## Test results

- `npm run test:small`: **123 tests passed** (116 existing + 7 new), 0 failed
- `tsc --noEmit`: clean, zero type errors
- No regressions in IS-02 (card focus), IS-07 (persistence), SS-03 (session persistence)

## Decisions

1. **ArchitectCard as separate component** (not reusing NapkinCard) — the data shape differs: napkins have agents section + status from `.napkin.nap.json`, architects have flat files + status from `.agent.nap.json` metadata. Separate components keep the rendering clean without conditional branching.

2. **Architect metadata**: `parseArchitects` in nav-tree.ts doesn't read `.agent.nap.json` (unlike `parseAgents`). I did not modify the parser (spec says "nav tree parser doesn't change"). Status falls back to 'done' via `extractAgentStatus` — correct for the extension's read-only use case where architects are always complete.

3. **Sidebar resize**: changed `onMouseDown` dependency from `[width]` to `[]` and used a ref for the current width. The original had `width` in the dependency array which created a new callback (and new event listeners) on every resize frame. Now stable.

## For the test engineer

- Selectors: `[data-testid="architect-card"]` for architects, `[data-testid="napkin-card"]` for napkins, `[data-testid="focus-toggle-btn"]` for the toggle, `[data-testid="section-separator"]` for the separator
- Store access: `__napStore__.getState().focusMode` / `.focusedCardSlug`
- The keyboard shortcut is `Ctrl+Shift+F` (capital F) — use `panel.keyboard.press('Control+Shift+F')` in Playwright
