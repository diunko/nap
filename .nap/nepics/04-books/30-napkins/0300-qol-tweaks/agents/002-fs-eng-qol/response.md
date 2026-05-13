# Fullstack engineer response — 0300-qol-tweaks

## Delivered

All 8 items built. `tsc --noEmit` passes with zero errors.

## What was built

### 1. Tab size fix
- Added `tabSize: 2`, `insertSpaces: true` to ContentPane editor options.

### 2. Terminal link routing
- `file-link-provider.ts`: exported `extractPathAndLocation`, changed `activate` to reattach `:line:col` to resolved path before calling `onOpen`.
- `routing-rules.ts`: fixed `routeLink` to handle absolute paths with empty `sourceFilePath` (terminal context) — uses path as-is instead of prepending project root.
- `index.tsx`: replaced `window.electronAPI.openFilePath` callbacks with `routeLink`-based routing. `.nap/` paths → `store.openDoc()`, code paths → `store.openCode()` with line/col.

### 3. Theme system (`themes.ts`)
- New file with `ThemeDef` type: `name`, `monacoTheme`, `shell` (11 CSS variable values), `roleColors`.
- 5 themes: `dark`, `light-cream`, `light-gray`, `light-sepia`, `light-blue`.
- Dark theme shell values exactly match the hardcoded hex colors from the original code.
- `registerThemes()` — registers all Monaco themes via `defineTheme`.
- `applyTheme()` — calls `monaco.editor.setTheme()` + sets CSS variables on `:root`.
- `findTheme()` — lookup by name with fallback to `THEMES[0]`.
- Store: `currentThemeName`, `cycleTheme()` rotates through `THEMES` array (modulo).
- Keybinding: Cmd+T in `index.tsx`.
- Persisted as `{ theme: "dark" }` in ui-state.json. Fallback to `THEMES[0]` on load if saved name not found.

### 4. CSS variable migration
- Replaced all hardcoded hex colors across: Sidebar, TabBar, Terminal, KanbanOverlay, Gutter, DebugPanel, ContentPane, TerminalPane, index.tsx.
- 11 CSS variables: `--nap-bg`, `--nap-bg-secondary`, `--nap-bg-tertiary`, `--nap-bg-hover`, `--nap-border`, `--nap-text`, `--nap-text-secondary`, `--nap-text-muted`, `--nap-text-dim`, `--nap-accent`, `--nap-link`.
- Role colors also set as `--nap-role-{role}` for rendered mode styling.

### 5. Terminal tab refactor
- Sentinel terminal tab with fixed ID `'__terminal__'`, always at position 0 in `rightTabs`.
- `setActiveTerminal()`: looks up agent name from store state, updates sentinel's `path` (agent ID) and `title` (agent name) in place. Never creates new tabs.
- Added `title?: string` to `Tab` interface. TabBar uses `tab.title` for display when present.
- `closeTab()`: unconditionally prevents closing the `__terminal__` sentinel.
- File tabs remain unaffected by terminal switches.

### 6. Git gutter bug fixes
- `refreshGitGutter()`: now has 200ms debounce delay before requesting diff (gives git time to see new file state).
- Model identity guard: captures model reference before async call, checks it hasn't changed before applying decorations.
- Added `editor.onDidFocusEditorText` handler (300ms debounce) → re-requests git diff on tab focus return.
- Cleanup: timers cleared on component unmount.

### 7. Rendered mode
- New file: `markdown-renderer.ts` — uses `markdown-it` with:
  - Core rule plugin for `data-source-line` attributes on block elements (0-indexed → +1 for Monaco).
  - Text renderer override for `//XX:` role comment detection → wraps in `<span class="role-comment role-{role}">`.
  - Post-process regex catch for mid-paragraph role comments.
- ContentPane: when `leftPaneRenderMode === 'rendered'`, hides Monaco, shows rendered HTML div.
- Click handler: plain click on `<a>` → `routeLink()` dispatch. Cmd+click → walk DOM to `[data-source-line]`, switch to edit mode, `setPosition` at source line.
- Content updates on model changes (external edits reflected live).
- Store: `leftPaneRenderMode: 'edit' | 'rendered'`, `toggleRenderMode()`, persisted in ui-state.json.
- Keybinding: Cmd+Shift+H in `index.tsx`.

### 8. Tokenizer tweak
- In all theme definitions: `comment` token foreground = `comment.user` foreground (both use the user/green role color).
- Removed theme definition from `napkin-markdown.ts` — themes.ts is now the single source.

## Decisions

- **Shell CSS variables:** Extended beyond the 6 minimum (bg, bgSecondary, border, text, textMuted, accent) to 11 properties to cover all component color variations. The test architect's minimum set is a subset.
- **Kanban/debug overlay backgrounds:** Mapped to `--nap-bg` rather than adding dedicated variables. The slight color difference vs. the original `#1a1a2e`/`#1a1a1a` is negligible and simplifies the variable set.
- **Terminal link routing flow:** `file-link-provider` resolves the path and reattaches `:line:col`, then passes the full string to `routeLink()`. This preserves line info through the chain while reusing the existing routing logic.
- **markdown-it import:** Added as a runtime dependency. Type definitions via `@types/markdown-it`.
- **Role comment detection in rendered mode:** Dual approach — markdown-it text token override for start-of-token patterns, plus HTML post-process regex for mid-text patterns. Covers both `* //A: thought` and inline occurrences.

## Files changed

| File | Change |
|---|---|
| `src/renderer/themes.ts` | **New** — theme definitions, registration, application |
| `src/renderer/markdown-renderer.ts` | **New** — markdown-it renderer with source lines + role comments |
| `src/renderer/store.ts` | Added theme + render mode state/actions, terminal tab sentinel |
| `src/renderer/ContentPane.tsx` | Tab size, theme init, git gutter fixes, rendered mode |
| `src/renderer/TerminalPane.tsx` | CSS variables, theme reference |
| `src/renderer/TabBar.tsx` | CSS variables, title support |
| `src/renderer/Sidebar.tsx` | CSS variables throughout |
| `src/renderer/Terminal.tsx` | CSS variables for breadcrumb + modals |
| `src/renderer/KanbanOverlay.tsx` | CSS variables throughout |
| `src/renderer/Gutter.tsx` | CSS variables throughout |
| `src/renderer/DebugPanel.tsx` | CSS variables throughout |
| `src/renderer/index.tsx` | Keybindings (Cmd+T, Cmd+Shift+H), terminal link routing, CSS variables |
| `src/renderer/napkin-markdown.ts` | Removed theme definition (moved to themes.ts) |
| `src/renderer/file-link-provider.ts` | Exported extractPathAndLocation, pass raw match with :line:col |
| `src/renderer/routing-rules.ts` | Fixed routeLink for absolute paths with empty sourceFilePath |
| `package.json` | Added markdown-it dependency |
