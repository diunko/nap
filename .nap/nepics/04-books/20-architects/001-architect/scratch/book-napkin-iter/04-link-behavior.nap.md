# link behavior

* three link types, three destinations
  * // what about sources? is it equally for left and rigth?

* file:line links → code pane (right)
  * patterns
    * `modules/browser/apps/host/app_host.ts:156`
    * `[description](path/to/file.ts#L42)`
    * `/absolute/path/to/file:123`
  * click → open file in code pane, scroll to line, highlight
  * if file already open in a tab → switch to it, scroll
  * if not → new tab
  * content pane stays where it is

* chapter/doc links → content pane (middle)
  * patterns
    * `[chapter title](./02-id-universe.md)`
    * relative .md links within .nap
  * click → open in content pane as new tab
  * code pane stays where it is
  * back button returns to previous chapter

* external links → browser
  * patterns
    * `https://...`
    * `http://...`
  * click → open in default browser
  * both panes stay where they are

* link detection
  * monaco link provider (registerLinkProvider)
  * custom provider that classifies links into the three types
  * returns different commands for each type
  * link styling: all look clickable (underline + color)
    * maybe: file links blue, doc links green, external links gray?
    * or just all one color — don't over-design

* edge cases
  * file doesn't exist → show toast/inline error, don't crash
  * line number out of range → open file, scroll to end
  * ambiguous path → try relative to repo root first, then .nap root
