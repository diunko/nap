# 0400 — symbol navigation via tsserver

* the goal
  * Cmd+click on a symbol in right pane code → go to definition
  * drill into call chains: click function → see its impl → click deeper → tab back
  * same experience as VS Code, same engine (tsserver)

* architecture
  * tsserver as child process in main Electron process
    * spawned on app open (background, non-blocking)
    * stays alive while app runs
    * killed on app quit
  * IPC bridge: renderer → main → tsserver → main → renderer
    * request: `{ file, line, col, action: 'definition' }`
    * response: `{ targetFile, targetLine, targetCol }`
  * Monaco: `registerDefinitionProvider` for right pane code editor
    * Cmd+click on symbol → provider fires → response opens file at line in right pane

* tsserver lifecycle
  * start: background on app open, or lazy on first Cmd+click
    * if not ready when user clicks → no-op (or brief status bar indicator)
  * project detection: tsserver walks up from open file to find tsconfig.json
    * works automatically for standard projects
    * monorepos with multiple tsconfigs → tsserver finds nearest to file (native behavior)
  * escape hatch: `{ "tsserverProject": "path/to/tsconfig.json" }` in ui-state.json
    * almost nobody needs this

* what you get for free once wired
  * go-to-definition (the priority)
  * hover types (`registerHoverProvider`)
  * find references (`registerReferenceProvider`)
  * probably don't want: diagnostics (red squiggles in a read-only viewer)

* navigation stack
  * each Cmd+click pushes to a back stack (file + line + scroll)
  * Cmd+[ or back button → pop stack, return to previous location
  * same mechanism as tab history but within the right pane

* costs
  * memory: 500MB-2GB for large projects (tsserver holds the type graph)
  * startup: 3-10s for large projects (background, user doesn't wait)
  * requires `node_modules` installed for third-party type resolution
    * project code definitions still work without node_modules
  * logs: tsserver stderr → `.nap/tsserver.log` (gitignored, rotating)
    * errors surfaced in debug panel events tab

* not in scope
  * write/refactor support (rename, auto-import)
  * multi-language (only TypeScript/JavaScript via tsserver)
  * LSP for other languages (future: could add language-specific servers)
