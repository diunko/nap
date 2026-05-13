# 002-fs-eng-links — response

## What was built

10 files created/modified. `tsc --noEmit` passes with zero errors.

### New files

| File | Purpose |
|---|---|
| `src/main/git-diff-parser.ts` | Pure function `parseGitDiff(output) → DiffHunk[]`. Parses `@@ -a,b +c,d @@` hunk headers, classifies add/modify/delete. Handles binary files (skip), edge cases. |
| `src/renderer/TabBar.tsx` | Shared tab bar component for both panes. Ephemeral tabs italic. Close on hover. Middle-click close. Double-click pin. |
| `src/renderer/content-link-provider.ts` | Monaco link detection for napkin-markdown. Detects bare paths (`file.ts:42`), markdown links (`[text](path#L42)`), bare URLs (`https://...`). `handleLinkClick()` classifies via `routeLink()` and dispatches. |
| `src/renderer/git-gutter.ts` | `applyGitGutter(editor, hunks, oldDecorations) → newDecorations`. CSS classes injected for green (add), blue (modify), red triangle (delete). |

### Modified files

| File | Changes |
|---|---|
| `src/renderer/routing-rules.ts` | Added `routeLink(ctx: LinkContext): LinkResult`. Classification by extension. Path resolution: leading `/` → projectRoot, `./`/`../` → dirname, bare → dirname primary + projectRoot fallback. Exported `parseLinkHref`, `extractProjectRoot` for testability. |
| `src/renderer/store.ts` | Added `Tab` type, `rightPaneMode`, `rightFilePath`, `rightFileLine`, `leftTabs`/`rightTabs`, `activeLeftTabId`/`activeRightTabId`. Actions: `openCode`, `openDoc`, `closeTab`, `closeActiveTab`, `pinTab`, `pinActiveEphemeral`, `saveTabScroll`. Per-nepic tab memory (save/restore on nepic switch). `setActiveTerminal` now creates terminal tab + sets `rightPaneMode: 'terminal'`. `openFile` delegates to `openDoc`. |
| `src/renderer/TerminalPane.tsx` | Mixed surface: terminal OR code editor based on active right tab. New `CodeEditor` component: read-only Monaco, language detection from extension, `revealLineInCenter` + yellow fade animation (1.5s), code file watching via `onCodeChanged` IPC. Tab bar at top. Both surfaces kept alive (terminal hidden when code active, not disposed). |
| `src/renderer/ContentPane.tsx` | Added tab bar. Added Cmd/Ctrl+Click link detection (markdown links, bare URLs, bare file paths) → routes via `handleLinkClick` → `openCode`/`openDoc`/`shellOpenExternal`. Git gutter: calls `file:git-diff` on file open and after auto-save, applies `deltaDecorations`. Shift-enter registered. Edit pins ephemeral tab. |
| `src/renderer/napkin-markdown.ts` | Added `detectLinePattern(line) → LinePattern` (indent, bullet, prefix, content). Added `registerShiftEnter(editor)`: detects `<indent>* //XX: ` pattern, continues on Shift+Enter, breaks out when content empty. |
| `src/main/main.ts` | Added `file:exists` IPC (async fs.access). Added `file:git-diff` IPC (runs `git ls-files` → `git diff --unified=0`, handles untracked files as all-added). Added code file watcher (second `ContentWatcher` instance, no echo suppression). Added `shell:open-external` IPC. |
| `src/main/preload.ts` | Exposed: `fileExists`, `fileGitDiff`, `onCodeChanged`, `codeWatch`, `shellOpenExternal`. |
| `src/renderer/index.tsx` | Added Cmd-W handler (closes active left tab). Updated `electronAPI` type declaration with new methods. |

## Decisions made

### 1. routeLink path resolution for bare paths (architect Flag 1)

Implemented the fallback approach. For bare paths (no `./`, `../`, `/` prefix):
- **Primary:** `dirname(sourceFile) + path`
- **Fallback:** `projectRoot + path` (returned as `fallbackPath` in the result)

