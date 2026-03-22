# 0400-layout-mock — test architecture

## What's being tested

Replacing the flat `Sidebar.tsx` with a three-column layout (Gutter + NapkinBrowser + Terminal). Hardcoded mock data. No real filesystem or SQLite — pure UI refactor.

## Risk map

The refactor touches the layout container that wraps the terminal. The terminal uses DOM reparenting, ResizeObserver, WebGL canvas, and scroll position tracking. All of these are sensitive to container changes. The highest-risk seam is **terminal survival through layout restructuring** — if the xterm element loses its parent or ResizeObserver stops firing, everything breaks silently.

Second risk: **store shape change**. Adding browser state (expanded cards, view mode, active nepic) to zustand store must not break existing selectors that drive terminal switching, sidebar toggle, and scroll lock.

Third risk: **Cmd+B toggle semantics change**. Today it hides the entire sidebar (250px). After refactor it hides only the middle column (~300px) while the gutter (60px) stays. The terminal resize delta changes, and the fitAddon.fit() call must still produce correct cols.

---

## T-0400-01: three-column layout mounts without crashing

* **Flow**: App renders → three columns visible (gutter, browser, terminal)
* **Subsystems**: index.tsx layout, Gutter.tsx, NapkinBrowser.tsx, Terminal.tsx
* **Expected**: all three containers in DOM with correct flex structure
* **Where it breaks**: missing import, React key errors, mock data shape mismatch with component props
* **Test size**: small (vitest + jsdom)
* **Verification**: render `<App />` with mocked store + electronAPI, assert three top-level flex children exist via `container.querySelectorAll`. Assert gutter has fixed width (~60px style), browser has ~300px, terminal fills rest.

---

## T-0400-02: terminal switching preserves buffer after layout change

* **Flow**: create terminal A → write 5000 lines → create terminal B → switch back to A → verify buffer
* **Subsystems**: terminal-registry (DOM reparent), store.setActive, Terminal.tsx container ref, fitAddon
* **Expected**: buffer line count and content identical before and after switch
* **Where it breaks**: DOM reparenting fails if terminal container structure changed (extra wrapper divs, different ref target). The `container.appendChild(entry.terminal.element)` call in Terminal.tsx depends on the container ref pointing at the right div. If the breadcrumb header is inside the same ref div, reparenting could nest incorrectly.
* **Test size**: medium (playwright + electron)
* **Verification**: `page.evaluate()` — write `seq 1 5000` via pty, record `bufferLength` and `bufferLine(50)`, switch to B, switch back to A, assert identical values. This is the existing T-0200-01 pattern — it must still pass unchanged.

---

## T-0400-03: Cmd+B toggles middle column only, gutter stays

* **Flow**: Cmd+B → middle column hides → gutter still visible → terminal expands → Cmd+B → middle column returns
* **Subsystems**: store.toggleSidebar (renamed or extended), index.tsx conditional render, Gutter.tsx, ResizeObserver
* **Expected**: gutter always visible. Terminal cols increase when browser hides, decrease when it returns. Gutter width unchanged.
* **Where it breaks**: if toggleSidebar still hides the entire left side (gutter + browser together), the gutter disappears. Or if ResizeObserver doesn't fire because the flex parent didn't reflow.
* **Test size**: medium (playwright + electron)
* **Verification**: `page.evaluate()` — read terminal cols before toggle, call `store.toggleSidebar()`, wait 300ms for ResizeObserver debounce, read cols after. Assert `colsAfter > colsBefore`. Assert gutter DOM element still present: `document.querySelector('[data-testid="gutter"]')` is not null. Toggle back, verify cols return to original value (within ±1 for rounding).

---

## T-0400-04: card state transitions (collapsed → focused → extended)

