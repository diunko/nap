# 0320 — stories

## Story 1: Session restored on relaunch

The person has two pinned tabs (a napkin and a spec), the architect card focused, and an agent terminal showing. They quit the app.

They relaunch. The two tabs reappear in the left pane. The architect card is focused in the sidebar. The terminal shows the same agent. They're exactly where they left off.

**Components:** store → save-ui-state IPC (quit) → ui-state.json → loadPersistedUiState (start) → restore tabs, card, terminal.

## Story 2: Ghost tab for missing file

The person has three tabs open. They switch git branches — one of the files doesn't exist on the new branch. That tab grays out, editor shows "file not found". The other two tabs are fine.

They switch back to the original branch. The ghost tab detects the file reappearing and loads it. Green gutter shows, content is there. No manual action needed.

**Components:** Tab restore → file:read fails → ghost tab. Dir watcher → file appears → auto-reload.

## Story 3: Rendered mode updates on tab switch

The person has rendered mode on (Cmd+J). They're reading a chapter as rendered HTML. They click another chapter in the sidebar. The rendered view updates to show the new chapter — not the old one.

An agent edits the chapter. The rendered view updates live.

**Components:** ContentPane effect depends on activeFilePath + renderMode. Re-render on change.

## Story 4: Scroll sync edit → rendered

The person is editing line 85 of a napkin. They press Cmd+J. The rendered view appears with that same section visible at the same vertical position — not scrolled to the top.

**Components:** Get cursor screen y → find rendered data-source-line element → set scrollTop to match y.

## Story 5: Scroll sync rendered → edit

The person is reading a rendered chapter, scrolled to a section about "state management". They press Cmd+J to edit. The editor opens with the cursor at that section's source line, visible in the center of the viewport.

**Components:** Find topmost visible data-source-line → set editor position → revealLineInCenter.

## Story 6: Scroll sync with cursor off-screen

The person scrolled far past their cursor position in the editor. They press Cmd+J. The rendered view aligns to the visible viewport top — not the invisible cursor position.

**Components:** Detect cursor off-screen → fallback to getVisibleRanges()[0].startLineNumber → screen y = 0.
