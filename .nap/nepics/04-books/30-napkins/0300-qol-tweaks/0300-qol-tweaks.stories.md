# 0300 — stories

## Story 1: Tab key inserts 2 spaces

The person opens a new empty .nap.md file. They press Tab. The cursor moves 2 spaces, not 4. They press Shift+Tab — it unindents by 2. Matches the 2-space indentation of napkin format.

**Components:** ContentPane editor options (`tabSize: 2`, `insertSpaces: true`).

## Story 2: Terminal file link opens in-app

An agent in the terminal outputs `src/renderer/store.ts:42`. The person clicks it. Instead of opening in VS Code (OS editor), the right pane shows `store.ts` at line 42 in the code view. The terminal stays accessible via the terminal tab.

An agent outputs `.nap/nepics/04-books/30-napkins/0100.nap.md`. The person clicks it. The left pane opens the napkin file.

**Components:** Terminal file-link-provider `onOpen` callback → `routeLink()` → `store.openCode()` or `store.openDoc()`.

## Story 3: Cycle themes with Cmd+T

The person is in dark mode, reading a chapter. They press Cmd+T. The entire window switches to light-cream — sidebar background lightens, tab bars lighten, Monaco editor background becomes warm off-white, text becomes dark. Role comment colors adjust for contrast (still recognizable as the same hues).

They press Cmd+T again → light-gray. Again → light-sepia. Again → light-blue. Again → dark. Full rotation.

They close the app. Next launch, it opens in whatever theme they last used.

**Components:** themes.ts → store.cycleTheme() → monaco.editor.setTheme() + CSS variable updates → ui-state.json persistence.

## Story 4: Terminal tab is a single viewport

The person has three agents running. The right pane shows one terminal tab (always first) and one code tab. The terminal tab title shows "001-architect".

They click agent "002-fs-eng" in the sidebar's [terminal] entry. The terminal tab title changes to "002-fs-eng". The terminal content switches. No new tab appears. The code tab next to it is unaffected.

They click agent "003-test-eng". Same behavior — title and content swap. Still one terminal tab.

**Components:** store.setActiveTerminal() → updates terminal slot title + agentId. TerminalPane renders based on slot.

## Story 5: Git gutter refreshes reliably

The person opens the app. A napkin file loads in the left pane. Green gutter bars appear next to uncommitted lines — immediately, not after a save.

An agent edits the file externally. The content updates (file watching). Within ~500ms, the git gutter updates too — new lines from the agent get green bars.

The person switches to another tab, then switches back. The gutter decorations are still there (re-requested on focus).

**Components:** file:git-diff IPC on model update + on focus → deltaDecorations.

## Story 6: Toggle rendered mode

The person is reading a chapter with tables and headers. In edit mode (Monaco), the tables are raw markdown pipes. They press Cmd+Shift+H.

The left pane switches to rendered view. Tables appear as proper HTML tables with borders and alignment. Headers are large and bold. Links are underlined and colored. `//A:` comments appear as blue-highlighted blocks. `//DU:` comments as green blocks. The text is styled with the current theme.

They click a `[file.ts:42](path)` link in rendered view — the right pane opens the code file, same as edit mode.

They want to add a comment. They Cmd+click on a paragraph. The left pane switches back to edit mode, cursor on that paragraph's source line. They type their comment.

**Components:** Cmd+Shift+H → store.toggleRenderMode() → ContentPane renders HTML div or Monaco. markdown-it parse + source line mapping. Cmd+click → setPosition + focus.

## Story 7: Bare // comments match //DU: color

The person types `// this is my thought` (no DU: prefix). The comment appears in green — same color as `//DU: my thought`. Previously it was muted gray-blue, visually distinct from their prefixed comments. Now bare `//` and `//DU:` look the same, since both are the user's voice.

**Components:** Theme token color: `comment` foreground = `comment.user` foreground.
