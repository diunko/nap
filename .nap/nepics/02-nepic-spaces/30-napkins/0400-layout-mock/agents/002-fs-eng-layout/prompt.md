You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: replace the flat sidebar with a three-column layout — Gutter + NapkinBrowser + Terminal — using hardcoded mock data.

Read these in order:
1. `.nap/00-org/10-promise.nap.md` — what NAP is
2. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.nap.md` — the napkin
3. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.spec.md` — the spec
4. `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.test.md` — test architecture (shape your code so these tests are possible)

**Design reference (read in this order):**
1. Screenshots first — clean picture of what the UI should look like: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
2. Voiceover — mandatory, has designer commentary explaining each screenshot: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
3. HTML mocks — reference for exact colors, spacing, CSS values: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

Read the existing code you're refactoring:
- `src/renderer/components/Sidebar.tsx` — what you're replacing
- `src/renderer/components/Terminal.tsx` — add breadcrumb header
- `src/renderer/store.ts` — extend with browser state
- `src/renderer/index.tsx` — layout container
- `src/renderer/terminal-registry.ts` — DOM reparenting (don't break this)

What to build:
1. `src/renderer/components/Gutter.tsx` — nepic switcher (60px, vertical icons P/S/+)
2. `src/renderer/components/NapkinBrowser.tsx` — replaces Sidebar.tsx
   - Architects pinned at top, napkin list below
   - Three card states: collapsed (one-line), focused (artifacts + agents), extended (Cmd+E, filesystem)
   - `*` bullet format — the sidebar IS a napkin
   - Cmd+K filter
   - Click agent → store.setActive(terminalId)
   - Click artifact → shell.openPath
3. Update `src/renderer/components/Terminal.tsx` — add breadcrumb header
4. Update `src/renderer/index.tsx` — three-column flex layout
5. Update `src/renderer/store.ts` — add browser state (focusedCardSlug, cardViewMode, etc.)
6. Create `src/renderer/mock-data.ts` — hardcoded napkins, agents, statuses for development
7. Add `data-testid` attributes: `gutter`, `napkin-browser`, `nepic-icon`, `browser-filter`, etc.

Key constraints:
- Terminal DOM reparenting must still work — don't change the container ref pattern
- Cmd+B toggles middle column only, gutter stays visible
- ResizeObserver must still fire correctly with three-column flex
- All existing terminal features preserved (scroll lock, file links, resize)
- Match the design sprint screenshots and HTML exactly — colors, spacing, typography
- Run `npm run typecheck` — zero errors

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/agents/002-fs-eng-layout/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
