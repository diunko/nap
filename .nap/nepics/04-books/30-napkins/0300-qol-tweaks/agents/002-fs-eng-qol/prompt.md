You're the fullstack engineer for the 0300-qol-tweaks feature. Read your role in `.nap/00-org/40-roles/fullstack-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0300-qol-tweaks/`):
1. `0300-qol-tweaks.nap.md` — the napkin
2. `0300-qol-tweaks.spec.md` — the spec (your primary reference)
3. `0300-qol-tweaks.stories.md` — user journeys
4. `0300-qol-tweaks.test.md` — test architecture (shape your code so these tests are possible)

Read the test architect's response and flags:
`.nap/nepics/04-books/30-napkins/0300-qol-tweaks/agents/001-test-arch-qol/response.md`

**Architect decisions on TA flags:**
- **Flag 1 (terminal link onOpen signature):** Change `onOpen` to accept the raw match text including `:line:col`. The routing function can then call `extractPathAndLocation` to separate path from line info. This way the existing regex match is passed through intact.
- **Flag 2 (markdown-it 0-indexed):** Yes, add +1 when writing `data-source-line` attributes. Document this in a comment.
- **Flag 3 (terminal tab upsertTab):** Use a fixed sentinel ID for the terminal slot (e.g., `'__terminal__'`). `setActiveTerminal` updates the slot's `agentId` and `title` fields. Never creates a new tab — always updates in place.
- **Flag 4 (CSS variable migration breadth):** Do the migration. Use `var(--nap-*)` for all colors. This is tedious but the theme system requires it. The dark theme's CSS variable values should produce the exact same appearance as the current hardcoded colors.

Read the existing code you're modifying:
- `packages/v3/src/renderer/ContentPane.tsx` — left pane
- `packages/v3/src/renderer/TerminalPane.tsx` — right pane
- `packages/v3/src/renderer/store.ts` — tab state
- `packages/v3/src/renderer/napkin-markdown.ts` — tokenizer
- `packages/v3/src/renderer/index.tsx` — layout, keybindings
- `packages/v3/src/renderer/Sidebar.tsx` — uses hardcoded colors
- `packages/v3/src/renderer/TabBar.tsx` — uses hardcoded colors
- `packages/v3/src/renderer/KanbanOverlay.tsx` — uses hardcoded colors
- `packages/v3/src/renderer/Gutter.tsx` — uses hardcoded colors
- `packages/v3/src/renderer/DebugPanel.tsx` — uses hardcoded colors
- `packages/v3/src/renderer/Terminal.tsx` — breadcrumb, uses hardcoded colors
- `packages/v3/src/renderer/file-link-provider.ts` — terminal link callback
- `packages/v3/src/renderer/routing-rules.ts` — routeLink()
- `packages/v3/src/renderer/git-gutter.ts` — decorations
- `packages/v3/src/shared/dot-style.ts` — role colors

Explore the codebase broadly before building.

## What to build

### 1. Tab size fix
- Add `tabSize: 2`, `insertSpaces: true` to ContentPane Monaco editor options.

### 2. Terminal link routing
- Change the `onOpen` callback in terminal link provider registration (in `index.tsx`) to pass raw match text to routing.
- Parse with `extractPathAndLocation`, then call `routeLink()`.
- Dispatch to `store.openDoc()` (for .nap paths) or `store.openCode()` (for code paths).

### 3. Theme system (`src/renderer/themes.ts`)
- Define `ThemeDef` type: name, monacoTheme, shell CSS variables, roleColors.
- 5 themes: dark + 4 light variants.
- Dark theme CSS variable values must match current hardcoded colors exactly.
- Export `THEMES` array.
- Store: `currentThemeName`, `cycleTheme()` action.
- Apply: `monaco.editor.setTheme()` + `document.documentElement.style.setProperty()` for shell.
- Persist in ui-state.json.
- Keybinding: Cmd+T in index.tsx.

### 4. CSS variable migration
- Replace all hardcoded hex colors across renderer components with `var(--nap-*)`.
- Components: Sidebar, Terminal, TabBar, KanbanOverlay, Gutter, DebugPanel, ContentPane, TerminalPane, breadcrumbs.
- The dark theme sets variables to the exact same hex values currently hardcoded.

### 5. Terminal tab refactor
- Fixed sentinel terminal slot with ID `'__terminal__'`, always at position 0 in rightTabs.
- `setActiveTerminal`: updates slot's agentId + title (agent name), never creates new tab.
- Title shows agent name, not UUID.

### 6. Git gutter bug fixes
- Re-request `file:git-diff` after every model content update (auto-save AND external change).
- 200ms delay after model update before requesting.
- Request on `editor.onDidFocusEditorText` (debounced).
- Guard: check model identity before applying decorations.

### 7. Rendered mode
- New dependency: `markdown-it`.
- `src/renderer/markdown-renderer.ts` — parse markdown, produce HTML with source line attributes and role comment styling.
- ContentPane: when `leftPaneRenderMode === 'rendered'`, hide Monaco, show HTML div.
- Store: `leftPaneRenderMode: 'edit' | 'rendered'`, `toggleRenderMode()` action, persisted.
- Cmd+Shift+H keybinding in index.tsx.
- Click handler on rendered div: `<a>` clicks → routeLink(). Cmd+click → edit at source line.
- CSS for rendered HTML: styled with theme CSS variables.

### 8. Tokenizer tweak
- In theme definitions: set `comment` foreground = `comment.user` foreground.

## Build order suggestion

1. Themes file + CSS variable migration (biggest surface area, unblocks everything visual)
2. Tab size fix (one-liner)
3. Tokenizer tweak (one-liner in themes)
4. Terminal tab refactor (store changes)
5. Terminal link routing (callback swap)
6. Git gutter fixes (ContentPane changes)
7. Rendered mode (new module + ContentPane integration)

Run `tsc --noEmit` in `packages/v3/` before you're done. Zero type errors.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0300-qol-tweaks/agents/002-fs-eng-qol/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
