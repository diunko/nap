## What was built

Three-column layout replacing the flat Sidebar with Gutter + NapkinBrowser + Terminal.

### New files
- `src/renderer/mock-data.ts` — hardcoded data: 3 nepics (P/S/+), 2 architects (002-nova running, 001-architect done), 8 napkins with various phases and 1-3 agents each. Includes dot color/hollow/pulse helpers.
- `src/renderer/components/Gutter.tsx` — 60px fixed column, vertical nepic icons, active indicator bar on left edge. `data-testid="gutter"`, `data-testid="nepic-icon"`.
- `src/renderer/components/NapkinBrowser.tsx` — 300px column replacing Sidebar.tsx. Architects pinned at top, separator, napkin list below. Three card states (collapsed/focused/extended via Cmd+E). `*` bullet format matching the design sprint HTML. Cmd+K filter. `data-testid="napkin-browser"`, `data-testid="browser-filter"`, `data-testid="napkin-card"`, `data-testid="browser-agent"`.

### Modified files
- `src/renderer/store.ts` — added browser state: `focusedCardSlug`, `cardViewMode`, `activeNepicId`, `browserFilterText`, `browserFilterVisible`, plus actions `expandCard`, `collapseCard`, `extendCard`, `setActiveNepic`, `setBrowserFilter`, `setBrowserFilterVisible`. Existing selectors and actions untouched.
- `src/renderer/components/Terminal.tsx` — added breadcrumb header (`S > napkin-name > agent-name`) above the terminal container. The `containerRef` stays on a dedicated div below the breadcrumb so DOM reparenting is not affected. ResizeObserver still observes the same ref.
- `src/renderer/index.tsx` — three-column flex layout (Gutter always visible, NapkinBrowser toggled by Cmd+B, Terminal fills rest). Added `@keyframes pulse` for agent dot animation. Imports switched from Sidebar to Gutter + NapkinBrowser.

### Design decisions
- **Breadcrumb derives from mock data**: `deriveBreadcrumb()` looks up the active terminal ID in mock architects and napkin agents to build the path segments. When no mock entry matches (i.e. real terminals), it falls back to just showing `S`.
- **Card toggle is idempotent**: clicking the same card again collapses it. Only one card can be focused/extended at a time.
- **Cmd+E toggles extended**: pressing Cmd+E on an already-extended card returns to focused view.
- **Filter bar always visible**: matches the HTML mock — filter input is shown with placeholder `⌘K filter napkins...`, becomes editable on click or Cmd+K.

### Test compatibility
- **Typecheck**: zero errors (`npm run typecheck` passes).
- **Existing store tests** (`tests/multi-terminal/store-registry.test.ts`): `toggleSidebar()` still works — now hides the NapkinBrowser column while Gutter stays visible.
- **Existing e2e tests** (`tests/polish/polish.spec.ts`): T-0600-20/21/22 reference `data-testid="sidebar-filter"` and `data-testid="agent-card"` which are from the old Sidebar. These selectors need updating to `browser-filter` and `napkin-card`. The filter behavior also changed — it now filters napkin names instead of terminal names. The test engineer should update these tests to match the new NapkinBrowser behavior while preserving the intent (filter works, clicks switch terminals).
- **Scroll lock / resize tests**: untouched — `containerRef` and `ResizeObserver` setup is identical, just nested inside a column flex container.
- **Sidebar.tsx**: file not deleted — still exists for reference but is no longer imported.
