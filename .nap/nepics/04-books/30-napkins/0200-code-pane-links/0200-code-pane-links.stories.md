# 0200 — stories

## Story 1: Click a file:line link in a chapter

The person has `01-copy-pipeline.md` open in the left pane. The chapter contains `[copy_document.ts:51](/modules/server/frontend/private/actions/copy_document.ts#L51)`.

They click the link. The right pane switches from terminal to code view. `copy_document.ts` loads in Monaco with TypeScript syntax highlighting, read-only. Line 51 scrolls to center and flashes yellow, then fades.

The left pane is unchanged — still showing the chapter.

**Components:** Monaco link provider → routing-rules.routeLink() → store (rightPaneMode, rightFilePath, rightFileLine) → TerminalPane (code branch) → Monaco editor + revealLineInCenter + deltaDecorations.

## Story 2: Click a .md link to another chapter

The person is reading `01-copy-pipeline.md`. At the bottom, there's `[next: ID Universe](./02-id-universe.md)`.

They click it. The left pane replaces `01-copy-pipeline.md` with `02-id-universe.md`. An ephemeral tab appears (italic title "02-id-universe.md"). The previous chapter is gone from the tab bar (ephemeral reuse).

The right pane stays on whatever it was showing.

**Components:** Monaco link provider → routeLink() → store.openFile() → ContentPane loads new file.

## Story 3: Pin a tab by double-clicking

The person single-clicks through three chapters: 01, 02, 03. Each replaces the ephemeral tab. Only the latest is visible.

They go back to 01 and double-click the link. The tab becomes pinned (title goes from italic to normal). Now they click 02 — a new ephemeral tab appears next to the pinned 01. Both are visible. They can flip between them.

**Components:** Tab bar → double-click handler → `tab.ephemeral = false` → tab bar re-renders with both tabs.

## Story 4: Terminal and code tabs coexist in right pane

The person has an agent running. They click a file:line link in the left pane — an ephemeral code tab appears in the right pane. The terminal tab is still there (pinned, can't close).

They click the terminal tab — right pane shows the terminal. They click the code tab — right pane shows the code file. They click another file:line link — the ephemeral code tab updates to the new file.

**Components:** Right pane tab bar → rightPaneMode switches → Terminal or Monaco renders based on active tab type.

## Story 5: Git gutter shows uncommitted changes

The person opens a napkin they've been editing. Green bars appear in the left gutter next to lines they added since the last commit. Blue bars next to lines they modified. A small red triangle between lines 12 and 13 where they deleted a line.

They type a new bullet. After auto-save (1s), the gutter updates — the new line gets a green bar.

**Components:** ContentPane → file:git-diff IPC → main process runs `git diff` → parse hunks → deltaDecorations with gutter CSS classes.

## Story 6: Shift-enter continues a comment

The person is on a line: `  * //DU: I think the copy path is wrong`. They press Shift+Enter.

A new line appears: `  * //DU: ` with the cursor after the space. They type their continuation.

They press Shift+Enter again on an empty prefix line (`  * //DU: ` with nothing after). This time, just a plain newline — no prefix. They've broken out of the comment.

**Components:** Monaco keybinding (Shift+Enter) → detect indent + bullet + prefix → insert line with same pattern → break-out if empty.

## Story 7: Code file updates while viewing

The person has `model.ts` open in the right pane (from clicking a link). An agent is editing that file in its terminal.

The agent saves. Within ~200ms, the right pane updates — the new code appears. Scroll position preserved. The person doesn't have to re-click the link.

**Components:** Main process ContentFileWatcher → file:changed IPC → right pane Monaco model update.

## Story 8: External link opens browser

The person is reading a chapter that contains `[Coda docs](https://coda.io/developers)`. They click it. Their default browser opens the URL. Both panes stay where they are.

**Components:** Monaco link provider → routeLink() → action: openExternal → shell.openExternal.

## Story 9: Nepic switch preserves tabs

The person has two pinned tabs in the left pane (chapter 1 and chapter 3) and a code tab in the right. They switch to a different nepic via the gutter.

They switch back. The two pinned tabs are restored. The active tab and scroll positions are where they left them.

**Components:** store.applySnapshot → per-nepic tab memory save/restore.

## Story 10: Cmd-W closes active tab

The person has three tabs in the left pane. They press Cmd-W. The active tab closes. The next tab becomes active. If it was the last tab, the pane shows placeholder.

**Components:** Keyboard handler → close active tab → dispose Monaco model → update tab array.
