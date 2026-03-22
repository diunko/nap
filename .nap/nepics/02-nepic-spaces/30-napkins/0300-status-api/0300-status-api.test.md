# 0300-status-api — Test Architecture

## Seam Map

```
CLI (nap status <slug> <status>)
  → socket request (ndjson over unix socket)
    → main process handler (handleSocketRequest)
      → changeNapkinStatus(slug, newStatus)
        → SQLite: upsert napkins row
        → filesystem: rm old symlink, ln -s new
        → IPC: notify renderer
```

Six seams. Three subsystems (SQLite, filesystem, IPC). One naming conflict to resolve.

## Design Decision: Socket Type Name

**Conflict**: existing `StatusRequest` (`type: 'status'`) queries *session* runtime status (running/done/exited). Spec says new napkin status command uses `type: 'status'` too. These collide.

Options:
- `type: 'napkin-status'` — clear, no collision
- `type: 'set-status'` — ambiguous
- Overload `type: 'status'` with field presence detection — fragile

Recommend `napkin-status`. Tests should assert that both `status` (session) and `napkin-status` (napkin) work independently.

## Status-to-Board-Dir Mapping

```
backlog → 20-backlog
todo    → 30-todo
doing   → 40-doing
review  → 50-review
done    → 60-done
```

This mapping is pure logic — testable as a small test.

---

## Test Cases

### T1: Status-to-dir mapping — pure function

- **Flow**: status string → board directory name
- **Subsystems**: none (pure logic)
- **Expected**: each valid status maps to correct dir name; invalid status throws
- **Breaks when**: someone adds a status without updating the map, or board dir naming convention changes
- **Size**: small
- **Verification**: unit assert — `statusToDir('doing') === '40-doing'`; `statusToDir('invalid')` throws

### T2: changeNapkinStatus — SQLite update, existing napkin

- **Flow**: napkin row exists in SQLite with status `backlog` → call `changeNapkinStatus('0200', 'doing')` → row updated to `doing`
- **Subsystems**: SQLite (real, via Electron)
- **Expected**: napkins row status column = 'doing' after call
- **Breaks when**: SQL typo, wrong column, transaction issue
- **Size**: medium
- **Verification**: `app.evaluate` — insert test napkin, call function, query row, assert status

### T3: changeNapkinStatus — auto-create napkin row

- **Flow**: napkin dir exists on disk but no SQLite row → call `changeNapkinStatus('0300', 'todo')` → row created with status `todo`
- **Subsystems**: SQLite, filesystem (reads dir to confirm existence)
- **Expected**: new row in napkins table with correct slug, nepic_id, status
- **Breaks when**: INSERT fails on missing nepic_id FK, or function assumes row always exists
- **Size**: medium
- **Verification**: `app.evaluate` — ensure no row for slug, call function, query row, assert exists with correct status

### T4: changeNapkinStatus — symlink created in new status dir

- **Flow**: napkin in `backlog` → change to `doing` → symlink at `40-board/40-doing/0200` points to `../../30-napkins/0200`
- **Subsystems**: filesystem
- **Expected**: symlink exists, readlink resolves to napkin dir
- **Breaks when**: wrong relative path, wrong dir name, symlink not created
- **Size**: medium
- **Verification**: `app.evaluate` → call function, then `fs.readlinkSync` on expected path, assert target

### T5: changeNapkinStatus — old symlink removed

- **Flow**: napkin has symlink in `40-board/20-backlog/0200` → change to `doing` → old symlink gone, new one in `40-doing`
- **Subsystems**: filesystem
- **Expected**: `20-backlog/0200` symlink does not exist; `40-doing/0200` symlink does
- **Breaks when**: old symlink not found (different dir scanned), rm fails silently, function only creates new without removing old
- **Size**: medium
- **Verification**: `app.evaluate` → set up initial symlink manually, call function, assert old path gone (`!fs.existsSync`), new path exists

### T6: First status set — no old symlink to remove

- **Flow**: napkin has never had a status (no symlink anywhere in 40-board/) → set to `todo` → only new symlink created, no error from missing old
- **Subsystems**: filesystem
- **Expected**: no error, symlink created in `30-todo/`
- **Breaks when**: function throws when it can't find old symlink to remove
- **Size**: medium
- **Verification**: `app.evaluate` → call function on napkin with no board symlinks, assert no throw, assert new symlink exists

### T7: Target board dir missing — auto-create

- **Flow**: `40-board/50-review/` doesn't exist → change status to `review` → dir created, symlink placed inside
- **Subsystems**: filesystem
- **Expected**: directory created with `mkdirSync({ recursive: true })`, symlink inside it
- **Breaks when**: function assumes dirs always exist, ENOENT on symlink creation
- **Size**: medium
- **Verification**: `app.evaluate` → remove target dir, call function, assert dir and symlink exist

### T8: Invalid status rejected

- **Flow**: call `changeNapkinStatus('0200', 'shipped')` → error
- **Subsystems**: validation logic
- **Expected**: throws or returns error with clear message
- **Breaks when**: no validation, status written to SQLite as arbitrary string
- **Size**: medium (uses real function in Electron context)
- **Verification**: `app.evaluate` → call with invalid status, assert throws/rejects

