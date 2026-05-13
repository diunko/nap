You're the fullstack engineer for the 0200-code-pane-links feature. Read your role in `.nap/00-org/40-roles/fullstack-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0200-code-pane-links/`):
1. `0200-code-pane-links.nap.md` — the napkin (includes design discussion threads)
2. `0200-code-pane-links.spec.md` — the spec (your primary reference)
3. `0200-code-pane-links.stories.md` — user journeys
4. `0200-code-pane-links.test.md` — test architecture (shape your code so these tests are possible)

Read what the test architect flagged (in their response.md):
`.nap/nepics/04-books/30-napkins/0200-code-pane-links/agents/001-test-arch-links/response.md`

**Architect decisions on the flags:**
- **Flag 1 (bare path resolution):** Use fallback. Try `dirname(sourceFile) + path` first. If file doesn't exist, try `projectRoot + path`. This handles both `./relative.ts` and `src/main/model.ts` without requiring leading `/`. The existence check happens via IPC (`file:exists`) — don't check synchronously in the renderer.
- **Flag 2 (.md with :line):** Extension wins. `changelog.md:15` routes to left pane as a doc. Strip the `:15`, open the .md. Don't add line navigation to left pane — it's prose, not code.
- **Flag 3 (tab scaling):** One watcher per active tab only (not all open tabs). Use a Map keyed by file path for per-tab debounce timers and echo suppression state.

Read the 0100 test-eng scaling notes — important context for tabs:
`.nap/nepics/04-books/30-napkins/0100-content-pane/agents/003-test-eng-content/response.md` (section: "Scaling notes")

Read the existing 0100 code you're building on:
- `packages/v3/src/renderer/routing-rules.ts` — extend with `routeLink()`
- `packages/v3/src/renderer/ContentPane.tsx` — add link provider, git gutter
- `packages/v3/src/renderer/TerminalPane.tsx` — becomes mixed surface
- `packages/v3/src/renderer/store.ts` — add tab state, right pane mode
- `packages/v3/src/renderer/napkin-markdown.ts` — shift-enter keybinding
- `packages/v3/src/renderer/file-link-provider.ts` — reuse regex patterns
- `packages/v3/src/renderer/index.tsx` — keyboard handlers (Cmd-W)
- `packages/v3/src/main/main.ts` — file content IPC, watcher
- `packages/v3/src/main/preload.ts` — exposed API
- `packages/v3/src/shared/dot-style.ts` — ROLE_COLORS for reference

Explore the codebase broadly before building. Understand the existing patterns.

## What to build

### 1. Link routing (`src/renderer/routing-rules.ts`)
- Add `routeLink(ctx: LinkContext): LinkResult` — separate from sidebar `route()`.
- Classification by extension: `.md` → openDoc, everything else → openCode, `http(s)://` → openExternal.
- Path resolution with fallback for code paths (try dirname first, then project root).
- New IPC: `file:exists(path)` → boolean. Used by fallback resolution.

### 2. Monaco link provider (`src/renderer/content-link-provider.ts`)
- New file. Register on left pane Monaco editor.
- Detect bare `file.ts:42` paths, markdown `[text](path#L42)` links, and `https://` URLs.
- Classify using `routeLink()`. On activate: dispatch to store (openCode/openDoc) or shell.openExternal.
- Reuse `FILE_PATH_REGEX` and `extractPathAndLocation` from `file-link-provider.ts`.

### 3. Right pane mixed surface (`src/renderer/TerminalPane.tsx`)
- Right pane shows terminal OR Monaco code editor based on `rightPaneMode`.
- New Monaco instance for code: read-only, auto-detect language, line numbers on, dark theme.
- Line highlight: `revealLineInCenter()` + deltaDecorations with CSS fade animation (~1.5s).
- ResizeObserver for the code editor (same pattern as ContentPane).

### 4. Tabs (`src/renderer/TabBar.tsx` + store changes)
- New `TabBar` component used by both panes.
- Tab types: `{ id, path, type: 'file' | 'terminal', ephemeral: boolean, scrollPos?, cursorPos? }`.
- Ephemeral semantics: at most one per pane, rightmost, italic title, reused on next single-click.
- Pin: double-click tab header, or edit content in left pane ephemeral tab.
- Terminal tab: always pinned, title = agent name, can't close while agent running.
- Store: `leftTabs`, `activeLeftTabId`, `rightTabs`, `activeRightTabId`.
- Save/restore per-nepic.
- Cmd-W closes active tab. Middle-click closes. Close button on hover.
- Monaco models: alive while tab open, disposed on close.

### 5. Git gutter (`src/renderer/git-gutter.ts` + IPC)
- New IPC: `file:git-diff(filePath)` → array of `{ type, startLine, endLine }`.
- Main process: run `git diff --unified=0 HEAD -- <file>`, parse hunk headers. Pure function `parseGitDiff(output: string)` in a separate module for testability.
- Untracked files: all lines "added".
- Renderer: apply deltaDecorations with gutter CSS classes after file open and after auto-save.
- CSS: green left-border (added), blue left-border (modified), red triangle (deleted).

### 6. Shift-enter (`src/renderer/napkin-markdown.ts` or nearby)
- Monaco keybinding: `Shift+Enter` when language is `napkin-markdown`.
- Detect current line pattern: `<indent>* //XX: ` or `<indent>* ` or `<indent>// `.
- Insert new line with same pattern, cursor after prefix.
- Break-out: if no content after prefix, just plain newline.

### 7. ContentFileWatcher extraction (`src/main/content-file-watcher.ts`)
- Extract the inline watcher from `main.ts` into a module.
- Injectable filesystem (same pattern as `FileSystem` interface).
- Both left and right pane watchers use this module.
- Accept all fs event types (no filtering — BUG 3 fix from 0100).

### 8. Code file watching
- Right pane watches the active code file for changes.
- Read-only → no echo suppression.
- Uses ContentFileWatcher module.

## Build order suggestion

1. ContentFileWatcher extraction (refactor, unblocks 7+8)
2. `routeLink()` in routing-rules (pure function, testable immediately)
3. Git diff parser (pure function, testable immediately)
4. Store changes (tab state, right pane mode)
5. Tab bar component
6. Content link provider
7. Right pane mixed surface + code editor + line highlight
8. Git gutter decorations
9. Shift-enter keybinding
10. Code file watching

Run `tsc --noEmit` in `packages/v3/` before you're done. Zero type errors.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0200-code-pane-links/agents/002-fs-eng-links/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
