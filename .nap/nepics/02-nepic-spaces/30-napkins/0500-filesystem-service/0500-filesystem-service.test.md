# 0500-filesystem-service — Test Architecture

## Seam Map

```
app.whenReady()
  → init filesystem service (watch 30-napkins/)
    → fs.watch(recursive) fires on file create/modify/delete
      → debounce 200ms per napkin dir
        → readNapkinDir(slug)
          → readdir → artifact extensions (.nap.md, .spec.md, .test.md, .journeys.md)
          → readdir agents/ → agent dir names
          → read .nap.md → extract bullet lines (start with *)
        → IPC: napkin:update → renderer
          → store update → React re-render
```

Five seams:
1. **fs.watch → debounce** — raw OS events batched per napkin dir
2. **debounce → readNapkinDir** — correct dir identified from watch event path
3. **readNapkinDir → data shape** — dir structure parsed into `{ slug, artifacts, agents, napkinBullets }`
4. **IPC main → renderer** — `napkin:update` channel delivers correct payload
5. **startup full scan** — all napkin dirs read and sent before renderer needs them

## Critical Design Observations

- **fs.watch recursive** on macOS uses FSEvents (efficient). On Linux it doesn't support `recursive: true` natively — but NAP targets macOS for v2, so this is fine.
- **Debounce per napkin dir, not globally** — saving a file in `0200-sqlite-setup/` shouldn't delay updates for `0300-status-api/`.
- **The service doesn't touch SQLite** — it only reads filesystem. SQLite owns status. This separation must not leak.
- **nepicDir comes from somewhere** — likely from SQLite (active nepic) or app startup config. The service needs to know which nepic's `30-napkins/` to watch.

---

## T-0500-01: readNapkinDir — reads artifact extensions correctly

