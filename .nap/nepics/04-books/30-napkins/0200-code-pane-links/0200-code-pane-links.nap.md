# 0200 — link routing + code in right pane

* what exists (from 0100)
  * left pane: Monaco with napkin-markdown, ephemeral, file watching, auto-save
  * right pane: terminal only (TerminalPane wraps Terminal)
  * routing rules: agent → right/terminal, .nap/ file → left/monaco, fallback → right
  * store: activeFilePath (left), activeTerminalId (right), independent

* what this adds
  * Monaco in right pane for source code (alongside terminal)
  * link provider in left pane that classifies and routes clicks
  * right pane becomes mixed: terminal OR code, still ephemeral

* link classification in left pane (Monaco)
  * three link types, three destinations
    * file:line reference → right pane, Monaco (code, read-only)
      * patterns: `path/to/file.ts:42`, `path/to/file.ts:42:17`, `/absolute/path:123`
      * also markdown links: `[text](path/to/file.ts#L42)`
    * .md relative link → left pane, replaces current file
      * patterns: `[text](./02-id-universe.md)`, `[text](../specs/foo.spec.md)`
    * // what exactly is open (which path) in each of these cases? 
      * //A: <pls answer here inline in the thread overriding this line>
    * https:// or http:// → default browser
      * patterns: `[text](https://...)`, bare `https://...`
  * implemented as Monaco link provider (registerLinkProvider)
  * reuse regex patterns from existing file-link-provider.ts where possible

* right pane changes
  * TerminalPane becomes a mixed surface: terminal OR code editor
  * new store state: `rightPaneMode: 'terminal' | 'code'` + `rightFilePath: string | null` + `rightFileLine: number | null`
  * clicking agent dot → right pane shows terminal (rightPaneMode: 'terminal')
  * clicking file:line link in left → right pane shows code (rightPaneMode: 'code')
  * code display: Monaco, read-only, auto-detect language from extension, line highlight on navigation
  * ephemeral — one thing at a time, link click replaces previous code view

* routing rules update
  * add to routing-rules.ts:
    * link from left pane with file:line → right pane, code
    * link from left pane with .md → left pane, monaco (self-navigation)
    * link from left pane with https → external browser
  * path resolution: two roots
    * .nap/ files resolved relative to .nap/ directory
    * code files resolved relative to project root (parent of .nap/)

* line highlight on navigation
  * when file:line link opens code → scroll to line, highlight it
  * brief flash/fade effect (yellow background → transparent, ~1.5s)
  * Monaco: editor.revealLineInCenter() + deltaDecorations for highlight

* not in scope
  * tabs in either pane
  * // agent interaction (cmd-enter, shift-enter)
    * // shift-enter is not an agent interaction, right?
    * // should be simple enough to accomodate in 0200?
  * git integration
  * file watching for code files (read-only, snapshot at open time)

* // wishlist
  * // 1) shift+enter in markdown in left pane opens bullet next to current 
    * // with the right indent and prefix on the following line
