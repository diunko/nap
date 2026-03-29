* main flows — traced chains for key actions

* agent launched via CLI (`nap start claude "prompt" --napkin 0100`)
  * CLI → socket "start" request (ndjson over unix socket)
  * main: createSession(opts)
    * INSERT into SQLite sessions table (id, name, uuid, napkinSlug, role, status='running')
    * generate cc_session_uuid via crypto.randomUUID()
    * returns Session object with all fields populated
  * main: injectSessionId(command, uuid)
    * transforms 'claude "prompt"' into 'claude --session-id <uuid> --verbose "prompt"'
  * main: spawnPty(id, { command, cwd })
    * node-pty forkpty(): creates pseudo-terminal pair (master fd + slave fd)
    * spawns child process (claude) attached to slave fd
    * stores pty handle in ptys Map keyed by session id
    * sets NAP_SESSION_ID env var in child so agent can call nap done
    * registers pty.onData handler: buffers output until renderer says ready
    * registers pty.onExit handler: will update session status when process dies
  * main: IPC socket:terminal-created → renderer
    * webContents.send with { id, name, parentId, cwd, role, napkinSlug }
    * this is main TELLING renderer "a new terminal exists, add it to your model"
  * renderer: store.addSocketTerminal(id, name, ...)
    * pushes new entry to store.terminals array (zustand state update)
    * triggers React re-render of NapkinBrowser (new dot appears on card)
    * calls createTerminalInstance(id) in registry
      * new Terminal() — creates xterm.js object in memory (no DOM yet)
      * new FitAddon() — for resize calculations
      * stores in registry Map (outside React, survives re-renders)
    * sends IPC pty:ready → main
      * tells main "I have an xterm ready, send me the buffered output"
  * main: receives pty:ready
    * flushes outputBuffer for this id — sends all accumulated pty output
    * from now on, pty.onData sends directly to renderer (no more buffering)
    * IPC pty:data → renderer (for each chunk)
  * renderer: receives pty:data
    * looks up xterm instance in registry by id
    * xterm.write(data) — xterm parses ANSI sequences, updates internal buffer
    * if this terminal is active: Canvas re-renders visible viewport
    * if not active: buffer updated silently (no rendering cost)

* user clicks agent in sidebar
  * React onClick on agent entry in NapkinBrowser
  * calls store.setActive(agentId)
    * sets store.activeTerminalId = agentId (zustand state update)
    * triggers React re-render of Terminal.tsx
  * Terminal.tsx useEffect fires (activeTerminalId changed):
    * clears container div (removes old xterm's DOM element)
    * gets new terminal from registry by activeTerminalId
    * if never opened: calls terminal.open(container)
      * xterm creates its DOM (div + canvas elements)
      * loads Canvas addon for rendering
      * this is the FIRST time this xterm touches the DOM
    * if already opened: appendChild(terminal.element) into container
      * DOM reparenting — the xterm's existing DOM node moves to new parent
      * Canvas context survives the reparent (no re-init)
      * 100k lines of scrollback buffer unchanged
    * fitAddon.fit()
      * measures container dimensions
      * calculates how many cols × rows fit
      * resizes xterm's internal grid
    * IPC pty:resize → main
      * main calls pty.resize(cols, rows)
      * OS resizes the pseudo-terminal (child process sees SIGWINCH)
      * child process (claude) re-renders its output for new dimensions

* agent calls `nap done`
  * agent (inside its pty) runs: nap done
    * agent's shell spawns nap CLI as child process
    * CLI reads NAP_SESSION_ID from env (set by main when pty was created)
    * CLI → socket "done" request with { sessionId, message: undefined }
  * main: receives "done" request
    * setSessionDone(id) in session-store
      * SQLite: UPDATE sessions SET status='done', done_message=NULL WHERE id=? AND status!='done'
      * the guard (status!='done') makes it idempotent — safe to call twice
    * IPC socket:status-changed → renderer
      * webContents.send with { id, status: 'done' }
  * renderer: receives socket:status-changed
    * store.setStatus(id, 'done')
      * updates terminal entry in store.terminals array
      * triggers React re-render
      * NapkinBrowser: dot for this agent changes from green pulsing to blue filled
    * NOTE: the pty is still alive — the process didn't exit, it just signaled completion
    * the agent's xterm still has its buffer, terminal is still clickable

* file created by agent (agent writes response.md)
  * agent (claude inside pty) uses Write tool → writes response.md to disk
    * OS creates/modifies file in 30-napkins/0100/agents/001-test-arch/response.md
    * OS emits FSEvent (macOS filesystem notification)
  * main: fs.watch callback fires
    * napkin-watcher identifies which napkin dir was affected
    * debounce timer starts (200ms) — batches rapid file changes
    * after 200ms: readNapkinDir(napkinsDir, slug)
      * fs.readdir on napkin dir → list all files
      * fs.readdir on agents/ subdir → list agent dirs
      * for each agent dir: fs.readdir → list files inside
      * fs.readFile on .nap.md → extract first-level bullets
      * assembles NapkinSnapshot { slug, absPath, entries[], napkinBullets[] }
    * IPC napkin:update → renderer
      * webContents.send with the NapkinSnapshot
  * renderer: receives napkin:update
    * store.setNapkinData(snapshot)
      * finds existing napkin in store.napkins by slug
      * merges: preserves status (from SQLite), updates entries (from filesystem)
      * or creates new entry if slug not seen before
      * triggers React re-render
      * NapkinBrowser: card for 0100 now shows response.md in its file list
      * if card is focused/extended: new file appears immediately
      * if card is collapsed: dot count may change, file invisible until expanded

* app closes (Cmd+Q)
  * user presses Cmd+Q → Electron emits window-all-closed event
  * main: window-all-closed handler
    * appIsClosing = true ← THIS IS THE KEY FLAG
    * saveUiState to SQLite (active nepic, active terminal, sidebar visible)
    * killAllPtys()
      * for each pty in ptys Map: pty.kill()
        * sends SIGHUP to child process
        * claude receives signal, begins shutdown
        * pty.onExit fires for each:
          * checks appIsClosing flag
          * appIsClosing === true → SKIP status update (leave as 'running' or 'done')
          * if was false: would call setSessionStatus('exited') — but we skip it
        * pty handle removed from ptys Map
    * waits for all onExit callbacks (2s timeout)
    * stopNapkinWatcher() — closes fs.watch handles
    * closeSessionStore() — nulls db reference
    * closeDatabase() — closes SQLite connection
    * app.quit()
  * renderer: window closes
    * React tree unmounts
    * zustand store garbage collected
    * xterm instances garbage collected
    * ALL in-memory state gone
