## Test Architecture — 1000-nepic-creation

(+) button creates a new nepic space: scaffold dirs, SQLite insert, deactivate previous nepic, boot architect pty, switch UI.

### What does NOT exist yet

No nepic creation handler exists. The current codebase can:
- Insert nepic rows (reconcile.ts, napkin-store.ts `ensureNepic`) — but only as side effects, not as a user-facing "create nepic" flow
- Create sessions with `ccSessionUuid` (session-store.ts `createSession`)
- Spawn ptys with `--session-id` (main.ts `createPtyProcess` + `injectSessionId`)
- Switch active nepic in renderer store (`setActiveNepic`) — but only changes a string, no IPC to main

Missing pieces:
1. IPC handler `nepic:create` in main.ts — receives name, scaffolds dirs, inserts nepic row, deactivates others, creates architect session, spawns pty, notifies renderer
2. Slug generation — `NN-name` where NN is next available number
3. Directory scaffold — `mkdir -p` for 10-docs/ through 40-board/ + board subdirs + 20-architects/001-architect/
4. Architect prompt.md template — either copied from 00-org/ or generated
5. Gutter (+) click handler — currently a no-op (`if (!isAdd)` guard in Gutter.tsx line 31 skips it)
6. Renderer-side: name input UI (text input overlay or prompt), then IPC call to main

### Seams

1. **Gutter (+) click → name input → IPC** — user intent reaches main process
2. **Slug generation** — NN prefix computed from existing nepic dirs
3. **Filesystem scaffold → expected structure** — all required dirs created
4. **SQLite: nepic INSERT + is_active toggle** — new row active, all others deactivated
5. **Architect session creation → pty spawn** — session with role=architect, ccSessionUuid, correct cwd
6. **Main → renderer notification** — UI switches: gutter re-renders, sidebar clears, terminal shows architect
7. **Edge cases** — first nepic ever, naming collision, missing .nap/ dir

---

### T-1000-01: directory scaffold — all required subdirs created

- **Flow**: trigger nepic creation with name "auth-rewrite". Verify the directory tree at `.nap/nepics/NN-auth-rewrite/`.
- **Subsystems**: nepic creation handler, filesystem
- **Expected**: dirs exist: `10-docs/`, `15-feedback/`, `20-architects/`, `20-architects/001-architect/`, `30-napkins/`, `40-board/`, `40-board/10-draft/`, `40-board/20-backlog/`, `40-board/30-todo/`, `40-board/40-doing/`, `40-board/50-review/`, `40-board/60-done/`.
- **Breaks when**: missing a subdir (e.g. forgot 15-feedback or board subdirs), wrong path nesting, or scaffold uses wrong NN prefix.
- **Size**: medium (filesystem + IPC in Electron)
- **Verification**: `app.evaluate` → call creation handler, then `fs.readdirSync` recursively on the nepic dir. Assert all expected paths exist and are directories.

### T-1000-02: slug generation — NN is next available number

- **Flow**: pre-create dirs `01-first/` and `02-second/` in `.nap/nepics/`. Trigger creation with name "third". Verify slug is `03-third`.
- **Subsystems**: slug generation logic, filesystem (readdir for existing nepics)
- **Expected**: slug = `03-third`. Directory = `.nap/nepics/03-third/`.
- **Breaks when**: NN computed from SQLite count instead of filesystem scan, gaps not handled (e.g. if 02 is missing, should still pick 03), non-numeric dirs cause parseInt to NaN.
- **Size**: medium
- **Verification**: `app.evaluate` → create nepic, check returned slug and verify dir exists at expected path.

### T-1000-03: slug generation — first nepic ever (no existing dirs)

- **Flow**: empty `.nap/nepics/` directory. Trigger creation with name "genesis". Verify slug is `01-genesis`.
- **Subsystems**: slug generation, filesystem
- **Expected**: slug = `01-genesis`. No crash from empty readdir.
- **Breaks when**: readdir on empty dir returns undefined, or NN starts at 0 instead of 1, or nepics/ dir doesn't exist yet and isn't created.
- **Size**: medium
- **Verification**: `app.evaluate` → create nepic, assert slug = `01-genesis`, dir exists.

### T-1000-04: SQLite — nepic row inserted with is_active=1

- **Flow**: trigger creation. Query nepics table for the new row.
- **Subsystems**: nepic creation handler, SQLite nepics table
- **Expected**: new row with: id (uuid), name matches input, slug matches NN-name, created_at populated, is_active = 1.
- **Breaks when**: missing is_active, wrong name/slug, created_at = 0 or null.
- **Size**: medium
- **Verification**: `app.evaluate` → after creation, `SELECT * FROM nepics WHERE slug = ?`. Assert all fields correct.

