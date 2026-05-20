# focus mode — test architecture

## What we're testing

Focus mode adds a second nav mode (show-all) alongside the existing single-card view (focus). The seams are: store logic for a new boolean + toggle, sidebar rendering that filters/expands based on that boolean, architects appearing as first-class cards, a keyboard shortcut, and persistence of three new/modified fields.

## Reference code

- `packages/ext-react/src/store.ts` — expandCard, extendCard, cardViewMode, focusedCardSlug, PARTIALIZE
- `packages/ext-react/src/Sidebar.tsx` — NapkinCard, NodeTree, "show others" toggle (being removed)
- `packages/ext-react/src/index.tsx` — HeaderBar, keyboard shortcuts (Cmd+E, Cmd+B, Cmd+W)
- `packages/ext-react/src/nav-tree.ts` — parseNavTree, parseArchitects, architects section already parsed
- `packages/v3/src/renderer/Sidebar.tsx` — ArchitectCard, separator, maxDepth pattern (reference impl)
- `packages/v3/src/renderer/store.ts` — expandCard, focusCard, extendCard (reference impl)

## What's already covered

| Existing test | What it proves | Still valid after this feature? |
|---|---|---|
| IS-02a/b/c (store.test.ts) | expandCard focus/toggle/switch | Yes — expandCard logic unchanged |
| IS-02 extendCard | focused ↔ extended toggle | Yes — extendCard logic unchanged |
| IS-07 (persistence.test.ts) | openDoc + expandCard persist | Yes — but needs new assertion for focusMode |
| SS-03 (session.test.ts) | persist per key round-trip | Yes — focusMode added to PARTIALIZE |
| IM-02-DOM (e2e) | four-direction DOM test | Yes — napkin cards still render, no selector change |
| IM-07 (e2e) | reopen lifecycle | Yes — but should verify focusMode persists too |

## What's NOT covered and needs tests

### Seam 1: focusMode store logic

New state field + toggle action. The core decision logic lives here.

### Seam 2: focus follows clicks

expandCard already updates focusedCardSlug. The new behavior: toggling focusMode should show whatever card was last expanded — not reset to URL napkin. This is a composition seam between expandCard and toggleFocusMode.

### Seam 3: sidebar filtering

Sidebar reads focusMode from store and filters what renders. In focus mode: only the card matching focusedCardSlug. In show-all: architects + separator + napkins. This is where rendering bugs hide.

### Seam 4: architect cards

Architects are parsed by nav-tree.ts (already works) but never rendered as cards in ext-react Sidebar. The NapkinCard component pattern needs to work for architect NavNodes too — same three tiers.

### Seam 5: persistence of focusMode

focusMode must be added to PARTIALIZE. Without it, reopening the panel always starts in focus mode regardless of last state.

---

## Small tests (vitest) — store logic

### FM-S01: toggleFocusMode cycles correctly

- **Flow:** toggleFocusMode → check focusMode flipped → toggle again → back to original
- **Subsystems:** store (toggleFocusMode action)
- **Expected:** focusMode starts true, toggles to false, toggles back to true
- **Where it breaks:** if toggleFocusMode doesn't read current value before setting (always sets true, or always sets false)
- **Size:** small
- **Verification:** `store.getState().focusMode` after each toggle

### FM-S02: toggleFocusMode preserves focusedCardSlug

- **Flow:** expandCard('0100') → toggleFocusMode → check focusedCardSlug still '0100' → toggleFocusMode again → still '0100'
- **Subsystems:** store (expandCard + toggleFocusMode interaction)
- **Expected:** focusedCardSlug unchanged through toggles
- **Where it breaks:** if toggleFocusMode resets focusedCardSlug to null or to a URL default
- **Size:** small
- **Verification:** `store.getState().focusedCardSlug === '0100'` after both toggles

### FM-S03: focus follows expandCard across toggle

- **Flow:** expandCard('0100') → toggleFocusMode (to show-all) → expandCard('0200') → toggleFocusMode (back to focus) → focusedCardSlug should be '0200'
- **Subsystems:** store (expandCard + toggleFocusMode composition)
- **Expected:** focus mode shows 0200, not 0100
- **Where it breaks:** if toggle resets focusedCardSlug to what it was when focus mode was last active
- **Size:** small
- **Verification:** `store.getState().focusedCardSlug === '0200'` after second toggle