### T9: Socket round-trip — napkin-status command

- **Flow**: CLI sends `{ type: 'napkin-status', napkinSlug: '0200', status: 'doing' }` via socket → main handles → response `{ ok: true }`
- **Subsystems**: socket server, handler, changeNapkinStatus
- **Expected**: response has `ok: true`, SQLite updated, symlink moved
- **Breaks when**: handler not wired, type name mismatch, request parsing wrong
- **Size**: medium
- **Verification**: `app.evaluate` to set up napkin → use real socket client (ndjson over unix socket) to send request → assert response + query SQLite for verification

### T10: Socket — napkin slug not found, no dir on disk

- **Flow**: send napkin-status for slug that doesn't exist as a dir → error response
- **Subsystems**: socket, filesystem validation
- **Expected**: `{ error: 'not_found' }` or similar
- **Breaks when**: function creates orphaned SQLite row for non-existent napkin
- **Size**: medium
- **Verification**: socket request with bogus slug → assert error response, assert no SQLite row created

### T11: IPC notification fires after status change

- **Flow**: call changeNapkinStatus → renderer receives IPC message with napkin slug + new status
- **Subsystems**: IPC bridge (main → renderer)
- **Expected**: `mainWindow.webContents.send` called with napkin status update
- **Breaks when**: IPC send missing, wrong channel name, wrong payload shape
- **Size**: medium
- **Verification**: `page.evaluate` — set up IPC listener before status change, `app.evaluate` to trigger change, assert listener received correct payload

### T12: Existing session `status` command still works

- **Flow**: send `{ type: 'status', name: 'agent-1' }` → returns session runtime status (running/done/exited)
- **Subsystems**: socket handler (regression)
- **Expected**: existing behavior unchanged — returns `{ ok: true, status: 'running' }`
- **Breaks when**: new napkin-status handler accidentally shadows or breaks the existing status handler
- **Size**: medium
- **Verification**: create a session via `nap start`, send `status` request by name, assert response shape matches existing contract

### T13: CLI arg parsing — `nap status <slug> <status>`

- **Flow**: parse `['status', '0200', 'doing']` → correct socket request built
- **Subsystems**: CLI argument parser
- **Expected**: sends `{ type: 'napkin-status', napkinSlug: '0200', status: 'doing' }` to socket
- **Breaks when**: arg order wrong, missing validation, wrong type name in request
- **Size**: small (if arg parsing is extracted as pure function) or medium (if tested via real CLI → socket)
- **Verification**: small: unit test parseArgs output; medium: spawn `nap status 0200 doing` with `NAP_SOCKET` set, assert socket receives correct request

### T14: CLI — missing arguments

- **Flow**: run `nap status` with no args, or `nap status 0200` with no status
- **Subsystems**: CLI
- **Expected**: stderr usage message, exit code 1
- **Breaks when**: no validation, crashes instead of clean error
- **Size**: small or medium
- **Verification**: spawn CLI, capture stderr, assert contains "Usage"

### T15: SQLite authoritative — symlink failure doesn't rollback

- **Flow**: changeNapkinStatus updates SQLite successfully but symlink operation fails (e.g., permission error) → SQLite change persists, warning logged
- **Subsystems**: SQLite, filesystem error handling
- **Expected**: SQLite row shows new status. Warning in console. No throw.
- **Breaks when**: function wraps both in try/catch and rolls back SQLite on symlink failure
- **Size**: medium
- **Verification**: `app.evaluate` — make board dir read-only, call function, assert SQLite updated, assert no throw (catch and verify warning logged)

---

## Test Size Summary

| Size   | Count | Cases |
|--------|-------|-------|
| Small  | 2-3   | T1, T13 (pure parts), T14 |
| Medium | 12    | T2–T12, T15 |
| Big    | 0     | reserved for 0500 |

## Priority Order

1. **T2, T3** — core SQLite operations (the source of truth)
2. **T4, T5, T6** — symlink lifecycle (the most likely failure mode)
3. **T9, T10** — socket round-trip (the integration seam)
4. **T11** — IPC notification (renderer won't update without this)
5. **T12** — regression (protect existing status command)
6. **T1, T8** — validation (prevent garbage data)
7. **T7, T15** — edge cases (robustness)
8. **T13, T14** — CLI (thin layer, lower risk)

## Notes for Implementer

- **Native module boundary**: `changeNapkinStatus` will use `better-sqlite3` and `fs` — both require Electron's Node ABI. All tests touching this function must be medium tests (Playwright).
- **Test fixture**: create a temp nepic + napkin dir structure in `beforeEach`. Wipe between tests.
- **The naming conflict is real**: if implementer uses `type: 'status'` for both session and napkin status, T12 will catch the regression. Recommend separate type names.
- **Symlink relativity**: symlinks must use relative paths (`../../30-napkins/0200`) not absolute. T4 should assert the readlink value is relative.