### T-1000-05: SQLite — previous nepic deactivated

- **Flow**: pre-insert a nepic row with is_active=1. Trigger creation of a new nepic. Query both rows.
- **Subsystems**: nepic creation handler, SQLite nepics table
- **Expected**: old nepic has is_active=0. New nepic has is_active=1. Only one row has is_active=1 across entire table.
- **Breaks when**: UPDATE WHERE is_active=1 misses rows, or deactivation runs after insert (race), or deactivation sets is_active=0 on the new row too.
- **Size**: medium
- **Verification**: `app.evaluate` → `SELECT COUNT(*) FROM nepics WHERE is_active = 1` → assert 1. Verify old nepic's is_active = 0.

### T-1000-06: SQLite — multiple previous nepics all deactivated

- **Flow**: pre-insert 3 nepic rows, one with is_active=1 (simulating a bug where two were active). Create a new nepic.
- **Subsystems**: SQLite nepics table
- **Expected**: all 3 old rows have is_active=0. New row has is_active=1. Total active count = 1.
- **Breaks when**: deactivation only targets the single active row by ID instead of `UPDATE nepics SET is_active=0 WHERE is_active=1`.
- **Size**: medium
- **Verification**: `app.evaluate` → count is_active=1 rows. Assert exactly 1, and it's the new nepic.

### T-1000-07: architect session created in SQLite

