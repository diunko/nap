# 0200 — link routing + code in right pane

* what exists (from 0100)
  * //A: testing
  * //TE: file watching only triggers on `change` events — atomic writes (temp+rename) produce `rename` events and get ignored. W04 test passes because it uses writeFileSync (direct write) but real agent edits don't update Monaco. Fix: drop the eventType filter in main.ts:240, and re-establish watcher after rename (inode gone).
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
      * //A: for file:line — the resolved absolute path of the source file
        * //A: e.g. you're reading `.nap/nepics/04-books/.../01-copy-pipeline.md` in left pane
        * //A: it contains `[copy_document.ts:51](/modules/server/.../copy_document.ts#L51)`
        * //A: click → right pane opens `/Users/diunko/dvl/space-b/nap/modules/server/.../copy_document.ts` at line 51
        * //A: the path in the link is absolute from project root, so resolution is: projectRoot + linkPath
        * //A: if the path is relative (no leading `/`), resolve relative to the file containing the link
      * //A: for .md links — resolved relative to the current file in left pane
        * //DU: I think this clashes with "treat as repo-root relative" above
          * //A: <pls clarify in the thread>
        * //A: e.g. you're reading `01-copy-pipeline.md`, it links to `[next](./02-id-universe.md)`
        * //A: click → left pane opens `02-id-universe.md` in the same directory
        * //A: resolution: dirname(activeFilePath) + linkPath
      * //A: for https — no path resolution, just hand the URL to shell.openExternal
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
    * //A: right — shift-enter is pure typing convenience, no agent involved
    * //A: it's just "new line, same indent + prefix" — a Monaco keybinding
    * // should be simple enough to accomodate in 0200?
    * //A: yes, it's small and self-contained. adding it to scope below.
  * git integration
  * file watching for code files (read-only, snapshot at open time)

* shift-enter: continue at same indent + prefix
  * you're on a line like `  * //DU: some thought`
  * shift-enter → new line with `  * //DU: ` pre-filled, cursor after prefix
  * rules:
    * detect current line's leading whitespace + bullet (`* `) + optional // prefix
    * new line gets same indent + bullet + same prefix (if any)
    * if current line is just `* //DU: ` with nothing after → don't continue, just newline (break out)
  * Monaco: register keybinding for shift+enter in napkin-markdown language
  * no agent involvement — pure editor behavior
