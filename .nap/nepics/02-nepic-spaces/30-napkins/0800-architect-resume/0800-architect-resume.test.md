# 0800-architect-resume — Test Architecture

## Seam Map

```
                  SQLite                         main process
sessions table                               app.whenReady()
  role='architect'                               ↓
  status='running'|'done'                    loadUiState() → active nepic
  cc_session_uuid                                ↓
       ↓                                     query sessions: role=architect, nepic=active
  loadUiState → activeTerminalId                 ↓
       ↓                                     cc_session_uuid exists?
  renderer store                               yes → spawn: claude --resume <uuid>
    terminals[]                                no  → spawn: claude (fresh)
    activeTerminalId                             ↓
       ↓                                     createPtyProcess(id, { command })
  NapkinBrowser                                  ↓
    deriveArchitects()                       pty:data → renderer
    StatusDot(orphaned?)                         ↓
                                             renderer: addSocketTerminal()
                                               terminal.status = 'running'

orphaned detection:
  sessions WHERE status='running'
    AND id NOT IN live ptys
      → orphaned dot style (dotted border, dimmed)
```

Six seams:
1. **architect query** — find architect session for active nepic from SQLite (role='architect', matching nepic_id)
2. **resume vs fresh spawn** — cc_session_uuid present → `claude --resume <uuid>`, absent → fresh `claude`
3. **expired/deleted CC session** — `claude --resume <uuid>` fails → falls back to fresh session
4. **orphaned detection** — session.status='running' in SQLite but no live pty → orphaned visual
5. **multiple architects** — 001-architect retired (done), 002-architect active (running) → resume the active one
6. **architect terminal activation** — resumed architect becomes the active terminal on launch

## Critical Design Observations

- **Resume uses `claude --resume <uuid>`, not `--session-id`.** `--session-id` is for first launch (pre-assign UUID). `--resume` reconnects to an existing CC conversation. Different flags, different semantics.
- **The query needs nepic scoping.** Sessions have `nepic_id`. On launch, `loadUiState().activeNepicId` identifies which nepic is active → query sessions WHERE `nepic_id = active AND role = 'architect' AND status IN ('running', 'done')`. The most recent running one wins.
- **Orphaned = SQLite says running, no pty exists.** After a crash or force-quit, sessions may still have status='running' but no pty was spawned on relaunch. This is the orphan state. Detection happens in the renderer by cross-referencing store.terminals (live) with sessions from db.
- **The renderer currently has no "orphaned" AgentStatus.** `store.ts` defines `AgentStatus = 'run' | 'done' | 'nap' | 'exit'`. Orphaned is a new visual state that needs to be added — either as a new AgentStatus value or as a boolean flag on TerminalMeta.
- **Auto-resume scope is architect only.** Non-architect agents show orphaned dots but are not auto-resumed. Human clicks to resume manually.
- **`injectSessionId` won't work for resume.** It injects `--session-id`, not `--resume`. Resume needs a new command builder: `claude --resume <uuid>`.

---

## T-0800-01: find architect session for active nepic

* **Flow**: create sessions in SQLite — one architect for nepic A, one for nepic B → query for nepic A's architect → returns correct session with cc_session_uuid
* **Subsystems**: session-store, database
* **Expected**: query returns the architect session matching the active nepic. Includes cc_session_uuid.
* **Where it breaks**: query doesn't filter by nepic_id → returns wrong architect. Or role filter missing → returns non-architect sessions.
* **Test size**: medium
* **Verification**: `app.evaluate` — create two sessions: `{ role: 'architect', nepicId: 'nepic-A', ... }` and `{ role: 'architect', nepicId: 'nepic-B', ... }`. Call the architect-query function with nepicId='nepic-A'. Assert returned session has correct nepicId and cc_session_uuid.

---

## T-0800-02: resume spawn uses `claude --resume <uuid>`

* **Flow**: architect session exists with cc_session_uuid → startup builds resume command → pty spawned with `claude --resume <uuid>`
* **Subsystems**: main.ts startup, command builder, createPtyProcess
* **Expected**: the spawned command is `claude --resume <uuid>` where uuid matches the session's cc_session_uuid. Not `--session-id`.
* **Where it breaks**: uses `injectSessionId` (which produces `--session-id` flag) instead of `--resume`. Or uuid is null/undefined → command is malformed.
* **Test size**: medium
* **Verification**: `app.evaluate` — seed a session with known cc_session_uuid and role='architect'. Trigger resume logic. Capture the command passed to createPtyProcess (mock or spy). Assert command contains `--resume <known-uuid>`.

---

## T-0800-03: no cc_session_uuid → fresh claude session

* **Flow**: architect session exists but cc_session_uuid is null (legacy session) → startup spawns fresh `claude` without --resume
* **Subsystems**: main.ts startup, session-store
* **Expected**: fresh `claude` session spawned. No --resume flag. A new cc_session_uuid may be assigned for future use.
* **Where it breaks**: code assumes cc_session_uuid always exists → null reference or malformed command `claude --resume null`.
* **Test size**: medium
* **Verification**: `app.evaluate` — insert session row directly with `cc_session_uuid = NULL`. Trigger resume logic. Assert spawned command does not contain `--resume`. Assert it's a valid `claude` invocation.