- **Flow**: trigger nepic creation. Query sessions table for the architect session.
- **Subsystems**: nepic creation handler, session-store
- **Expected**: session row with: role = 'architect', nepic_id = new nepic's id, status = 'running', cc_session_uuid populated (non-null UUID), name = '001-architect' or similar, cwd = correct nepic path.
- **Breaks when**: role not set, nepic_id not linked, cc_session_uuid missing (architect can't be resumed later), wrong cwd.
- **Size**: medium
- **Verification**: `app.evaluate` → `SELECT * FROM sessions WHERE nepic_id = ? AND role = 'architect'`. Assert all fields.

### T-1000-08: architect pty spawned with correct command

- **Flow**: trigger nepic creation. Verify a pty was spawned and its command includes `--session-id <uuid>` and `--verbose`.
- **Subsystems**: nepic creation handler, createPtyProcess, injectSessionId
- **Expected**: pty exists for the architect session ID. Command passed includes `claude --session-id <uuid> --verbose`. Pty's cwd is the nepic dir (or project root — spec TBD).
- **Breaks when**: pty not spawned, --session-id missing (architect can't be resumed), --verbose omitted, wrong cwd.
- **Size**: medium
- **Verification**: `app.evaluate` → check `ptys.has(architectSessionId)` (via `__napTest.getLivePtyIds()`). Cross-reference session's ccSessionUuid with the command stored in the session row.

### T-1000-09: architect prompt.md template created

- **Flow**: trigger nepic creation. Check that `20-architects/001-architect/prompt.md` exists in the new nepic dir.
- **Subsystems**: filesystem scaffold
- **Expected**: file exists and contains some template content (e.g., references to project context). Not empty.
- **Breaks when**: prompt.md not created (architect boots with no instructions), or template is empty, or placed in wrong directory.
- **Size**: medium
- **Verification**: `app.evaluate` → `fs.existsSync` + `fs.readFileSync` on the prompt.md path. Assert exists and non-empty.

### T-1000-10: ui_state updated with new active nepic

- **Flow**: trigger nepic creation. Check ui_state table.
- **Subsystems**: nepic creation handler, ui_state
- **Expected**: ui_state.active_nepic_id = new nepic's id. This ensures the active nepic persists across restarts.
- **Breaks when**: ui_state not updated (restart would show the old nepic), or updated with wrong id.
- **Size**: medium
- **Verification**: `app.evaluate` → `SELECT active_nepic_id FROM ui_state WHERE id = 1`. Assert matches new nepic id.

### T-1000-11: renderer notified — gutter re-renders with new icon

- **Flow**: trigger nepic creation from main. Check renderer store state.
- **Subsystems**: IPC (main → renderer), renderer store, Gutter component
- **Expected**: store's activeNepicId = new nepic's id. Gutter shows a new icon with the nepic's initial. The new icon has the active indicator bar.
- **Breaks when**: IPC message not sent, or renderer doesn't update activeNepicId, or Gutter still renders from MOCK_NEPICS (currently hardcoded).
- **Size**: medium
- **Verification**: `page.evaluate` → `useTerminalStore.getState().activeNepicId` matches new nepic id. DOM query: count `[data-testid="nepic-icon"]` elements, verify new one present.

### T-1000-12: renderer notified — architect terminal appears and is active

- **Flow**: trigger nepic creation. Verify a terminal entry for the architect exists in the store and is active.
- **Subsystems**: IPC, renderer store, terminal registry
- **Expected**: store.terminals includes an entry with role='architect', it's the activeTerminalId, and an xterm instance exists in the registry for it.
- **Breaks when**: socket:terminal-created IPC not sent or not handled for architect session, or terminal not set as active.
- **Size**: medium
- **Verification**: `page.evaluate` → find terminal with role='architect' in store. Assert `activeTerminalId` equals its id. Assert `getTerminal(id)` returns non-null.

### T-1000-13: previous nepic's sessions keep running

- **Flow**: create a nepic with a running session (pty alive). Create a second nepic. Verify the first nepic's pty is still alive.
- **Subsystems**: nepic creation handler, pty lifecycle
- **Expected**: first nepic's pty process still exists in the ptys map. Its session status is still 'running'. UI switch didn't kill it.
- **Breaks when**: creation handler kills previous nepic's ptys, or deactivation logic extends to pty cleanup.
- **Size**: medium
- **Verification**: `app.evaluate` → `__napTest.getLivePtyIds()` includes the first nepic's architect session id. `getSession(oldArchitectId).status` is still 'running'.

### T-1000-14: naming collision — duplicate name

- **Flow**: create nepic "auth". Try to create another nepic "auth". Verify the second one gets a distinct slug (e.g. `03-auth` vs `02-auth`), not a filesystem collision.
- **Subsystems**: slug generation
- **Expected**: second nepic gets a different NN prefix. Both dirs exist on disk without conflict.
- **Breaks when**: slug generation doesn't check existing slugs, only checks count. Or name sanitization produces identical slugs that collide.
- **Size**: medium
- **Verification**: `app.evaluate` → both nepic dirs exist. Query nepics table: 2 rows with name="auth" but different slugs.

### T-1000-15: missing .nap/ dir — created on demand

- **Flow**: start with a tmpDir that has no `.nap/` directory. Trigger nepic creation.
- **Subsystems**: filesystem scaffold
- **Expected**: `.nap/` and `.nap/nepics/` and the full nepic tree are created. No crash from ENOENT.
- **Breaks when**: scaffold assumes .nap/ exists, throws ENOENT on mkdir.
- **Size**: medium
- **Verification**: `app.evaluate` → trigger creation, verify `.nap/nepics/01-name/` exists with all subdirs.

### T-1000-16: napkin watcher starts for new nepic

- **Flow**: create a new nepic. Add a napkin dir inside the new nepic's `30-napkins/`. Verify the renderer receives the napkin update.
- **Subsystems**: nepic creation handler, napkin-watcher, IPC
- **Expected**: after creation, the napkin watcher is watching the new nepic's dir. A new file/dir in `30-napkins/` triggers a `napkin:update` IPC event to the renderer.
- **Breaks when**: watcher not restarted/switched to new nepic dir, or old nepic's dir is still being watched.
- **Size**: medium
- **Verification**: `app.evaluate` → create nepic, then `fs.mkdirSync` a napkin dir. `page.waitForFunction` → check store's napkins array includes the new slug.

### T-1000-17: end-to-end — (+) click through architect terminal output

- **Flow**: full user flow. Click (+) in gutter. Enter a name. Wait for architect terminal to show output (any claude startup text in xterm buffer).
- **Subsystems**: Gutter UI, name input, IPC, scaffold, SQLite, pty spawn, renderer terminal
- **Expected**: terminal buffer has non-empty content. Store has the architect terminal as active. Gutter shows new icon highlighted.
- **Breaks when**: any step in the chain fails — this is the integration smoke test.
- **Size**: medium
- **Verification**: click (+) via DOM, enter name. `page.waitForFunction` → active terminal's xterm buffer has content. Assert gutter icon count increased by 1.
- **Note**: this is the most fragile test — depends on `claude` being available. May need to mock the command or use `echo` as a stand-in.

### Not tested (manual / future)

- **Name input UI** — visual correctness of the text input overlay. Manual testing.
- **Gutter animation** — smooth transition when new icon appears. Visual only.
- **Architect prompt quality** — whether the generated prompt.md is useful. Skill/workflow concern, not app code.
- **Onboarding package generation** — explicitly out of scope per spec ("TBD: autonomous or human-reviewed").
