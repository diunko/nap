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
      * //A: for file:line — the resolved absolute path of the source file
        * //A: e.g. you're reading `.nap/nepics/04-books/.../01-copy-pipeline.md` in left pane
        * //A: it contains `[copy_document.ts:51](/modules/server/.../copy_document.ts#L51)`
        * //A: click → right pane opens `/Users/diunko/dvl/space-b/nap/modules/server/.../copy_document.ts` at line 51
        * //A: the path in the link is absolute from project root, so resolution is: projectRoot + linkPath
        * //A: if the path is relative (no leading `/`), resolve relative to the file containing the link
      * //A: for .md links — resolved relative to the current file in left pane
        * //DU: I think this clashes with "treat as repo-root relative" above
          * //A: you're right, it's two different rules for two different link types. let me clean it up:
          * //A: rule 1 — links to CODE files (`.ts`, `.tsx`, `.json`, non-.md): leading `/` means project-root-relative. no leading `/` means relative to the file containing the link. both end up in the right pane.
          * //A: rule 2 — links to .md files: ALWAYS relative to the file containing the link. `./02-foo.md` = same dir. `../bar.md` = parent dir. these stay in the left pane.
          * //A: the distinction is by extension, not by `/` prefix. `.md` → left, everything else → right.
          * //A: no clash — different link types, different resolution, different destination pane.
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

* git gutter decorations (left pane)
  * green bar in gutter = added lines (not in last commit)
  * blue bar = modified lines
  * red triangle = deleted lines (between two existing lines)
  * on file open: run `git diff` in main process → parse hunks → apply decorations
  * on auto-save: re-run diff (piggyback on existing 1s debounce)
  * new IPC: `file:git-diff` → returns list of `{ type: 'add'|'modify'|'delete', startLine, endLine }`
  * Monaco: deltaDecorations with gutter CSS classes

* file watching for code files (right pane)
  * same fs.watch pattern as left pane
  * right pane code is read-only → no write-echo suppression needed
  * on external change → re-read file, update Monaco model, preserve scroll position

* not in scope
  * tabs in either pane
    * //A: on tabs — here's my thinking:
    * //A: LEFT pane: tabs feel useful here. you're reading chapter 1, click a link to chapter 2, want to flip back. without tabs, chapter 1 is gone. this is the reading workflow — you need history.
    * //A: RIGHT pane: tabs feel wrong. the right pane is reference material — whatever the left pane is pointing at. terminal OR code, one at a time. if you click a new file:line link, the old code view is stale context. you don't flip back to it — you flip to a new reference.
    * //A: proposal: add tabs to left pane in 0200. right pane stays ephemeral. this matches how you'd read a book with footnotes — you keep your place in the book (left tabs), but the footnote/reference view (right) just shows the latest thing.
    * //A: the tab model: vscode-style ephemeral tabs. single-click = preview (reuses tab). double-click = pin (sticks). closing last tab = placeholder. cmd-w to close. tab shows filename only, tooltip shows full path.
    * //A: what do you think?
  * // agent interaction (cmd-enter, shift-enter)
    * // shift-enter is not an agent interaction, right?
    * //A: right — shift-enter is pure typing convenience, no agent involved
    * //A: it's just "new line, same indent + prefix" — a Monaco keybinding
    * // should be simple enough to accomodate in 0200?
    * //A: yes, it's small and self-contained. adding it to scope below.
  * git integration
    * //DU: what if we include a simple version: highlight what's currently not commited
      * //DU: using bars on the left, or smth 
        * //DU: (i think there is some lightweight monaco highlighter for that)
        * //DU: how hard would that be?
      * //A: not hard. Monaco has a built-in diff decorator — `editor.deltaDecorations` with gutter classes. the work is:
        * //A: 1. run `git diff <file>` in main process (or `git diff --no-index` for untracked)
        * //A: 2. parse the diff → list of changed/added/deleted line ranges
        * //A: 3. apply gutter decorations: green bar = added, blue bar = modified, red triangle = deleted
        * //A: the VS Code approach: they use `git diff --unified=0` and parse hunk headers. about 50 lines of diff parsing + 20 lines of decoration. lightweight.
        * //A: the gotcha: need to re-run diff after each auto-save (1s debounce already exists, piggyback on it). and on file open.
        * //A: adding to scope — it's small enough and gives immediate visual value.
  * file watching for code files (read-only, snapshot at open time)
    * //DU: this should be included
    * //A: agreed — code files should update when they change on disk too. same pattern as left pane: fs.watch the open file, debounce, update model. read-only so no write-echo to worry about. adding to scope.

* shift-enter: continue at same indent + prefix
  * you're on a line like `  * //DU: some thought`
  * shift-enter → new line with `  * //DU: ` pre-filled, cursor after prefix
  * rules:
    * detect current line's leading whitespace + bullet (`* `) + optional // prefix
    * new line gets same indent + bullet + same prefix (if any)
    * if current line is just `* //DU: ` with nothing after → don't continue, just newline (break out)
  * Monaco: register keybinding for shift+enter in napkin-markdown language
  * no agent involvement — pure editor behavior
