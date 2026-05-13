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
      * //A: resolution by link type
        * //A: code links (non-.md) → right pane
          * leading `/` → projectRoot + path
          * no leading `/` → dirname(currentFile) + path
        * //A: .md links → left pane
          * always relative to current file
          * `./02-foo.md` = same dir, `../bar.md` = parent
        * //A: https → shell.openExternal, no resolution
      * //A: distinction is by extension, not `/` prefix
        * //DU: I think this clashes with "treat as repo-root relative" above
          * //A: no clash — two separate rules for two link types
          * //A: `.md` → left, everything else → right
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

* tabs (both panes, vscode-style ephemeral)
  * left pane — .nap files
  * right pane — code files + terminal
    * //A: left pane — tabs useful (reading workflow, flip between chapters)
    * //A: right pane — tabs wrong (reference material, always latest)
    * //A: proposal: tabs on left only, right stays ephemeral
      * vscode-style ephemeral: single-click = preview (reuses), double-click = pin
        * //DU: yeah, right, i was thinking vscode-inspired:
          * //DU: ephemeral tab for clicking around
            * //DU: e.g. you click around on links in left pane, right ephemeral gets updated
            * //DU: and when you dbl-click the tab or the link, the tab becomes real
            * //DU: would that be too hard for this iteration?
              * //A: not hard — it's the same mechanic on both sides
                * //A: left pane
                  * single-click .md link → ephemeral tab (italic title, reuses slot)
                  * double-click or edit → pins the tab (normal title, sticks)
                  * reading workflow: click around chapters, only keep the ones you care about
                * //A: right pane
                  * single-click file:line link → ephemeral tab (code view, reuses slot)
                  * double-click link → pins the tab
                  * terminal is always a pinned tab (special, can't close while agent running)
                * //A: implementation
                  * tab state: `{ path, ephemeral: boolean, scrollPos, cursorPos }`
                  * ephemeral slot: at most one per pane, always rightmost
                  * pin = flip `ephemeral: false`
                  * Monaco models stay alive for open tabs, disposed on tab close
                * //A: manageable for 0200 — adding to scope
      * cmd-w to close, filename only, tooltip = full path
      * closing last tab → placeholder
  * // agent interaction (cmd-enter, shift-enter)
    * // shift-enter is not an agent interaction, right?
    * //A: correct — pure typing convenience, Monaco keybinding
    * // should be simple enough to accomodate in 0200?
    * //A: yes, added to scope below
  * git integration
    * //DU: what if we include a simple version: highlight what's currently not commited
      * //DU: using bars on the left, or smth 
        * //DU: (i think there is some lightweight monaco highlighter for that)
        * //DU: how hard would that be?
      * //A: not hard — ~70 lines total
        * //A: main process
          * `git diff --unified=0 <file>`
          * parse hunk headers → changed/added/deleted line ranges
        * //A: renderer
          * deltaDecorations with gutter CSS classes
          * green bar = added, blue = modified, red triangle = deleted
        * //A: gotcha
          * need to re-run diff after each auto-save
          * piggyback on existing 1s debounce
          * also re-run on file open
        * //A: added to scope
  * file watching for code files (read-only, snapshot at open time)
    * //DU: this should be included
    * //A: agreed, added to scope — same fs.watch pattern, no echo suppression needed (read-only)

* shift-enter: continue at same indent + prefix
  * you're on a line like `  * //DU: some thought`
  * shift-enter → new line with `  * //DU: ` pre-filled, cursor after prefix
  * rules:
    * detect current line's leading whitespace + bullet (`* `) + optional // prefix
    * new line gets same indent + bullet + same prefix (if any)
    * if current line is just `* //DU: ` with nothing after → don't continue, just newline (break out)
  * Monaco: register keybinding for shift+enter in napkin-markdown language
  * no agent involvement — pure editor behavior

* not in scope
  * cmd-enter (agent interaction, routing, poke)
  * git commit integration (working commit pattern)
  * inline chat / agent responses
