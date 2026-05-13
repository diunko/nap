# 0300 — spec

## What

Seven quality-of-life improvements based on usage experience with the books MVP (0100 + 0200).

## Items

### 1. Tab size

Set `tabSize: 2` and `insertSpaces: true` in the ContentPane Monaco editor config. Currently defaults to 4 for new/empty files (auto-detect only kicks in for pre-existing content).

One-liner change in `ContentPane.tsx` editor creation options.

### 2. Terminal link routing

Terminal file links currently call `shell.openPath` (opens in OS editor). Change to route through `routeLink()`:
- Path inside `.nap/` → left pane (Monaco).
- Path outside `.nap/` → right pane (code view, with :line scroll).

In `src/renderer/index.tsx` (or wherever the terminal link provider is registered), swap the `onOpen` callback from `window.electronAPI.openFilePath(path)` to a function that calls `routeLink()` and dispatches to `store.openDoc()` or `store.openCode()`.

The existing `file-link-provider.ts` regex and `extractPathAndLocation` stay unchanged — only the callback changes.

### 3. Theme system

New file: `src/renderer/themes.ts`.

Each theme definition (`ThemeDef`) includes:
- `name: string` — unique identifier, used for persistence.
- `monacoTheme` — Monaco `IStandaloneThemeData` definition.
- `shell` — CSS variable values for app chrome: `{ bg, bgSecondary, border, text, textMuted, accent }`.
- `roleColors` — per-theme role color map (same keys as `ROLE_COLORS` in `dot-style.ts`, adjusted for contrast).

Five themes to start:
- `dark` — current `napkin-dark`, existing colors.
- `light-cream` — warm off-white background (#FDF6E3 or similar), dark text.
- `light-gray` — cool neutral (#F5F5F5), dark text.
- `light-sepia` — warm yellow-tinted (#FAF0DC), dark text.
- `light-blue` — cool blue-tinted (#F0F4F8), dark text.

Export `const THEMES: ThemeDef[]`. The array is the rotation list — commenting out entries removes them from rotation.

**Keybinding:** Cmd+T rotates through `THEMES`. Handler in `index.tsx`: `currentIndex = (currentIndex + 1) % THEMES.length`.

**Application:** Both Monaco editor instances get `monaco.editor.setTheme(theme.name)`. App shell elements (sidebar, tab bar, breadcrumbs, gutter, kanban, debug panel) read from CSS custom properties set on `:root` or `body`. The theme toggle sets these properties via `document.documentElement.style.setProperty(...)`.

**Persistence:** Store current theme name in `ui-state.json` as `{ "theme": "dark" }`. On load, find theme by name. If not found (commented out), fall back to `THEMES[0]`.

**Store:** Add `currentThemeName: string` to renderer state. Action `cycleTheme()`.

### 4. Terminal tab refactor

The right pane currently creates a new terminal tab per `setActiveTerminal()` call. Refactor to:

- **Single terminal slot:** always present at position 0 in `rightTabs`. Type `'terminal'`. Cannot be closed, cannot be pinned (it's permanent). Cannot accumulate — there's always exactly one.
- **Title:** shows `agent.name` (from the active agent), not UUID. Update title when `setActiveTerminal` changes.
- **Tab bar display:** terminal tab is always leftmost. File/code tabs appear after it.
- **setActiveTerminal:** no longer creates tabs. Instead, updates the existing terminal slot's `agentId` and title. Sets `activeRightTabId` to the terminal tab's id. Sets `rightPaneMode: 'terminal'`.

### 5. Git gutter bug fixes

Current issue: decorations disappear or don't appear on app reopen, file switch, or external file change.

**Root cause:** `file:git-diff` is only re-requested on the auto-save path. External file changes and file-open don't trigger a diff refresh. Also, on file open there's a race where the diff response arrives after a Monaco model swap, applying decorations to a disposed model.

**Fix:**
- Request `file:git-diff` on **every model content update**: after auto-save, after external change callback, and on file open (after model is set).
- Add 200ms delay after model update before requesting diff (gives git time to see the new file state).
- Request `file:git-diff` on `editor.onDidFocusEditorText` (catches stale decorations when switching tabs). Debounce to avoid spam.
- Ensure decorations are applied to the **current** model (check model identity before applying).

### 6. Rendered mode

Toggle: **Cmd+Shift+H**. Global for the left pane — all tabs share the mode.

**Store:** `leftPaneRenderMode: 'edit' | 'rendered'`. Action `toggleRenderMode()`. Persisted in ui-state.json.

**Rendered view implementation:**
- Parse markdown to HTML using `markdown-it`. New dependency.
- Custom markdown-it plugin for role comments: detect `//XX: ` pattern, wrap in `<span class="role-comment role-XX">`.
- HTML rendered in a `<div>` that replaces (hides) the Monaco editor when mode is `'rendered'`.
- Styled with the current theme's CSS variables.
- Tables render as `<table>` (markdown-it handles this natively).
- Links are clickable: regular click → `routeLink()` dispatch (same behavior as edit mode). This means the rendered view needs a click handler that detects `<a>` tags, extracts href, and routes.
- Source line mapping: enable markdown-it's `map` on tokens. Post-process HTML to add `data-source-line="N"` on block-level elements (p, h1-h6, li, tr, hr, blockquote).

**Cmd+click to edit:** In rendered view, Cmd+click anywhere:
1. Walk up DOM from click target to nearest `[data-source-line]`.
2. Read line number.
3. Set `leftPaneRenderMode: 'edit'`.
4. `editor.setPosition({ lineNumber, column: 1 })`.
5. `editor.focus()`.

**No scroll sync.** User navigates via Cmd+click.

### 7. Tokenizer tweak

Change the generic `//` comment token color to match `//DU:` color. Currently generic `//` is muted gray-blue while `//DU:` is green. Since bare `//` comments are written by the user, they should look the same as `//DU:`.

In the theme definitions (both existing `napkin-dark` and all new themes): set `comment` foreground to match `comment.user` foreground.

## Hard parts

- **Theme system CSS variables:** Every styled component in the app uses hardcoded hex colors (e.g., `#252526`, `#3c3c3c`, `#6b7280`). These all need to become CSS variable references (`var(--nap-bg-secondary)`). This is a broad find-and-replace across Sidebar, Terminal, TabBar, KanbanOverlay, Gutter, DebugPanel, breadcrumbs. Tedious but mechanical.
- **markdown-it source mapping:** The `map` property is only available on block tokens, not inline. Inline elements (bold, links inside paragraphs) inherit the parent block's line number. This is fine for Cmd+click (you land on the paragraph's first line) but won't give character-level precision.
- **Role comments in rendered HTML:** The `//XX:` pattern occurs inside list items and paragraphs. A markdown-it plugin that runs on `core` rules can detect and wrap these. Alternatively, post-process the HTML string with regex. The plugin approach is cleaner.