* **Flow**: all cards start collapsed → click one → it expands to focused (shows artifacts + agents) → Cmd+E → extends to full filesystem view → click another → previous collapses, new one focuses
* **Subsystems**: store browser state (expandedCardId, viewMode), NapkinBrowser.tsx rendering
* **Expected**: only one card focused/extended at a time. Collapsed cards remain one-liners. State stored in zustand.
* **Where it breaks**: state management — multiple cards expanding simultaneously, or Cmd+E applying globally instead of to the focused card. Also: if focused card is near the bottom, expanding it could push content out of scroll view.
* **Test size**: small (vitest + jsdom)
* **Verification**: call store actions directly — `expandCard('0100-design-sprint')`, assert store state has `focusedCardSlug === '0100-design-sprint'`. Call `extendCard()`, assert `viewMode === 'extended'`. Call `expandCard('0200-sqlite-persistence')`, assert previous card collapsed and new one focused.

---

## T-0400-05: Cmd+K filter works in napkin browser

* **Flow**: Cmd+K → filter input appears in browser → type "sqlite" → only matching napkins visible → Escape → filter clears, all napkins visible
* **Subsystems**: NapkinBrowser.tsx (filter state), keyboard handler (migrated from Sidebar.tsx)
* **Expected**: case-insensitive substring match on napkin names. Architects (pinned) not filtered out. Filter input appears/disappears.
* **Where it breaks**: keyboard handler registered on wrong component or window scope conflicts with terminal key capture. If the filter was on Sidebar.tsx and moved to NapkinBrowser.tsx, the event listener registration might change.
* **Test size**: medium (playwright + electron)
* **Verification**: `page.evaluate()` — dispatch Cmd+K keydown event on window, assert filter input exists (`[data-testid="browser-filter"]`). Set filter value to 'sqlite', read visible napkin count from store (filtered list length). Assert it's less than total. Clear filter, assert full count restored.

---

## T-0400-06: terminal resize works with three-column layout

* **Flow**: app launches with three columns → terminal has N cols → resize window wider → terminal cols increase → resize narrower → cols decrease
* **Subsystems**: ResizeObserver in Terminal.tsx, fitAddon, pty.resize IPC, three-column flex layout
* **Expected**: terminal cols track available width accurately. No crash, no stuck dimensions.
* **Where it breaks**: ResizeObserver was observing a div that no longer exists or is nested differently. The flex layout might not shrink the terminal container if min-width constraints are wrong. The gutter's fixed 60px and browser's ~300px must be subtracted correctly.
* **Test size**: medium (playwright + electron)
* **Verification**: `app.evaluate()` — set window size to 1400x900, wait 300ms, read `terminal.cols` via `page.evaluate()`. Set window to 1000x900, wait 300ms, read cols again. Assert decrease. This is the existing pattern from T-0200-05 adapted for three columns.

---

## T-0400-07: scroll lock modes preserved through layout change

* **Flow**: activate follow lock (Cmd+G) → verify blue border → toggle browser visibility → lock mode unchanged → deactivate
* **Subsystems**: scroll-lock module, store.scrollLockModes, Terminal.tsx border rendering, ResizeObserver (resize during lock)
* **Expected**: scroll lock state survives sidebar toggle and window resize. Border colors render correctly in new layout.
* **Where it breaks**: if Terminal.tsx wrapper div structure changed, the border style might not apply. Or: ResizeObserver triggers fitAddon.fit() which changes baseY, but scroll lock saved a viewport position relative to old dimensions.
* **Test size**: medium (playwright + electron)
* **Verification**: `page.evaluate()` — set scroll lock to 'follow' via the menu event path, read `store.scrollLockModes[id]`, assert 'follow'. Toggle sidebar, wait 300ms, read mode again — still 'follow'. Assert border color via computed style on the terminal wrapper.

---

## T-0400-08: breadcrumb renders correct path segments

* **Flow**: architect terminal active → breadcrumb shows `S > (architect)` → click agent in browser → breadcrumb updates to `S > napkin-name > agent-name` → click back to architect → breadcrumb resets
* **Subsystems**: Terminal.tsx breadcrumb header, store (active terminal → derive napkin/agent from mock data), click handler in NapkinBrowser
* **Expected**: breadcrumb always reflects the active terminal's context. Segments are clickable (but click behavior is tested separately).
* **Where it breaks**: mapping from terminal ID to napkin/agent name requires joining mock data with terminal registry. If the mock data structure doesn't carry the association, breadcrumb shows empty or wrong segments.
* **Test size**: small (vitest + jsdom)
* **Verification**: render Terminal component with a store state where activeTerminalId maps to a mock agent entry. Assert breadcrumb text contains the expected path segments. Change activeTerminalId, re-render, verify breadcrumb updates.

