# nap.app architecture — how data flows

* three event sources, one model
  * filesystem events (agent markers change, files edited externally)
  * CLI events (nap3 commands: create, start, done, poke, set-status)
  * renderer events (user clicks file, switches tab, opens terminal, edits content)
  * ALL three converge on the model (model.ts)
  * model is the single source of truth — nobody else writes state

* the flow

```
  filesystem (.nap/)          CLI (nap3)              renderer (React)
       |                         |                         |
  fs.watch (recursive)     unix socket              ipcMain.on('app:intent')
  200ms debounce           (.nap/sock)
       |                    NDJSON                         |
       v                         |                         |
  model.loadFromFilesystem()     v                         v
       |              socket-handler.ts ──────> model mutations
       |              (dispatches by type)      (createAgent, setDone, etc.)
       |                         |                         |
       +-------------------------+-------------------------+
                                 |
                          model.notify()
                                 |
                          main.ts builds AppSnapshot
                                 |
                    win.webContents.send('app:state', snapshot)
                                 |
                          preload.ts buffers
                                 |
                    window.electronAPI.onSnapshot(cb)
                                 |
                          store.ts applySnapshot()
                                 |
                          React re-renders
```

* model.ts (1122 lines) — the core
  * closure, not class: createModel(fs) returns NapModel interface
  * owns: napkins[], architects[], nepicDir, nepicList, pendingApprovals
  * reads filesystem: loadFromFilesystem() parses .agent.nap.json, .napkin.nap.json, builds file trees
  * writes filesystem: every mutation (setAgentDone, setNapkinStatus, createAgent) writes marker files THEN updates memory THEN calls notify()
  * serializes: all async mutations go through a queue — prevents concurrent read-modify-write races
  * notify(): fires all onChange listeners → main.ts pushes snapshot

* main.ts (436 lines) — the orchestrator
  * creates model, socket server, window
  * wires model.onChange → snapshot → renderer
  * wires renderer IPC → model mutations
  * wires CLI socket → handler → model mutations
  * manages PTY lifecycle (spawn, exit, resume, successor)
  * manages file watchers (content, code, ghost)
  * does NOT contain business logic — pure wiring

* store.ts (635 lines) — renderer state
  * zustand store, NOT the source of truth for model state
  * receives AppSnapshot via applySnapshot() — replaces napkins[], architects[]
  * owns renderer-only state: tabs, focused card, sidebar visibility, theme, render mode
  * pure functions for tab management: upsertTab, removeTab
  * per-nepic memory maps for save/restore on nepic switch
  * session persistence via electronAPI.saveUiState

* the key insight: TWO state owners
  * model.ts owns business state (napkins, agents, statuses) — filesystem is truth
  * store.ts owns UI state (tabs, focus, theme) — memory is truth, persisted to ui-state.json
  * model pushes snapshots DOWN to store (one direction)
  * store sends intents UP to main (which mutates model)
  * they never talk directly — main.ts is always in the middle

* file watchers (3 types)
  * model watcher: fs.watch on 30-napkins/ and 20-architects/ → full reload → snapshot
  * content watcher: @parcel/watcher on the single file open in editor → push content to renderer
  * ghost watcher: @parcel/watcher on parent dirs for files that don't exist yet → promote tab when file appears
  * all three go through main.ts — watcher detects change, main.ts routes to the right place

* PTY lifecycle
  * coordinators.ts: on startup, resume agents that were running (--resume) or start fresh (--session-id)
  * node-pty-spawner.ts: wraps node-pty, buffers output until renderer is ready, scrollback ring buffer
  * data flows: pty stdout → main.ts → IPC → renderer → xterm.write()
  * keyboard flows: xterm.onData → IPC → main.ts → pty.write()
  * exit detection: fast exit + "No conversation found" → mark archived

* socket server
  * unix socket at .nap/sock, NDJSON protocol
  * socket-handler.ts dispatches by message type
  * most commands: mutate model → notify → snapshot → renderer updates
  * special: hook-permission-request is long-lived (blocks CLI until resolved)
  * message-queue.ts: queues messages for nap3 poke → typed into agent PTY with delays
