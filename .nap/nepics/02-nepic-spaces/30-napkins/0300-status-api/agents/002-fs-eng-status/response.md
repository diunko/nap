# 0300-status-api — Implementation Complete

## What was built

### 1. `src/main/napkin-store.ts` — core module
- `statusToDir(status)` — pure function: `'doing' → '40-doing'`, throws on invalid
- `changeNapkinStatus(slug, newStatus)` — single function that:
  - Validates status against `['backlog', 'todo', 'doing', 'review', 'done']`
  - Finds napkin dir on disk by scanning `.nap/nepics/*/30-napkins/{slug}`
  - Throws if napkin dir not found (prevents orphaned SQLite rows)
  - Upserts SQLite: creates napkin row if missing, auto-creates nepic row if needed
  - Moves board symlink: removes old from any status dir, creates new with relative path
  - SQLite is authoritative: symlink failure logs warning, doesn't rollback
- `initNapkinStore(db, projectCwd)` / `closeNapkinStore()` — lifecycle, follows session-store pattern

### 2. Socket handler: `napkin-status`
- Type: `{ type: 'napkin-status', napkinSlug, status }`
- Returns `{ ok: true }` on success
- Returns `{ error: 'not_found' }` or `{ error: 'invalid_status' }` on failure
- Sends IPC `napkin:status-changed` to renderer after success

### 3. CLI command: `nap status <slug> <status>`
- Sends `napkin-status` socket request
- Prints `<slug> → <status>` on success
- Validates args: prints usage on missing args

### 4. Protocol type: `NapkinStatusRequest`
- Added to `src/shared/protocol.ts` and `SocketRequest` union

### 5. Test surface exposed
- `changeNapkinStatus` added to `globalThis.__napTest` for Playwright medium tests
- Updated `NapTestHelpers` type in `src/types/nap-test.d.ts`

## Decisions
- Used `napkin-status` as socket type name (not `status`) to avoid collision with session status query
- IPC channel: `napkin:status-changed` with payload `{ slug, status }`
- Nepic auto-creation: if napkin's nepic has no SQLite row, creates one using the directory slug as both id and name
- Symlink cleanup scans all board dirs (not just the expected old status dir) for robustness — handles manual moves or corrupted state
- Used `lstatSync` instead of `existsSync` when checking for symlinks to avoid following broken links

## Verification
- `npm run typecheck` — zero errors
- `npm run test:small` — 76 passed, 1 skipped (pre-existing skip)