### FM-S04: expandCard works for architect slugs

- **Flow:** expandCard('001-architect') → check focusedCardSlug and cardViewMode → extendCard → check extended → expandCard('001-architect') again → collapsed
- **Subsystems:** store (expandCard, extendCard — architect slug instead of napkin slug)
- **Expected:** identical behavior to napkin slugs — expand/extend/collapse cycle works
- **Where it breaks:** if expandCard has napkin-specific assumptions (unlikely, but the NapkinCard component's onClick passes `napkin.name` — need to verify architect cards pass their own identifier)
- **Size:** small
- **Verification:** same assertions as IS-02 but with architect slug

### FM-S05: focusMode persistence round-trip

- **Flow:** create persisted store → toggleFocusMode (to false) → expandCard('0200') → wait for persist → recreate store with same key → check focusMode, focusedCardSlug, cardViewMode all restored
- **Subsystems:** store + persist middleware (PARTIALIZE, hydration)
- **Expected:** focusMode=false, focusedCardSlug='0200', cardViewMode='focused' all restored
- **Where it breaks:** if focusMode not added to PARTIALIZE, or if PersistedState type doesn't include it
- **Size:** small
- **Verification:** `createMemoryStorage()` round-trip, check `storage.getItem('nap-ui-key')` contains focusMode, then recreate store and check `getState().focusMode`

### FM-S06: focusMode default is true

- **Flow:** createNapStore() → check initial state
- **Subsystems:** store (initial state)
- **Expected:** focusMode=true (spec says "focus mode default on first open")
- **Where it breaks:** if initial value is false
- **Size:** small
- **Verification:** `store.getState().focusMode === true`

---

## Medium tests (Playwright) — what the user sees

### FM-M01: show-all renders architects + separator + napkins

- **Flow:** open panel → clone repo → toggle to show-all → verify DOM
- **Subsystems:** Sidebar rendering, store (focusMode=false), nav-tree (architects section)
- **Expected:**
  - `[data-testid="architect-card"]` elements visible (at least one)
  - separator element visible between architects and napkins
  - `[data-testid="napkin-card"]` elements visible (at least two)
  - napkins in numeric order
- **Where it breaks:**
  - Sidebar doesn't extract architects from navSections (only extracts 30-napkins, ignores 20-architects)
  - Separator not rendered when architects.length > 0
  - Architect card uses wrong testid (e.g., reuses `napkin-card` instead of `architect-card`)
- **Size:** medium (real Chrome, real extension, git clone)
- **Verification:** Playwright locators with `toBeVisible()`, `toHaveCount()`, DOM order check

### FM-M02: focus mode shows only focused card

- **Flow:** from FM-M01 (show-all, multiple cards visible) → toggle to focus → verify DOM
- **Subsystems:** Sidebar rendering, store (focusMode=true, focusedCardSlug)
- **Expected:**
  - exactly one `[data-testid="napkin-card"]` OR one `[data-testid="architect-card"]` visible
  - no separator visible
  - the visible card matches focusedCardSlug
- **Where it breaks:**
  - Sidebar doesn't filter based on focusMode
  - All cards still render but are hidden via CSS (wrong approach — should not render at all, or at least verify `display:none`)
  - focusedCardSlug is null after toggle → empty sidebar
- **Size:** medium
- **Verification:** `locator('[data-testid="napkin-card"]:visible').count()` + `locator('[data-testid="architect-card"]:visible').count()` === 1 total

### FM-M03: focus toggle round-trip (FM6 story)

- **Flow:** start in focus (0100) → toggle show-all → click 0200 → toggle focus → verify 0200 only → toggle show-all → verify 0200 still expanded → toggle focus → verify 0200 still (not reset to 0100)
- **Subsystems:** Sidebar, store (focus follows clicks, toggle doesn't reset)
- **Expected:** focus stays on the last-expanded card through multiple toggles
- **Where it breaks:** toggle resets focusedCardSlug to URL napkin, or to null
- **Size:** medium
- **Verification:** store state checks via `panel.evaluate()` + DOM card visibility at each step

### FM-M04: Ctrl+Shift+F keyboard shortcut

- **Flow:** open panel → clone → verify focus mode → press Ctrl+Shift+F → verify show-all mode → press again → verify focus mode
- **Subsystems:** index.tsx keyboard handler, store (toggleFocusMode)
- **Expected:** focusMode toggles, DOM updates accordingly
- **Where it breaks:**
  - Shortcut not registered (missing addEventListener)
  - Shortcut conflicts with browser's Ctrl+Shift+F (unlikely in side panel)
  - Wrong modifier keys checked (e.g., `e.metaKey` instead of `e.ctrlKey`)
- **Size:** medium
- **Verification:** `panel.keyboard.press('Control+Shift+F')` → check `store.getState().focusMode`

### FM-M05: focus mode persists across panel close/reopen (FM8 story)

- **Flow:** toggle to show-all → expand 0200 → close panel → reopen → verify show-all mode with 0200 expanded → toggle to focus → close → reopen → verify focus mode with 0200
- **Subsystems:** store persistence (focusMode + focusedCardSlug + cardViewMode), Zustand persist middleware, IDB
- **Expected:** all three fields survive close/reopen
- **Where it breaks:**
  - focusMode not in PARTIALIZE → always hydrates as default (true)
  - focusedCardSlug hydrates but focusMode doesn't → wrong combination
  - Zustand persist version mismatch if schema changes without migration
- **Size:** medium
- **Verification:** close panel, reopen, check `store.getState()` + DOM state
- **Note:** can extend existing IM-07 test rather than creating a new standalone test

---

## What NOT to test

- **Agent dot rendering** — already tested in IM-02-DOM direction 4. Architect dots use the same AgentDot component.
- **File click → openDoc** — already tested in IM-02-DOM, IM-03, IM-04, IM-06.
- **Three card tiers visual layout** — manual testing. The logic (maxDepth control) is identical to the existing NapkinCard pattern.
- **Nav tree parsing of architects** — parseArchitects already works and is used by the existing nav-tree tests. No new parsing logic needed.
- **Nav toggle (hamburger)** — FM9 is trivially covered: focusMode and sidebarVisible are independent state fields. No interaction test needed.

---

## Regression guard

### Selector stability

The fs-eng should use `data-testid="architect-card"` for architect cards (matching v3 convention) and keep `data-testid="napkin-card"` for napkin cards. Existing Playwright tests only interact with `.napkin-card` selectors — they won't break.

The `focusNapkinCard` helper in `e2e/tests/fixtures.ts` filters by `[data-testid="napkin-card"]` — this remains correct for napkins. A new `focusArchitectCard` helper should filter by `[data-testid="architect-card"]`.

### "Show others" removal

The current "show others" toggle is a local `useState` in Sidebar. No existing Playwright test clicks it. Removing it is safe.

### Existing keyboard shortcuts

Ctrl+Shift+F must NOT conflict with:
- Cmd+E (extendCard) — different modifier+key
- Cmd+B (toggleSidebar) — different modifier+key
- Cmd+W (closeActiveTab) — different modifier+key
- Ctrl+Shift+=/- (zoom) — different key

The handler should check `e.ctrlKey && e.shiftKey && e.key === 'F'` (capital F because shift is held). Verify this doesn't fire on Cmd+Shift+F (Mac) — the spec says Ctrl+Shift+F, so use `e.ctrlKey` not `e.metaKey`.

---

## Debugging checkpoints for the fs-eng

After each implementation step, verify:

1. **After adding `focusMode` + `toggleFocusMode` to store:**
   - `npm run test:small` — all IS-02 tests still pass
   - New FM-S01 through FM-S06 pass

2. **After adding `focusMode` to PARTIALIZE:**
   - IS-07 persistence tests still pass
   - SS-03 session tests still pass
   - FM-S05 persistence round-trip passes

3. **After modifying Sidebar to render architects:**
   - Existing IM-02-DOM test still passes (napkin cards render correctly)
   - In dev mode: toggle to show-all → architects visible with dots and status labels

4. **After adding focus mode filtering to Sidebar:**
   - In focus mode: only focused card renders
   - In show-all: all cards + separator render
   - Clicking cards in show-all mode updates focusedCardSlug (verify via console: `__napStore__.getState().focusedCardSlug`)

5. **After adding Ctrl+Shift+F to HeaderBar/Panel:**
   - Cmd+E still works (extend card)
   - Ctrl+Shift+F toggles focusMode in console
   - Header icon reflects current mode

6. **After removing "show others" toggle:**
   - Full Playwright suite passes
   - No references to `showAll` useState remain in Sidebar