* **Flow**: napkin dir has `.nap.md`, `.spec.md`, `.test.md` → `readNapkinDir` returns `{ artifacts: ['.nap.md', '.spec.md', '.test.md'] }`
* **Subsystems**: filesystem reading logic (pure node fs)
* **Expected**: artifacts list contains exactly the extensions of files present. No false positives. Files that aren't recognized artifact types ignored.
* **Where it breaks**: glob pattern wrong, extension extraction wrong, readdir returns full paths instead of names
* **Test size**: medium (needs real fs via Electron's Node ABI to match prod behavior)
* **Verification**: `app.evaluate` — create a temp napkin dir with known files, call `readNapkinDir`, assert artifacts array matches expected extensions

---

## T-0500-02: readNapkinDir — reads agent directory names

* **Flow**: napkin dir has `agents/001-test-arch-sqlite/`, `agents/002-fs-eng/` → returns `{ agents: ['001-test-arch-sqlite', '002-fs-eng'] }`
* **Subsystems**: filesystem (readdir agents/)
* **Expected**: only directories listed, not files. Names are dir basenames.
* **Where it breaks**: readdir doesn't filter for directories, or agents/ doesn't exist and throws
* **Test size**: medium
* **Verification**: `app.evaluate` — create agents/ with two dirs and a stray file, call `readNapkinDir`, assert agents array has exactly the two dir names

---

## T-0500-03: readNapkinDir — extracts napkin bullets from .nap.md

* **Flow**: `.nap.md` contains lines starting with `*` → returned as `napkinBullets`
* **Subsystems**: file reading, line parsing
* **Expected**: only top-level `*` lines extracted (first N). Nested bullets (indented `*`) excluded or included based on implementation. Empty lines and non-bullet lines skipped.
* **Where it breaks**: wrong line prefix detection, reading entire file instead of first N lines (perf), encoding issues
* **Test size**: medium
* **Verification**: `app.evaluate` — write a `.nap.md` with known bullet content (mix of `*` lines, plain text, nested bullets), call `readNapkinDir`, assert `napkinBullets` matches expected array

---

## T-0500-04: readNapkinDir — missing .nap.md returns empty bullets

* **Flow**: napkin dir exists but has no `.nap.md` file → returns `{ napkinBullets: [] }`
* **Subsystems**: filesystem error handling
* **Expected**: no throw, graceful empty array
* **Where it breaks**: fs.readFileSync throws ENOENT, not caught
* **Test size**: medium
* **Verification**: `app.evaluate` — create napkin dir with only a `.spec.md`, call `readNapkinDir`, assert `napkinBullets` is `[]`, assert no throw

---

## T-0500-05: readNapkinDir — no agents/ dir returns empty agents

* **Flow**: napkin dir has files but no `agents/` subdirectory → returns `{ agents: [] }`
* **Subsystems**: filesystem error handling
* **Expected**: no throw, empty array
* **Where it breaks**: readdir on non-existent `agents/` throws ENOENT
* **Test size**: medium
* **Verification**: `app.evaluate` — create napkin dir without agents/, call function, assert `agents` is `[]`

---

## T-0500-06: startup full scan — sends all napkins on init

* **Flow**: app launches with 3 napkin dirs in `30-napkins/` → service sends all 3 via IPC `napkin:update` as initial payload
* **Subsystems**: filesystem service init, IPC bridge
* **Expected**: renderer receives array of all napkin data objects on startup, before any user interaction
* **Where it breaks**: service sends incremental updates instead of batch, or fires before renderer is ready (IPC drops), or `30-napkins/` path resolved wrong
* **Test size**: medium
* **Verification**: `page.evaluate` — set up IPC listener for `napkin:update` before app fully loads, then assert received payload is an array with 3 entries matching the napkin dir slugs. Alternative: check store state after init settles.

---

## T-0500-07: fs.watch fires on file create — IPC update sent

* **Flow**: app running → create new file `30-napkins/0200-sqlite-setup/test-artifact.md` → fs.watch fires → debounce → IPC `napkin:update` sent with updated data for `0200-sqlite-setup`
* **Subsystems**: fs.watch, debounce, readNapkinDir, IPC
* **Expected**: renderer receives update for the specific napkin that changed, within debounce window
* **Where it breaks**: fs.watch doesn't fire for nested file creation, or watch path wrong, or debounce swallows the event, or event→slug mapping wrong
* **Test size**: medium
* **Verification**: `page.evaluate` — listen for `napkin:update` IPC, then `app.evaluate` to write a file into a napkin dir via `fs.writeFileSync`, wait for IPC message (with timeout), assert payload contains the correct napkin slug

---

## T-0500-08: fs.watch fires on file modify — updated content delivered

* **Flow**: `.nap.md` exists with 3 bullets → modify to have 5 bullets → IPC delivers napkin data with 5 bullets
* **Subsystems**: fs.watch, readNapkinDir, IPC
* **Expected**: `napkinBullets` in IPC payload reflects the new file content, not stale cache
* **Where it breaks**: service caches old content, or reads file before write is flushed, or debounce fires before fs has settled
* **Test size**: medium
* **Verification**: `app.evaluate` — overwrite `.nap.md` with new content, `page.evaluate` — wait for IPC, assert `napkinBullets.length === 5`

---

## T-0500-09: fs.watch fires on file delete — artifact removed from list

* **Flow**: napkin has `.spec.md` → delete it → IPC delivers napkin data without `.spec.md` in artifacts
* **Subsystems**: fs.watch, readNapkinDir, IPC
* **Expected**: artifacts list no longer contains `.spec.md`
* **Where it breaks**: delete event not handled, or readdir runs before unlink completes
* **Test size**: medium
* **Verification**: `app.evaluate` — delete file via `fs.unlinkSync`, `page.evaluate` — wait for IPC, assert `.spec.md` not in artifacts array

---

## T-0500-10: debounce batches rapid changes — single IPC per napkin dir

* **Flow**: write 5 files in rapid succession to same napkin dir (< 200ms total) → only 1 IPC update after debounce settles
* **Subsystems**: debounce logic, IPC
* **Expected**: exactly 1 `napkin:update` for that napkin slug, not 5
* **Where it breaks**: no debounce implemented, or debounce resets incorrectly (leading edge fires), or per-file debounce instead of per-dir
* **Test size**: medium
* **Verification**: `page.evaluate` — set up counter for `napkin:update` messages for a specific slug. `app.evaluate` — write 5 files with <50ms gaps. Wait 500ms. Assert counter is 1.

---

## T-0500-11: debounce is per-napkin-dir — changes to different napkins fire independently

* **Flow**: write file to `0200-sqlite-setup/` and `0300-status-api/` at same time → 2 separate IPC updates, one per napkin
* **Subsystems**: debounce (per-dir keying), IPC
* **Expected**: each napkin gets its own debounced update, not merged or serialized
* **Where it breaks**: global debounce batches both, or slug extraction from watch event path is wrong
* **Test size**: medium
* **Verification**: `page.evaluate` — listen for updates. `app.evaluate` — write one file to each dir simultaneously. Wait 500ms. Assert received exactly 2 updates with distinct slugs.

---

## T-0500-12: empty 30-napkins/ — no crash, empty initial payload

* **Flow**: app starts with `30-napkins/` existing but empty → service sends empty array or no update, no crash
* **Subsystems**: startup scan, filesystem
* **Expected**: renderer receives empty napkins array (or zero-length payload). No ENOENT, no unhandled exception.
* **Where it breaks**: readdir returns empty, code assumes at least one entry and accesses [0]
* **Test size**: medium
* **Verification**: launch app with empty `30-napkins/` dir. `page.evaluate` — check store has zero napkin entries. No error in console.

---

## T-0500-13: 30-napkins/ doesn't exist yet — no crash, watcher starts when dir appears

* **Flow**: nepic dir exists but `30-napkins/` hasn't been created → service handles gracefully → later `30-napkins/` is created with a napkin dir → update fires
* **Subsystems**: filesystem service init, error handling, possibly a retry or parent-dir watch
* **Expected**: no throw on startup. When dir appears and gets content, updates flow.
* **Where it breaks**: fs.watch on non-existent path throws, unhandled
* **Test size**: medium
* **Verification**: `app.evaluate` — launch with no `30-napkins/`, assert no error. Create `30-napkins/0100-test/` with `.nap.md`. Wait. Assert IPC update received. *(Note: this may require the service to watch the parent dir or poll — test reveals the design choice.)*

---

## T-0500-14: new napkin dir created at runtime — picked up by watcher

* **Flow**: app running with 2 napkins → mkdir `30-napkins/0400-new-napkin/` with `.nap.md` → watcher fires → IPC delivers new napkin data
* **Subsystems**: fs.watch (recursive catches new dirs), readNapkinDir, IPC
* **Expected**: new napkin appears in renderer without restart
* **Where it breaks**: recursive watch doesn't fire for new top-level dir on some OS, or slug parsing fails on unfamiliar name
* **Test size**: medium
* **Verification**: `app.evaluate` — create new napkin dir with `.nap.md`, `page.evaluate` — wait for IPC with the new slug. Assert data shape correct.

---

## T-0500-15: IPC payload shape matches spec

* **Flow**: readNapkinDir result → sent via IPC → renderer receives `{ slug: string, artifacts: string[], agents: string[], napkinBullets: string[] }`
* **Subsystems**: IPC serialization, data shape contract
* **Expected**: all four fields present, correct types, no extra fields that would break renderer
* **Where it breaks**: field name typo, missing field, array vs object mismatch
* **Test size**: medium
* **Verification**: `page.evaluate` — listen for `napkin:update`, assert received object has exactly the four fields with correct types. Use a napkin dir with all artifact types and agents to exercise every field.

---

## T-0500-16: watcher stops cleanly on app quit

* **Flow**: app running with active watcher → quit app → watcher closed, no leaked file handles, no post-quit callbacks
* **Subsystems**: fs.watch cleanup, app lifecycle (will-quit)
* **Expected**: watcher.close() called during quit. No "write after end" or "destroyed" errors.
* **Where it breaks**: watcher not closed, fires callback after app.quit() starts, sends IPC to destroyed window
* **Test size**: medium
* **Verification**: `app.evaluate` — trigger `app.quit()`. Assert clean exit (no error logs, exit code 0). This extends existing quit-flow tests.

---

## T-0500-17: agent dir created at runtime — appears in napkin update

* **Flow**: napkin has 0 agents → mkdir `agents/001-test-arch/` → IPC update shows `agents: ['001-test-arch']`
* **Subsystems**: fs.watch (recursive), readNapkinDir, IPC
* **Expected**: new agent dir appears in agents list without restart
* **Where it breaks**: watch doesn't fire for nested mkdir, or agents/ didn't exist and readdir still fails
* **Test size**: medium
* **Verification**: `app.evaluate` — create `agents/001-test-arch/` with a `prompt.md` inside. `page.evaluate` — wait for IPC, assert agents array includes `'001-test-arch'`.

---

## T-0500-18: concurrent napkin changes during startup scan — no race

* **Flow**: while service is doing initial scan of 5 napkins, a file is modified in napkin #2 → both initial payload and incremental update arrive, no data loss
* **Subsystems**: startup scan, fs.watch, debounce, IPC ordering
* **Expected**: renderer gets initial data for all 5 napkins AND the updated data for #2 (either in the initial payload if scan hasn't passed #2 yet, or as a subsequent update)
* **Where it breaks**: watch events queued during scan are dropped, or initial scan and watch handler read the same dir simultaneously and corrupt data
* **Test size**: medium
* **Verification**: `app.evaluate` — write a file to a napkin dir immediately after app ready (tight timing). `page.evaluate` — after 1s, assert all napkins are represented in store, and the modified napkin has the latest data. *(This is a stress/race test — may need retry-aware assertion.)*

---

## Test Count Summary

| Size   | Count | IDs |
|--------|-------|-----|
| Small  | 0     | — |
| Medium | 18    | T-01 through T-18 |
| Big    | 0     | — |

All tests are medium: the filesystem service runs in main process with real `fs.watch`, real filesystem, real IPC. Cannot test under vitest — native modules (if any) and Electron IPC require the real runtime. Even the pure-looking `readNapkinDir` needs real fs to be meaningful.

## Priority Order

1. **T-01, T-02, T-03** — readNapkinDir correctness (the data source — if this is wrong, everything downstream is wrong)
2. **T-06** — startup full scan (first thing the user sees)
3. **T-07, T-08, T-09** — fs.watch → IPC for create/modify/delete (the core feedback loop)
4. **T-10, T-11** — debounce (prevents IPC flooding under real git operations)
5. **T-15** — payload shape (renderer contract)
6. **T-04, T-05** — edge cases in readNapkinDir (missing files/dirs)
7. **T-12, T-13** — empty/missing 30-napkins/ (robustness)
8. **T-14, T-17** — runtime dir creation (live project evolution)
9. **T-16** — clean quit (lifecycle)
10. **T-18** — race condition (hardening)

## Notes for Implementer

- **All medium tests**: use `launchApp()` from `tests/helpers.ts`. Each test gets its own temp dir — scaffold `30-napkins/` with fixture napkin dirs in `beforeEach`.
- **IPC listener pattern**: set up listener in `page.evaluate` BEFORE triggering the filesystem change in `app.evaluate`. Use a Promise with timeout to wait for the IPC message.
- **Preload bridge needed**: renderer needs `onNapkinUpdate` in the preload bridge (same pattern as `onNapkinStatusChanged`). Test T-15 validates the shape crossing the bridge.
- **fs.watch timing**: macOS FSEvents can have ~100ms latency. Tests should allow 500ms–1s after file operations before asserting. Debounce adds 200ms on top.
- **Don't test agent internals**: the service reads agent DIR NAMES only, not prompt.md/response.md content. T-02 and T-17 assert dir names, nothing deeper.
- **The service doesn't write anything**: it's read-only on the filesystem. No SQLite, no symlinks. If a test needs status data, that comes from a different subsystem (0300-status-api). Keep the service boundary clean.

## What NOT to test here

- SQLite interactions — filesystem service doesn't touch the database
- Symlink/board operations — that's 0300-status-api
- React rendering of napkin data — that's 0600-live-wiring
- Visual correctness of sidebar/kanban — manual testing
- Cross-platform fs.watch behavior — NAP targets macOS for v2
