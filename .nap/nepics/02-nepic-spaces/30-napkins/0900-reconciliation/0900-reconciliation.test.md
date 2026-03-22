## Test Architecture — 0900-reconciliation

Filesystem walk vs SQLite on app launch. Three outcomes: match, new, orphan. Never delete rows.

### Seams

1. **Filesystem → reconciliation logic** — readdir results feed the matching algorithm
2. **Reconciliation → SQLite** — INSERTs for new dirs, UPDATEs for orphans, no-ops for matches
3. **Reconciliation → startup sequence** — must run after DB init, before UI renders
4. **Reconciliation → renderer** — sidebar/kanban only see reconciled state

### What does NOT exist yet

No reconciliation function exists in the codebase. `main.ts` has no reconciliation step between DB init (line 637-639) and architect resume (line 642). The napkin-store has `changeNapkinStatus` and `getAllNapkinStatuses` but no reconcile API. Session-store has CRUD but no bulk reconcile. The napkin-watcher does a full filesystem scan (`fullScan`) but doesn't touch SQLite — it only sends data to the renderer.

The implementation needs a new function (likely in napkin-store or a new reconcile module) that:
- walks `30-napkins/` and each `agents/` dir
- matches against SQLite napkins + sessions tables by slug/name keys
- creates new rows for unmatched dirs
- marks orphaned SQLite entries (hidden or equivalent)

---

### T-0900-01: happy path — all dirs match SQLite

- **Flow**: pre-populate SQLite with 3 napkins + 2 agents each. Create matching dirs on disk. Run reconciliation. Verify all rows unchanged.
- **Subsystems**: filesystem, SQLite (napkins + sessions tables)
- **Expected**: all existing rows preserved — same IDs, statuses, timestamps, UUIDs. No new rows created, no rows hidden.
- **Breaks when**: matching key logic is wrong (slug comparison, case sensitivity), or reconciliation creates duplicates instead of recognizing matches.
- **Size**: medium (SQLite is native module — must run in Electron)
- **Verification**: `app.evaluate` → run reconcile, then query napkins + sessions tables. Assert row count unchanged, all fields match pre-reconcile snapshot.

### T-0900-02: new napkin dir — no SQLite entry

- **Flow**: create a napkin dir `0999-new-feature/` on disk with no corresponding SQLite row. Run reconciliation. Verify new row created with defaults.
- **Subsystems**: filesystem, SQLite napkins table
- **Expected**: new napkin row inserted. Status = `backlog` (default). ID generated. nepic_id links to correct nepic.
- **Breaks when**: reconciliation skips dirs that don't have SQLite entries, or inserts with wrong default status, or fails to link to the correct nepic.
- **Size**: medium
- **Verification**: `app.evaluate` → after reconcile, query `SELECT * FROM napkins WHERE slug = '0999-new-feature'`. Assert exists, status = 'backlog', nepic_id correct.

### T-0900-03: new agent dir — no SQLite session

- **Flow**: create agent dir `agents/001-test-arch/` inside an existing napkin dir. No matching session row. Run reconciliation.
- **Subsystems**: filesystem, SQLite sessions table
- **Expected**: new session row created. Status = 'new' or equivalent default. napkin_slug set correctly. No cc_session_uuid (never ran).
- **Breaks when**: reconciliation doesn't walk agents/ subdirs, or creates session with wrong napkin_slug, or assigns a UUID prematurely.
- **Size**: medium
- **Verification**: `app.evaluate` → query sessions table for matching napkin_slug + name. Assert exists, status is default, no cc_session_uuid.

### T-0900-04: orphaned napkin — SQLite row, no dir

- **Flow**: insert napkin row for `0888-gone/` in SQLite. Don't create the dir on disk. Run reconciliation.
- **Subsystems**: SQLite napkins table, reconciliation logic
- **Expected**: row still in SQLite (NOT deleted). Marked hidden (however implementation exposes this — hidden column, or status flag). Row retains original ID, status, timestamps.
- **Breaks when**: reconciliation deletes the row (violates "never delete" rule), or fails to mark it hidden, or corrupts existing metadata.
- **Size**: medium
- **Verification**: `app.evaluate` → query napkin row after reconcile. Assert exists, hidden=true (or equivalent), original fields intact.

### T-0900-05: orphaned session — SQLite row, no agent dir

- **Flow**: insert session row for agent `002-fs-eng` under napkin `0200-sqlite`. Don't create the agent dir. Run reconciliation.
- **Subsystems**: SQLite sessions table, reconciliation logic
- **Expected**: session row preserved, marked orphaned/hidden. cc_session_uuid, status, timestamps all retained.
- **Breaks when**: session deletion on missing dir, or orphan flag not set, or UUID cleared.
- **Size**: medium
- **Verification**: `app.evaluate` → query session row. Assert exists, orphaned flag set, cc_session_uuid preserved.

