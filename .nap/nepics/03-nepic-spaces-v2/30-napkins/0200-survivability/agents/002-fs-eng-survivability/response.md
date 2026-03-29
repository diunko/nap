## 0200 — survivability: fs-eng response

### What was built

**Model expansion** (`bridge-types.ts`, `model.ts`):
- AgentState: id, nepicId, napkinId, parentName, parentId, started, running, done, homePath
- NapkinState: id, nepicId, path
- New methods: getAllAgents, setAgentExitedById, setAgentRunning, setAgentDone, setAgentStarted

**Resume decision function** (`resume.ts`):
- `computeResumeActions(agents)` — pure function, Case A/B/C

**FakePtySpawner** (`pty-spawner.ts`):
- PtySpawner interface + FakePtySpawner for small tests

**NodePtySpawner** (`node-pty-spawner.ts`):
- Real node-pty wrapper. NAP_TEST=1 replaces claude with `cat`
- Output buffering until renderer ready (markReady flushes)
- Data routing via setDataHandler, exit notification via setExitNotifier
- write/resize for renderer → pty stdin

**Coordinators** (`coordinators.ts`):
- `startAgents(model, ptySpawner)`: resume decisions → spawn → wire exit handlers → set running
- `stopApp(model, ptySpawner, uiState?)`: clearExitHandlers → killAll (no exited writes on quit)

**Terminal registry** (`terminal-registry.ts`):
- Ported from v2 (without scroll-lock). xterm.js + FitAddon + CanvasAddon
- createTerminalInstance, openTerminal, getTerminal, disposeTerminal

**Terminal component** (`Terminal.tsx`):
- Ported from v2. Styles copied verbatim: #1e1e1e background, #252526 breadcrumb header, #3c3c3c borders, Menlo/Monaco/Consolas 13px font
- xterm DOM reparenting on active terminal change
- ResizeObserver → fitAddon.fit() + pty:resize

**Preload** (`preload.ts`):
- Added pty IPC channels: pty:write, pty:resize, pty:ready (renderer → main), pty:data, pty:exit (main → renderer)

**main.ts wired**:
- Model loads → startAgents with NodePtySpawner → ptys spawn → running flags pushed to renderer
- pty data/exit routed through IPC to renderer
- pty:write/resize/ready wired from renderer to pty spawner
- before-quit: clearExitHandlers + killAll (clean quit, no marker mutations)
- __napPtyManager__ exposed in test mode

**Fixtures**: F8 (three-case survivability), F9 (all-exited)

### Tests

- **66 small tests pass** (vitest) — 28 survivability + 38 existing
- **13 medium tests pass** (Playwright):
  - T-0200-60: launch with fixture → ptys spawned → store shows running agents
  - T-0200-61: agent pty exits → marker on real disk → store shows exited
  - T-0200-62: quit → reopen → same agents running, exited still exited
  - T-0200-63: quit does NOT write exited flags to real disk
  - T-0200-64: Case C agent → started=true written to real disk
  - All 8 existing 0100/0150 medium tests pass
- **tsc --noEmit**: zero type errors

### Decisions

- **clearExitHandlers before killAll**: v3's clean alternative to v2's appIsClosing flag
- **In-memory first, disk second**: setAgentExitedById updates model synchronously, writes marker async
- **CanvasAddon over WebGL**: simpler, fewer CSP issues, WebGL is a later optimization
- **No scroll-lock**: dropped per guidance, simplifies Terminal component
- **cat as test pty command**: long-lived, reads stdin, no side effects — ideal for NAP_TEST=1