The consumer (`ContentPane.handleResult`) calls `file:exists` on the primary path. If it doesn't exist, uses the fallback. This keeps `routeLink` pure (no I/O) while handling the ambiguity.

`extractProjectRoot` derives project root from the sourceFilePath by finding `/.nap/` and taking the parent.

### 2. .md with :line (architect Flag 2)

Extension wins. `changelog.md:15` routes to `openDoc`. The `:15` is stripped by `parseLinkHref` but not passed to `openDoc` (no line navigation in left pane). Matches architect decision.

### 3. Tab scaling (architect Flag 3)

One watcher per active surface (not all open tabs):
- Left pane: `contentWatcher.watch(activeFilePath)` — swaps on tab switch
- Right pane: `codeWatcher.watch(rightFilePath)` — swaps on tab switch

Monaco models stay alive while tab is open, disposed on tab close. The `upsertTab` helper reuses ephemeral slots. Per-nepic tab memory saves/restores tab arrays on nepic switch.

### 4. ContentFileWatcher — already extracted

The prompt asked to extract the inline watcher from `main.ts`. This was already done in 0100 as `content-watcher.ts` (uses `@parcel/watcher`). I reused the existing `ContentWatcher` class — created a second instance for right pane code files with `isPendingWrite: () => false` (read-only, no echo suppression).

### 5. Link detection in Monaco

Used Cmd/Ctrl+Click pattern (not Monaco's `registerLinkProvider`) for the click handling. Reason: Monaco's link provider + openerService has complex interaction with the editor's built-in link detection. The Cmd+Click approach gives full control over which regex patterns match and how clicks are routed. The content-link-provider module exports both a `registerContentLinkProvider` (for future use with Monaco's API) and `handleLinkClick` (for the current Cmd+Click approach).

### 6. Tab state architecture

Tabs are stored in the zustand store as flat arrays. Key functions:
- `upsertTab(tabs, path, type, ephemeral)` → finds existing, reuses ephemeral, or creates new
- `removeTab(tabs, tabId, activeId)` → removes and picks neighbor as next active
- `setActiveTerminal` auto-creates terminal tabs
- `openCode` / `openDoc` auto-create file tabs (ephemeral by default)

The active tab ID drives what renders. `activeFilePath` stays in sync with the active left tab for backward compatibility.

### 7. CSS injection for decorations

Git gutter and line highlight CSS are injected via `document.head.appendChild(style)` in the TerminalPane (for code editor decorations). The CSS classes use `!important` to override Monaco's default gutter styling.

## For the test engineer

### Pure functions ready for small tests

- `routeLink()` in `routing-rules.ts` — takes `LinkContext`, returns `LinkResult`. No I/O.
- `parseLinkHref()` — exported, parses `:line:col` and `#Lline` syntax.
- `parseGitDiff()` in `git-diff-parser.ts` — takes diff output string, returns `DiffHunk[]`.
- `detectLinePattern()` in `napkin-markdown.ts` — takes line string, returns `LinePattern`.
- `upsertTab()` / `removeTab()` — internal to store, test via store actions.

### Store actions for state tests

- `openCode({ path, line })` → sets `rightPaneMode: 'code'`, creates/reuses tab
- `openDoc(path)` → sets `activeFilePath`, creates/reuses tab
- `setActiveTerminal(id)` → sets `rightPaneMode: 'terminal'`, creates terminal tab
- `closeTab(pane, tabId)` → removes tab, picks next active
- `pinTab(pane, tabId)` → flips `ephemeral: false`
- `pinActiveEphemeral(pane)` → pins the active ephemeral tab

### IPC for medium tests

- `file:exists(path)` → boolean
- `file:git-diff(filePath)` → `DiffHunk[]`
- `code:changed` event → right pane updates
- `code:watch` → start/stop watching
- `shell:open-external` → opens URL in browser

### Test hooks

- `window.__monaco__` — Monaco instance (existing)
- `window.__napStore__` — store (existing)
- `data-testid="tab-bar"`, `data-testid="tab-{id}"`, `data-testid="code-editor"` — DOM test hooks
