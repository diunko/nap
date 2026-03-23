# 1500-session-resume-fix — test audit + strategy

## the change

* on clean quit: `appIsClosing` flag set → onExit skips status update → sessions stay as-is
* agent exits while app running (appIsClosing=false): marked 'exited' — this is the ONLY way a session becomes 'exited'
* on next launch: resume everything where `status != 'exited'`
  * 'running' → resume (was running when app closed)
  * 'done' → resume (agent finished, session still there)
  * 'exited' → don't resume (agent died on its own)
* `getArchitectForNepic()` query changes: `status = 'running'` → `status != 'exited'`
* `get-resume-data` orphaned filter changes: `s.status === 'running'` → `s.status !== 'exited'`

---

## audit: existing tests

### architect-resume.spec.ts (T-0800)

| test | verdict | reason |
|------|---------|--------|
| T-0800-01: getArchitectForNepic query | FINE | seeds 'running', which matches both old (`= 'running'`) and new (`!= 'exited'`) query |
| T-0800-02: resume spawn --resume flag | FINE | seeds 'running' |
| T-0800-03: no uuid → fresh claude | FINE | seeds 'running' |
| T-0800-04: expired session fallback | FINE | seeds 'running' |
| T-0800-05: orphaned detection | FINE | seeds 'running' — still caught by `!= 'exited'` filter. new test needed for 'done' orphans separately |
| T-0800-07: multiple architects | **NEEDS AMENDMENT** | seeds 'done' + 'running' architects with same `Date.now()` timestamp. currently query `status = 'running'` ignores 'done', so only 'running' matches. after fix, query `status != 'exited'` matches BOTH, and `ORDER BY created_at DESC LIMIT 1` is non-deterministic (same timestamp). fix: ensure 'running' architect has later `created_at` than 'done' architect |
| T-0800-08: active terminal | FINE | seeds 'running' |
| T-0800-09: orphaned click resume | FINE | seeds 'running' |
| T-0800-10: non-architect scope | FINE | auto-resume is architect-only; non-architects become orphaned regardless |
| T-0800-11: fresh launch | FINE | no sessions |
| T-0800-12: quit/relaunch integration | FINE | seeds 'running' |

### clean-quit.spec.ts (T-0700)

| test | verdict | reason |
|------|---------|--------|
| T-0700-01: saveUiState | FINE | UI state only, no session status |
| T-0700-02: loadUiState | FINE | UI state only |
| T-0700-03: first launch | FINE | no sessions |
| T-0700-04: before-quit saves state | FINE | UI state save timing |
| T-0700-05: sidebar round-trip | FINE | UI state only |
| T-0700-06: stale terminal fallback | FINE | fallback logic, no session status |
| T-0700-07: sidebar_visible round-trip | FINE | UI state only |
| T-0700-08: save doesn't block shutdown | FINE | timing test |
| T-0700-09: save before close | FINE | ordering test |
| T-0700-10: invalid nepic ID | FINE | graceful degradation |
| T-0700-11: quit flow regression | FINE | checks session count and ui_state row existence, not session statuses |

### cmd-w-close/close-active.spec.ts

| test | verdict | reason |
|------|---------|--------|
| T-0700-08 (cmd-w): pty:close removes terminal | FINE | agent exits on its own (exit command) while app running → 'exited' is correct under new model too |
| T-0700-09 (cmd-w): close-active IPC | FINE | same — agent exits while app running |

### poke-nap-done/poke-nap-done.spec.ts (T-0400)

| test | verdict | reason |
|------|---------|--------|
| T-0400-01: poke delivers message | FINE | no status involvement |
| T-0400-02: poke queue FIFO | FINE | no status involvement |
| T-0400-03: poke to exited terminal | FINE | agent exits while app running → 'exited', correct under new model |
| T-0400-03: poke to done terminal | FINE | done flow unchanged |
| T-0400-07: nap done lifecycle | FINE | done flow unchanged |
| T-0400-09: idempotent done | FINE | done flow unchanged |
| T-0400-04: nap nap blocks | FINE | polling flow, not quit |
| T-0400-05: already-done returns | FINE | polling flow |
| T-0400-06: timeout | FINE | polling flow |
| T-0400-10: full loop | FINE | end-to-end poke/done loop, no quit |

### status-api.spec.ts

| test | verdict | reason |
|------|---------|--------|
| T2–T15: changeNapkinStatus | FINE | napkin board status (backlog/todo/doing/review/done), unrelated to session lifecycle |
| T12: session status command | FINE | checks 'running' while app is live |

### other tests

| test | verdict | reason |
|------|---------|--------|
| orphaned-dot.test.ts | FINE | pure rendering (visual dot color) |
| inject-session-id.test.ts | FINE | pure string manipulation |
| close-active.test.ts | FINE | store guards, no session status |
| all other test files | FINE | no session status / quit involvement |

