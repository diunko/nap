# 0320 — spec

## What

Three things: persist session state across quit/start, fix rendered mode refresh on tab switch, and sync scroll position when toggling between edit and rendered mode.

## 1. Session persistence

### What to save

Extend `ui-state.json` with:

```json
{
  "activeNepicId": "04-books",
  "theme": "dark",
  "focusedCardSlug": "0300-qol-tweaks",
  "activeTerminalId": "uuid-of-agent",
  "leftPaneRenderMode": "edit",
  "leftTabs": [
    { "path": "/abs/path/to/file.nap.md", "ephemeral": false },
    { "path": "/abs/path/to/spec.md", "ephemeral": true }
  ],
  "activeLeftTabId": "tab-id",
  "rightTabs": [
    { "path": "/abs/path/to/code.ts", "ephemeral": true }
  ],
  "activeRightTabId": "tab-id"
}
```

Terminal tab is NOT saved in rightTabs — it's reconstructed from `activeTerminalId` (the sentinel `__terminal__` tab is always created on startup).

### When to save

On app quit. Use the existing `save-ui-state` IPC path — extend the payload with the new fields.

### When to restore

On app start, in `loadPersistedUiState()`. After model loads (so agent data is available for terminal restore).

### Restoring tabs — absent file handling

For each saved tab path:
1. Try `file:read`. If content returned → open tab, load Monaco model.
2. If file missing → create **ghost tab**: tab stays in bar, grayed out title, editor area shows "file not found" placeholder.
3. Watch parent directory of ghost tab. If file appears (branch switch, agent creates it) → auto-reload, ghost becomes normal tab.

Ghost tab state: `{ ...tab, ghost: true }`. TabBar renders ghost tabs with `opacity: 0.4`, italic title.

### Restoring terminal

`activeTerminalId` is a `cc_session_uuid`. On restore:
- Find agent with that UUID in model. If found → `setActiveTerminal(uuid)`. The pty resume system handles the rest.
- If not found (agent deleted) → ignore, terminal slot shows "no agent selected".

### Restoring focused card

`focusedCardSlug` is a napkin slug or architect UUID. On restore:
- If slug matches a napkin or architect in model → `expandCard(slug)`.
- If not found → ignore, no card focused.

## 2. Rendered mode refresh on tab switch

### Bug

Switch tabs while rendered mode is active → rendered HTML shows previous file's content.

### Root cause

The rendered HTML is generated when `toggleRenderMode()` fires. Switching tabs changes `activeFilePath` but doesn't re-trigger rendering.

### Fix

In ContentPane, the effect that manages rendered content must depend on BOTH `leftPaneRenderMode` AND `activeFilePath` (or the active tab's Monaco model content). When either changes and mode is `'rendered'`, re-parse markdown and re-render HTML.

Also re-render on external file change: the `onFileChanged` callback should re-render if mode is `'rendered'`.

## 3. Rendered mode scroll sync

### The problem

Cmd+J from edit to rendered → scroll resets to top. User loses their place.

### Fix: edit → rendered (Cmd+J)

1. Get cursor line from editor.
2. Compute cursor's screen y: `editor.getTopForLineNumber(cursorLine) - editor.getScrollTop()`.
3. If cursor y is negative or > viewport height (cursor off-screen), fallback: use `editor.getVisibleRanges()[0].startLineNumber`, screen y = 0.
4. Find rendered element with closest `data-source-line` to the anchor line.
5. Set rendered div `scrollTop = element.offsetTop - anchorScreenY`.

Result: the content at the cursor (or viewport top) appears at the same vertical position in rendered view.

### Fix: rendered → edit (Cmd+J)

1. Find the topmost visible `data-source-line` element in the rendered view (first element where `element.offsetTop >= renderedDiv.scrollTop`).
2. Read its `data-source-line` value.
3. Set editor cursor to that line: `editor.setPosition({ lineNumber, column: 1 })`.
4. `editor.revealLineInCenter(lineNumber)`.

Result: toggle back and forth, you stay in the same place.

## Hard parts

- **Ghost tab file watcher**: watching a parent directory for a specific file to reappear. The existing ContentFileWatcher watches a single file. Need to either watch the parent dir and filter by filename, or poll periodically. Dir watch + filter is cleaner.
- **Scroll sync accuracy**: editor line height and rendered line height differ (Monaco uses fixed-height lines, rendered HTML has variable-height paragraphs/tables). The `data-source-line` mapping is block-level, not line-level. The match is approximate — "same area" not "same pixel." This is acceptable per the napkin ("small shifts are ok").
- **Tab restore ordering**: tabs must restore in saved order. Ghost tabs interspersed with live tabs. The `leftTabs` array preserves order — iterate in order, create each tab (live or ghost).