### T-0900-06: branch switch round-trip — orphan then reconnect

- **Flow**:
  1. Set up 3 napkins with agents, all matched in SQLite.
  2. Remove 2 napkin dirs (simulating `git checkout other-branch`).
  3. Run reconciliation → 2 orphaned, 1 matched.
  4. Restore the 2 dirs (simulating `git checkout main`).
  5. Run reconciliation again → all 3 matched, none orphaned.
- **Subsystems**: filesystem, SQLite napkins + sessions, reconciliation (twice)
- **Expected**: after step 5, all 3 napkins fully reconnected. IDs, statuses, UUIDs, timestamps identical to pre-orphan state. Hidden flags cleared.
- **Breaks when**: orphaned rows lose metadata during the hidden phase, or reconciliation creates duplicate rows on reconnect instead of reusing existing ones, or hidden flag not cleared on reconnect.
- **Size**: medium
- **Verification**: `app.evaluate` → snapshot all rows before step 2. After step 5, compare row-by-row. All fields match except hidden flag (which should be false/cleared).

### T-0900-07: empty 30-napkins/ — no dirs at all

- **Flow**: create `30-napkins/` as an empty directory. Run reconciliation.
- **Subsystems**: filesystem, reconciliation logic
- **Expected**: no crash, no new rows created. If SQLite has pre-existing napkin rows, they all become orphaned.
- **Breaks when**: readdir on empty dir throws, or reconciliation assumes at least one napkin exists.
- **Size**: medium
- **Verification**: `app.evaluate` → run reconcile, assert no error thrown, napkin count in SQLite matches expectation (0 visible, N orphaned).

### T-0900-08: missing 30-napkins/ — dir doesn't exist

- **Flow**: nepic dir exists but `30-napkins/` does not (brand new nepic, nothing created yet). Run reconciliation.
- **Subsystems**: filesystem, reconciliation error handling
- **Expected**: no crash, no rows created. Graceful handling — readdir ENOENT caught.
- **Breaks when**: reconciliation doesn't handle missing 30-napkins/ dir, throws uncaught ENOENT.
- **Size**: medium
- **Verification**: `app.evaluate` → run reconcile, assert completes without error.

### T-0900-09: agent dir with no prompt.md

- **Flow**: create agent dir `agents/003-empty/` with no files inside. Run reconciliation.
- **Subsystems**: filesystem, SQLite sessions table
- **Expected**: session row created for the agent dir. The absence of prompt.md doesn't prevent the agent from being tracked — the dir's existence is what matters.
- **Breaks when**: reconciliation requires prompt.md to exist, or skips dirs without specific files.
- **Size**: medium
- **Verification**: `app.evaluate` → query sessions for agent name `003-empty`. Assert row exists.

### T-0900-10: reconciliation runs before UI renders

- **Flow**: launch app with pre-existing napkin dirs that have no SQLite entries. Verify the renderer receives reconciled data (not stale/empty data) on first paint.
- **Subsystems**: main.ts startup sequence, reconciliation, IPC to renderer
- **Expected**: by the time the renderer's store is populated (via napkin:update or initial scan), SQLite rows already exist for all dirs. Sidebar shows correct napkin count from first render.
- **Breaks when**: reconciliation runs after the renderer reads SQLite, causing a flash of empty/stale state.
- **Size**: medium
- **Verification**: `page.evaluate` → on first window load, check store napkin count matches filesystem dirs. No flicker or empty-then-populated transition.

### T-0900-11: performance — 40 napkins x 3 agents under 100ms

- **Flow**: create 40 napkin dirs, each with 3 agent subdirs (120 dirs total). Run reconciliation. Measure wall-clock time.
- **Subsystems**: filesystem (readdir), SQLite (bulk insert/lookup), reconciliation
- **Expected**: completes in <100ms. This is the spec's upper bound.
- **Breaks when**: O(n^2) matching (nested loops instead of hash lookup), individual SQLite queries per dir instead of batched, or synchronous file reads blocking event loop.
- **Size**: medium
- **Verification**: `app.evaluate` → `performance.now()` before and after reconcile call. Assert delta < 100ms.

### T-0900-12: reconciliation is additive — never deletes rows, never deletes files

- **Flow**: pre-populate SQLite with 5 napkins + 10 sessions. Remove 3 napkin dirs. Run reconciliation. Verify row counts.
- **Subsystems**: SQLite, reconciliation
- **Expected**: total row count in napkins table is still 5 (none deleted). Total sessions row count unchanged. Orphaned rows marked hidden, not removed. No filesystem deletions.
- **Breaks when**: DELETE statement in reconciliation code, or rows being dropped on orphan.
- **Size**: medium
- **Verification**: `app.evaluate` → count napkins rows and sessions rows before and after. Assert counts equal. Assert orphaned rows have hidden flag, not deleted.
