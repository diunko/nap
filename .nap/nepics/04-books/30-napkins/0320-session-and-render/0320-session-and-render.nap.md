# 0320 — session persistence + rendered mode fixes

* session persistence on quit/start
  * today: ui-state.json saves activeNepicId, theme, debugPanel state
  * missing: which card is focused, which files are open
  * add to ui-state.json:
    * focusedCardSlug
    * activeTerminalId (which agent terminal was showing)
    * leftTabs (array of open file paths + ephemeral flag)
      * // what happens if some files are absent?
      * //A: on restore, try to read each file
        * exists → open tab, load content
        * missing → keep tab but show "file not found" placeholder
          * tab stays in the bar, grayed out
          * file watcher on parent dir — if file reappears, auto-load
          * this handles branch switches: you switch branch, files vanish, switch back, they return
    * activeLeftTabId
    * rightTabs (open code files, not terminal — terminal restores from activeTerminalId)
      * // absent files?
      * // i think main thing to think aobut:
        * // branch might have changed; 
        * // if the underlying files get back, they should re-open nicely
        * // even without closing Nap.app
      * //A: same approach — ghost tabs for missing files
        * grayed out tab, "file not found" in editor area
        * file watcher brings them back when they reappear
        * no crash, no silent discard — the tab remembers the path
      * //A: for the "without closing Nap.app" case:
        * existing content file watcher already fires on changes in watched dirs
        * just need to also handle the "file deleted" event (show ghost) and "file created" event (reload)
        * ContentFileWatcher already accepts all event types (BUG 3 fix from 0100)
    * activeRightTabId
    * leftPaneRenderMode
  * on quit: save from store → ui-state.json
  * on start: restore from ui-state.json → store
    * tabs: re-open files (read content, create Monaco models)
    * terminal: restore activeTerminalId (agent resume already handles pty)

* rendered mode: doesn't refresh on tab switch
  * bug: switch to a different .nap file while rendered mode is on → still shows previous file's HTML
  * cause: rendered HTML is generated when toggleRenderMode fires, not when activeFilePath changes
  * fix: re-render HTML whenever activeFilePath changes AND mode is 'rendered'
    * watch activeFilePath in the effect that manages rendered content
    * also re-render on external file change (agent edits should show up in rendered view too)

* rendered mode: scroll sync on mode toggle
  * bug: Cmd+click in rendered → edit at line → Cmd+J back to rendered → scroll resets to top
  * want: rendered view scrolls to match where the cursor is in the editor
  * approach:
    * on Cmd+J (edit → rendered):
      * get current editor cursor line
      * find rendered element with closest `data-source-line`
      * scrollIntoView that element
    * on Cmd+J (rendered → edit):
      * already works (Cmd+click sets cursor position)
      * but plain Cmd+J without Cmd+click: find topmost visible `data-source-line` in rendered view
      * set editor cursor to that line, revealLineInCenter
    * result: toggle back and forth, you stay in the same place
