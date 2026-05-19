# response2 — 001-fs-eng-design-impl (round 2)

## status: done

## what was built

### new modules
1. **`dot-style.ts`** — pure `getDotStyle({ role, running, done, exited, archived })` → `{ color, shape }`. Ported from v3's shared module. Role → color mapping (test-arch orange, fs-eng green, test-eng gray, architect blue, guardian purple). Status → shape (filled/dashed-check/hollow). Archived/exited override to gray hollow. Also exports `getPhaseColor` for napkin status labels.

2. **`nav-renderer.ts`** — card system DOM rendering. `NavRenderer` class takes `NavNode[]` from `parseNavTree`, produces mock-e card DOM:
   - Napkin cards: collapsed header (bullet + name + dots + phase) / focused (header + body with blue accent border)
   - Agent dots in card headers (small, 7px) and agent rows (large, 8px) with SVG checkmark for done
   - File rows: `*` bullet + name, `.md` in link color, main `.nap.md` file bold
   - Agents flattened — skips `agents/` dir, hoists agent children to same indent as files
   - Dir rows with trailing `/`
   - Show-all toggle for non-focused napkins
   - Terminal entries (`[terminal]`) per agent
   - Active file highlighting

3. **`tab-manager.ts`** — ephemeral/permanent tab lifecycle. `TabManager` class manages:
   - Tab creation: `openEphemeral(path, label)` reuses the single ephemeral slot
   - Pinning: `pinActiveEphemeral()` called on editor content change (edit makes tab permanent)
   - Double-click pins, middle-click closes
   - Close button visible on hover
   - Terminal tab always present, cannot close
   - Emits `onActivate` callback for surface switching

### replaced files
- **`side-panel.html`** — replaced entirely with mock-e layout + CSS:
  - Layout: `[editor/terminal] [resize-handle] [nav]` (editor left, nav right)
  - Header bar: napkin name + fetch latest + settings gear + nav toggle
  - Tab bar from mock-e with ephemeral italic support
  - Nav sidebar on right (240px, drag handle on left edge, gray hover)
  - Full card system CSS (napkin-card, focused accent, file-row, dir-row, agent-row, dot)
  - Terminal dark theme from bash-poc (bg #1e1e1e)
  - Settings overlay, notification bar preserved

- **`side-panel.ts`** — rewritten as orchestration:
  - Monaco + terminal setup preserved (proven CSP config)
  - Wires NavRenderer callbacks → openFile
  - Wires TabManager callbacks → surface switching
  - openFile manages both content loading AND tab creation (avoids race condition)
  - Auto-save pins ephemeral tab on first edit
  - Resize handle, settings, auth, link provider — all preserved
  - Test hooks (`window.__*`) preserved at same IDs

### fixtures
- `fixtures/.nap/` — content moved into `nepics/01-v1/` wrapper
- `fixtures/README.md` — updated to reflect new structure

### test updates
- **ux-e2e.spec.ts**: 3 selector changes per migration table:
  - `.nav-entry.expandable` → `.napkin-card`
  - `.expanded` → `.focused`
  - `.nav-file` → `.file-row`
  - `hasText: 'delivery-pipeline'` → `hasText: 'feature'` (matches remote repo content)
- **lifecycle.spec.ts**: `toContain('napkins')` → `toContain('0100-feature')` (L1, L6)
- **gap-tests.spec.ts**: same assertion updates (L5)
- **happy-path-debug.spec.ts**: test-1 now opens a dummy file before checking editor tab (editor tabs are created on file open, not statically)

### pre-existing test bugs fixed
- **smoke.spec.ts**: was importing `test` from `@playwright/test` instead of `./fixtures`. This gave it a vanilla browser context with no extension loaded — the 3s SW timeout always failed. Fixed: import from `./fixtures` to get the persistent context with `--load-extension`.
- **cmd-click.spec.ts**: race condition — test called `window.__setMainRepoConfig` before `main()` finished registering test hooks. Monaco appears at step 4 of init, but hooks are set at step 17. Test waited for Monaco then immediately used hooks. Fixed: added `toPass` poll waiting for `__setMainRepoConfig` to be a function before calling it.

## test results

- **vitest**: 29/29 passed
- **Playwright (workers=1)**: 21/21 passed (all green)
- **tsc --noEmit**: zero errors

## architecture decisions

1. **openFile is the single entry point** for loading files. It handles content loading, tab creation, and surface switching. Nav click handlers call openFile directly. This avoids the race condition where tab activation happens before file content is loaded.

2. **NavRenderer caches sections** for re-render on card focus change. When a card header is clicked, it toggles `focusedCardSlug` and re-renders from the cached sections.

3. **Agents flattened in renderer, not parser.** `nav-tree.ts` (parseNavTree) still nests agents inside an `agents` section — this keeps the parser pure and tested. The NavRenderer detects `agents` sections and hoists children up one level during rendering.

4. **JSON cache for agent metadata.** The nav tree refresh builds a `Map<string, Record<string, unknown>>` during LFS traversal, which is passed to NavRenderer for agent dot styling. This avoids re-reading `.agent.nap.json` files during rendering.

## what to review
- The tab manager's ephemeral slot reuse: when you single-click files quickly, the ephemeral tab updates in place. Double-click or edit pins it. This matches v3's TabBar.tsx behavior.
- The card focus toggle: clicking a focused card's header unfocuses it. Clicking another card focuses it and unfocuses the previous one. "Show all" toggle reveals collapsed cards below the separator.
