# 0200 — spec

## What

Add code display in the right pane, link routing from the left pane, vscode-style ephemeral tabs in both panes, git gutter decorations, shift-enter continuation, and file watching for code files.

## Why

The left pane (from 0100) displays napkins and chapters, but links to source code have nowhere to go. The minibook chapters are full of `file:line` references. This napkin makes them clickable — click a reference, see the code. Also adds tabs so you can flip between documents without losing your place, and git gutter so you can see what changed at a glance.

## Constraints

### Link provider (left pane)

- Register a Monaco link provider on the left pane editor.
- Classification by extension and pattern:
  - **Code links** (non-`.md` extension, with optional `:line:col` or `#Lline`): route to right pane, Monaco, read-only.
  - **Markdown links** (`.md` extension): route to left pane, replaces current file (or opens ephemeral tab).
  - **External links** (`https://`, `http://`): open in default browser via `shell.openExternal`.
- Path resolution:
  - Code links with leading `/` → resolve relative to project root (parent of `.nap/`).
  - Code links without leading `/` → resolve relative to `dirname(activeFilePath)`.
  - Markdown links → always resolve relative to `dirname(activeFilePath)`.
- Reuse regex patterns from `src/renderer/file-link-provider.ts` where they fit. That file's `FILE_PATH_REGEX` and `extractPathAndLocation` are a good starting point.
- Must handle both bare paths (`src/main/model.ts:42`) and markdown-style links (`[text](path#L42)`).

### Right pane — mixed surface

- The right pane shows either terminal (xterm) or code (Monaco), one at a time.
- New store state:
  - `rightPaneMode: 'terminal' | 'code'`
  - `rightFilePath: string | null`
  - `rightFileLine: number | null`
- Agent dot click → `rightPaneMode: 'terminal'`, existing `activeTerminalId` behavior.
- File:line link click → `rightPaneMode: 'code'`, `rightFilePath` set, `rightFileLine` set.
- Code display config: read-only, auto-detect language from file extension, minimap off, dark theme matching app, line numbers on (code, not prose).

### Line highlight on navigation

- When a file:line link opens code in the right pane, scroll to that line and highlight it.
- `editor.revealLineInCenter(line)` to scroll.
- `editor.deltaDecorations` with a yellow background class that fades to transparent over ~1.5s.
- CSS transition on the decoration class. Remove the decoration after the animation.

### Tabs (both panes)

- Vscode-style ephemeral tabs in both panes.
- **Ephemeral tab**: created by single-click (nav or link). Italic title. At most one per pane, always rightmost. Reused by the next single-click.
- **Pinned tab**: created by double-click, or by editing content in an ephemeral tab. Normal title. Sticks until explicitly closed.
- **Terminal tab**: always pinned, special type. Cannot be closed while agent is running. Shows agent name as title.
- Tab bar along top of each pane. Tab shows filename only. Tooltip shows full path. Close button on hover. Cmd-W closes active tab. Middle-click closes.
- Closing last tab → pane shows placeholder.
- Tab state per tab: `{ id, path, ephemeral: boolean, scrollPos?, cursorPos? }`.
- Monaco models stay alive for open tabs. Disposed on tab close.
- Store: `leftTabs: Tab[]`, `activeLeftTabId: string`, `rightTabs: Tab[]`, `activeRightTabId: string`.
- Per-nepic memory: save/restore tab arrays on nepic switch.

### Git gutter decorations (left pane)

- On file open and after auto-save: request git diff from main process.
- New IPC: `file:git-diff(filePath)` → returns `Array<{ type: 'add' | 'modify' | 'delete', startLine: number, endLine: number }>`.
- Main process implementation: run `git diff --unified=0 HEAD -- <filePath>`, parse hunk headers (`@@ -a,b +c,d @@`), classify each hunk.
- For untracked files: all lines are "added".
- Renderer applies Monaco `deltaDecorations`:
  - Added lines → green bar in gutter (CSS class with green left border).
  - Modified lines → blue bar in gutter.
  - Deleted lines → red triangle marker between lines.
- Re-run diff after auto-save completes (piggyback on existing 1s debounce → after write succeeds, request fresh diff).

### File watching for code files (right pane)

- When a code file is open in the right pane, watch it for changes.
- Same `fs.watch` pattern as left pane content watcher.
- No write-echo suppression needed (right pane is read-only).
- On external change → re-read file, update Monaco model, preserve scroll position.
- Accept all fs event types (no filtering — learned from BUG 3 atomic writes fix).
- Extract content file watcher from inline code in `main.ts` into a `ContentFileWatcher` module with injectable filesystem. Both left and right pane watchers use it.

### Shift-enter continuation

- Register Monaco keybinding: `Shift+Enter` in `napkin-markdown` language.
- On trigger: read current line content, detect pattern: `<indent><bullet><prefix>`.
  - Indent: leading whitespace.
  - Bullet: `* ` (if present).
  - Prefix: `//XX: ` where XX is any role tag (if present).
- Insert new line with same indent + bullet + prefix, cursor after prefix.
- Break-out: if current line is ONLY the indent + bullet + prefix with no content after, just insert a plain newline (no continuation). This prevents infinite prefix loops.

### Routing rules update

- Extend `routing-rules.ts` with a new function for link routing (separate from sidebar click routing).
- `routeLink(ctx: LinkContext): LinkResult` where:
  - `LinkContext`: `{ href: string, sourceFilePath: string }`.
  - `LinkResult`: `{ action: 'openCode', path: string, line?: number } | { action: 'openDoc', path: string } | { action: 'openExternal', url: string }`.
- Keep sidebar click routing (`route()`) unchanged.

## Hard parts

- **Link detection regex**: must handle both bare `file.ts:42` paths and `[text](path#L42)` markdown links in the same provider. The markdown link syntax nests — `[text](url)` where url can contain `/`, `:`, `#`. Need to avoid matching partial URLs.
- **Tab state management**: two independent tab arrays, each with ephemeral/pinned semantics, per-nepic memory, Monaco model lifecycle tied to tab lifecycle. This is the most complex state change.
- **Git diff parsing**: hunk headers are `@@ -a,b +c,d @@`. Need to handle edge cases: new file (no `-` side), deleted file, binary files (skip). The parser should be a standalone pure function for testability.
- **ContentFileWatcher extraction**: currently inline in `main.ts`. Extracting into a module with injectable fs means refactoring existing 0100 code — both left and right watchers should use the new module.