---

## T-0400-09: clicking agent in browser switches terminal

* **Flow**: napkin card focused → click agent name/dot → terminal switches to that agent's session → breadcrumb updates → previous terminal buffer preserved
* **Subsystems**: NapkinBrowser click handler → store.setActive, Terminal.tsx reparent, breadcrumb
* **Expected**: store.activeTerminalId changes to the clicked agent's terminal ID. Terminal DOM reparents. Buffer preserved.
* **Where it breaks**: agent click handler calls setActive with wrong ID (mock data ID vs terminal registry ID mismatch). Or: the click event bubbles to the card's own click handler and triggers a card collapse instead.
* **Test size**: medium (playwright + electron)
* **Verification**: `page.evaluate()` — read initial activeTerminalId (architect). Simulate agent click by calling `store.setActive(agentTerminalId)` directly (avoids DOM click fragility). Assert activeTerminalId changed. Read breadcrumb text. Verify old terminal buffer still intact via `getTerminal(oldId).terminal.buffer.active.length`.

---

## T-0400-10: gutter renders nepic icons in correct order

* **Flow**: app mounts → gutter shows P, S (highlighted), +
* **Subsystems**: Gutter.tsx, mock data (nepic list)
* **Expected**: icons render vertically. Active nepic (S) has white left bar indicator. P is dimmed. + is at the bottom.
* **Where it breaks**: mock data shape wrong, or CSS flexDirection not column.
* **Test size**: small (vitest + jsdom)
* **Verification**: render Gutter component, query children by `data-testid="nepic-icon"`. Assert count is 3. Assert second has active class/style. Assert order: P, S, +.

---

## T-0400-11: mock data populates browser with correct structure

* **Flow**: app mounts → browser shows architects pinned at top → napkin list below with status badges and agent dots
* **Subsystems**: NapkinBrowser.tsx, mock data module, store initialization
* **Expected**: 2 architects pinned, 5-8 napkins with various statuses, each napkin has 2-3 agents with status dots
* **Where it breaks**: mock data module not imported, or data shape doesn't match component expectations (missing required fields)
* **Test size**: small (vitest + jsdom)
* **Verification**: import mock data directly, assert it has the required shape (napkins array with slug, status, agents array with name, status). Render NapkinBrowser with the mock data in store, assert rendered napkin count matches mock data length.

---

## T-0400-12: existing tests still pass (regression)

* **Flow**: run full test suite — all T-0100-xx, T-0200-xx, T-0300-xx tests pass
* **Subsystems**: everything — this is the regression safety net
* **Expected**: zero failures. The refactor changes layout but preserves all terminal, IPC, socket, and pty behavior.
* **Where it breaks**: import paths changed (Sidebar → Gutter/NapkinBrowser), store shape changed (new fields break existing selectors), Terminal.tsx wrapper div changed (breaks existing querySelector patterns in tests)
* **Test size**: medium (full suite run)
* **Verification**: `npm test` — all green. This is not a new test to write, but a constraint: the refactor must not break any existing test. If an existing test relies on `[data-testid="agent-card"]` in Sidebar, it needs updating to the new component — but the BEHAVIOR it tests must still pass.

---

## Test count summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 4     | T-01, T-04, T-08, T-10, T-11 |
| Medium | 7     | T-02, T-03, T-05, T-06, T-07, T-09, T-12 |
| Big    | 0     | — |

## What NOT to test here

* Visual correctness (colors, spacing, fonts) — manual testing against v2-final.html
* Kanban overlay — separate napkin (0220)
* Real filesystem or SQLite integration — this is mock data only
* Agent lifecycle (start/stop/poke/done) — tested in 0300/0500
* Click-to-open-file (shell.openPath) — existing mechanism, tested elsewhere