---

## amendment needed

### T-0800-07: multiple architects — timestamp fix

**Problem:** seeds two architects with same `Date.now()` → after query change to `status != 'exited'`, both match, `ORDER BY created_at DESC LIMIT 1` is non-deterministic on tied timestamps.

**Fix:** offset `created_at` in seedDb so 'running' architect has a strictly later timestamp than 'done' architect. Alternatively, insert them in two separate seedDb calls with a small delay.

Simplest: in the seed SQL, use `Date.now() - 1000` for the 'done' architect's `created_at`.

---

## new test cases

### T-1500-01: clean quit does NOT mark sessions 'exited'

* **flow:** launch app → create 2 sessions via socket (one running command, one that calls nap done) → quit app → read DB via sqlite3 CLI → verify session statuses preserved
* **subsystems:** main.ts (appIsClosing flag, onExit handler, window-all-closed), session-store (setSessionStatus)
* **expected behavior:**
  * session that was 'running' before quit → still 'running' in DB after quit
  * session that was 'done' before quit → still 'done' in DB after quit
  * neither should be 'exited'
* **where it breaks:** if `appIsClosing` flag isn't checked in onExit, or flag set AFTER killAllPtys (race condition)
* **size:** medium (Playwright + Electron + SQLite)
* **verification:** `sqlite3 <dbPath> "SELECT id, status FROM sessions"` after app.close(), assert statuses match pre-quit values

### T-1500-02: agent exits while app running → marked 'exited'

* **flow:** launch app → start session with `exit 0` command → wait for status change → verify 'exited'
* **subsystems:** main.ts (onExit handler with appIsClosing=false), session-store
* **expected behavior:** session status becomes 'exited' because agent died on its own (not during app close)
* **where it breaks:** if onExit handler always skips status update (over-broad appIsClosing check)
* **size:** medium
* **verification:** `page.waitForFunction` checks store terminal status === 'exited'; confirm via `app.evaluate` reading session-store

Note: partially covered by T-0400-03, but worth having an explicit test that specifically validates the `appIsClosing=false` path.

### T-1500-03: resume on launch finds 'running' and 'done' sessions, skips 'exited'

* **flow:** seed DB with 3 sessions — one 'running', one 'done', one 'exited' — all non-architect → launch app → check `get-resume-data` response
* **subsystems:** main.ts (get-resume-data handler), session-store (getAllSessions)
* **expected behavior:**
  * 'running' session appears as orphaned (resumable)
  * 'done' session appears as orphaned (resumable)
  * 'exited' session does NOT appear
* **where it breaks:** if orphaned filter still uses `status === 'running'` instead of `status !== 'exited'`
* **size:** medium
* **verification:** `page.evaluate(() => window.electronAPI.getResumeData())` — assert orphanedSessions contains 'running' and 'done' IDs, not 'exited' ID

### T-1500-04: 'done' architect resumes on next launch

* **flow:** seed DB with architect session status='done' + valid ccSessionUuid → launch app → verify architect is auto-resumed (live pty)
* **subsystems:** main.ts (resume logic), session-store (getArchitectForNepic with new query)
* **expected behavior:** architect with status='done' found by `getArchitectForNepic()` (query `!= 'exited'`), pty spawned with `claude --resume <uuid>`
* **where it breaks:** if `getArchitectForNepic()` still checks `status = 'running'`
* **size:** medium
* **verification:** `app.evaluate(() => globalThis.__napTest.getLivePtyIds())` contains the architect ID; `page.evaluate(() => window.electronAPI.getResumeData())` shows architectSession

### T-1500-05: quit → relaunch round-trip — sessions survive

* **flow:** launch app → start session via socket → verify 'running' → quit → relaunch with same tmpDir → verify session appears in orphaned list
* **subsystems:** full pipeline: create → quit (appIsClosing) → relaunch (resume query)
* **expected behavior:** session created in first launch survives quit as 'running', appears as orphaned in second launch
* **where it breaks:** if any part of the pipeline regresses — appIsClosing not set, onExit marks exited, resume query too narrow
* **size:** medium
* **verification:** two-phase test. phase 1: launch, create session, quit. phase 2: relaunch, check `getResumeData().orphanedSessions` includes the session ID

---

## priority

1. T-1500-01 — the core fix: quit doesn't mark sessions exited. if this fails, everything else is broken
2. T-1500-04 — 'done' architect resumes. validates the query change
3. T-1500-03 — orphaned filter broadened. validates non-architect resume
4. T-1500-05 — full round-trip integration. catches subtle timing/ordering issues
5. T-1500-02 — agent-exits-while-running still marks 'exited'. regression guard for the negative case
6. T-0800-07 amendment — timestamp fix to prevent flakiness after query change