---

## T-0800-04: expired CC session falls back to fresh

* **Flow**: architect session has cc_session_uuid → `claude --resume <uuid>` → CC reports session not found (exit or error output) → app detects failure → spawns fresh session
* **Subsystems**: main.ts, pty exit handler, fallback logic
* **Expected**: pty exits quickly (CC can't resume) → app detects → spawns fresh `claude` session. No crash, no hang.
* **Where it breaks**: no fallback logic — pty just dies, architect terminal stays dead. Or: exit detection races with the renderer creating the terminal entry.
* **Test size**: medium
* **Verification**: `app.evaluate` — seed session with a known-bogus cc_session_uuid (one that CC will reject). Trigger resume. Wait for pty:exit. Assert a second pty is spawned (fresh session). Assert renderer eventually has a running architect terminal.

---

## T-0800-05: orphaned session detection — status=running, no live pty

* **Flow**: session in SQLite with status='running' → app launches → no pty spawned for this non-architect session → renderer identifies it as orphaned
* **Subsystems**: session-store, renderer store, NapkinBrowser
* **Expected**: session appears in sidebar with orphaned visual — distinct from 'run', 'done', 'exit'. Dotted border, dimmed text per design spec.
* **Where it breaks**: renderer treats all sessions from SQLite as having live ptys → shows green dot for a dead session. Or: orphaned detection only runs once on startup, misses sessions loaded later.
* **Test size**: medium
* **Verification**: `app.evaluate` — insert a session with `status='running'`, `role='test-eng'`, no pty created. `page.evaluate` — load sessions into renderer store. Assert the terminal entry for this session has orphaned status. Assert `deriveNapkinCards` or equivalent shows the orphaned dot style.

---

## T-0800-06: orphaned dot renders with correct visual

* **Flow**: orphaned agent in store → NapkinBrowser renders StatusDot with orphaned style
* **Subsystems**: NapkinBrowser, StatusDot, store
* **Expected**: orphaned dot has dotted border, dimmed color — visually distinct from running (green filled pulsing) and exited (gray hollow).
* **Where it breaks**: StatusDot doesn't handle orphaned status → falls through to default, renders as running. Or: CSS properties wrong (solid border instead of dotted).
* **Test size**: small (if orphaned is just a store/component concern with no native modules) or medium (if it needs real Electron to verify)
* **Verification**: if small — vitest + jsdom: render StatusDot with orphaned status, assert style properties (border: dotted, opacity < 1). If medium — `page.evaluate` to check computed styles on the orphaned dot element.

---

## T-0800-07: multiple architects — resume the active one

* **Flow**: two architect sessions for same nepic — 001-architect (status='done'), 002-architect (status='running') → startup resumes 002 only
* **Subsystems**: session query, resume logic, main.ts startup
* **Expected**: only the running architect is auto-resumed. Done/exited architects remain in sidebar as browsable but no pty spawned.
* **Where it breaks**: query returns first match (001) instead of filtering by status. Or: resumes all architects → multiple ptys for same role.
* **Test size**: medium
* **Verification**: `app.evaluate` — create two architect sessions for same nepic: one done, one running. Trigger resume. Assert exactly one pty spawned. Assert the spawned pty corresponds to the running session (002). Assert 001 visible in sidebar with 'done' dot, not running.

---

## T-0800-08: resumed architect terminal becomes active

* **Flow**: app restarts → architect auto-resumed → architect terminal is set as activeTerminalId in renderer store
* **Subsystems**: main.ts startup, IPC, renderer store
* **Expected**: after startup, `store.activeTerminalId` is the resumed architect's terminal ID. Terminal panel shows the architect's output.
* **Where it breaks**: activeTerminalId set from loadUiState (old ID) → stale reference. Or: resume creates terminal but doesn't activate it → user sees blank panel or default shell.
* **Test size**: medium
* **Verification**: `app.evaluate` — seed architect session, save ui_state with that session's ID as active_terminal_id. Relaunch. `page.evaluate` — assert `store.activeTerminalId` matches the resumed architect session. Assert terminal panel is not blank (has xterm instance mounted).

---

## T-0800-09: agent orphaned state — click to offer resume

* **Flow**: orphaned agent in sidebar → human clicks → option to resume with `claude --resume <uuid>`
* **Subsystems**: NapkinBrowser click handler, resume action
* **Expected**: clicking an orphaned agent triggers a resume action (spawns `claude --resume <uuid>` in that agent's terminal). Status changes from orphaned to running.
* **Where it breaks**: click handler doesn't distinguish orphaned from exited. Or: resume spawns a new terminal instead of reusing the existing session entry. Or: cc_session_uuid is lost (not passed to resume command).
* **Test size**: medium
* **Verification**: `page.evaluate` — set up orphaned agent in store. Simulate click on the agent entry. Assert IPC sent to main with resume command containing `--resume <uuid>`. Assert agent status transitions to running.

---

## T-0800-10: non-architect agents are NOT auto-resumed

* **Flow**: app restarts → sessions table has running non-architect sessions → they are NOT spawned automatically → shown as orphaned
* **Subsystems**: main.ts startup, resume scope filter
* **Expected**: only architect sessions auto-resume. test-arch, fs-eng, test-eng sessions with status='running' become orphaned, not auto-resumed.
* **Where it breaks**: resume query doesn't filter by role → all running sessions get ptys spawned → resource explosion, unexpected behavior.
* **Test size**: medium
* **Verification**: `app.evaluate` — seed sessions: one architect (running), one fs-eng (running), one test-eng (running). Trigger startup resume. Assert: one pty spawned (architect only). Assert: fs-eng and test-eng sessions still have status='running' in db but no live ptys. `page.evaluate` — those agents show orphaned dots.

---

## T-0800-11: resume with no prior sessions — fresh launch

* **Flow**: app starts with empty sessions table → no architect to resume → creates default shell terminal
* **Subsystems**: main.ts startup, session query
* **Expected**: app launches normally. No resume attempted. Default terminal (shell) created as before.
* **Where it breaks**: resume query throws on empty result. Or: null architect session → null reference → crash before window created.
* **Test size**: medium
* **Verification**: `app.evaluate` — ensure sessions table is empty. Launch app. `page.evaluate` — assert default terminal exists (name='shell'). Assert no errors in console. Assert no `--resume` command in any spawned pty.

---

## T-0800-12: architect resume + UI state restore integration

* **Flow**: full quit/relaunch cycle — running architect + sidebar hidden + active terminal = architect → quit → relaunch → architect resumed, sidebar still hidden, architect active
* **Subsystems**: saveUiState (0700), loadUiState, resume logic, renderer hydration
* **Expected**: all state restored: sidebar visibility, active terminal pointing to architect, architect pty running with full CC history.
* **Where it breaks**: resume and UI restore race — activeTerminalId set before resume creates the terminal entry → stale reference. Or: resume creates a new session ID → old activeTerminalId doesn't match.
* **Test size**: medium
* **Verification**: two-phase test. Phase 1: launch, create architect session, hide sidebar, quit. Phase 2: relaunch with same db. Assert: `sidebarVisible === false`, `activeTerminalId` points to resumed architect, architect terminal has a running pty.

---

## Test Count Summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 0-1   | T-06 (depends on implementation) |
| Medium | 11-12 | T-01 through T-12 |
| Big    | 0     | — |

All seams touch SQLite or pty lifecycle → medium tests required. T-06 (orphaned dot visual) may be small if orphaned status is a pure store/component concern.

## Priority Order

1. **T-01, T-02, T-03** — architect query + resume command building: foundation
2. **T-07, T-10** — multiple architects + scope filter: the "don't resume wrong thing" guards
3. **T-05, T-06** — orphaned detection + rendering: the other half of the feature
4. **T-08** — architect activation: usability
5. **T-04** — expired session fallback: resilience
6. **T-12** — full integration with 0700 UI restore: end-to-end confidence
7. **T-09** — orphaned click-to-resume: manual resume UX
8. **T-11** — empty sessions: defensive edge case

## Notes for Implementer

- **New session query needed.** `session-store.ts` needs a function like `getArchitectForNepic(nepicId: string): Session | undefined` that queries `WHERE role = 'architect' AND nepic_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1`. Expose via `__napTest` for Playwright access.
- **Resume command builder.** Don't reuse `injectSessionId` — that produces `--session-id`. Need a simple `buildResumeCommand(uuid: string): string` → `claude --resume <uuid>`. Or inline it: just `\`claude --resume ${uuid}\``.
- **Orphaned status in renderer.** `AgentStatus` needs a fifth value: `'orphaned'`. Or add an `isOrphaned: boolean` to TerminalMeta. The renderer needs to cross-reference: sessions from db where status='running' minus live terminals = orphaned entries. This requires sessions data to flow from main → renderer on launch.
- **Startup sequence.** Resume logic belongs in `app.whenReady()`, after `initSessionStore` and `loadUiState`, before `createWindow`. Or after `createWindow` but before first render — needs IPC coordination.
- **Session ID stability.** The resumed session must keep the same `id` in the sessions table. Don't create a new row — update the existing one and spawn a pty with that same id. This ensures `activeTerminalId` from ui_state still points to the right entry.
- **Two-phase tests (T-04, T-12)** need the same tmpDir across launches. `launchApp` returns `tmpDir` — reuse it for the second launch. The db file in `.nap/nap.db` persists.
- **T-04 is hard to test without a real CC binary.** Consider: (a) mock the pty output to simulate CC's "session not found" error, or (b) use a known-invalid uuid and assert fallback behavior based on pty exit code. Option (b) is cleaner if CC exits non-zero for invalid sessions.

## What NOT to test here

- SQLite schema (tested in 0200)
- Basic pty spawn/kill (tested in earlier napkins)
- saveUiState/loadUiState mechanics (tested in 0700)
- Filesystem service / napkin watcher (tested in 0500)
- Socket protocol (tested in socket-cli tests)
- Reconciliation of filesystem vs SQLite (that's 0900)
- Auto-resume for non-architect agents (explicitly out of scope — fast-follow napkin)
