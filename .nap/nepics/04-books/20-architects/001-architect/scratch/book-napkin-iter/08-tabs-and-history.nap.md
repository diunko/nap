# tabs and history

* each pane has its own tabs
  * content pane tabs: .nap files (chapters, napkins, specs)
  * code pane tabs: repo files (source code)
  * independent — closing a content tab doesn't affect code tabs

* tab behavior
  * click in nav tree → opens in appropriate pane
    * .md/.nap.md → content pane
      * // depends on which .md: if in .nap -> in left-content
      * // if in main -> in right-content, same for code
    * .ts/.tsx/.json etc → code pane
  * click file:line link in content → opens in code pane
  * click chapter link in content → opens in content pane
  * re-clicking an already-open file → switches to that tab
    * // might as well use ephemeral tabs pattern from vscode
    * // while you're clicking around, it reuses latest open tab
    * // once you double-click the tab, it sticks

* tab style
  * filename only (not full path)
  * tooltip shows full path
  * modified indicator (dot) if unsaved changes
  * close button on hover
  * middle-click to close (standard)

* history (per pane)
  * simple back/forward stack per pane
  * back = previous tab + scroll position in that tab
  * forward = undo a back
  * keybinding: cmd-[ / cmd-] (per pane, whichever has focus)
  * start simple — just tab switching history, not scroll positions
    * add scroll memory if it feels needed
      * // yes, this is very important to cursor position

* cross-pane coordination
  * content and code are independent by default
  * the only link: file:line click in content → opens in code
  * no auto-sync (switching content tab doesn't change code tab)
  * code tab stays on whatever was last opened there
  * this matches the reading workflow: you flip through chapters, code stays on the file you're studying

* session persistence
  * save open tabs + scroll positions on quit
  * restore on next launch
  * per-project (each .nap repo gets its own session)
