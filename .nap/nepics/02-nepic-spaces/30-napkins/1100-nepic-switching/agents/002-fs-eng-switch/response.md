# 1100-nepic-switching — Implementation Response

## What was built

Full nepic switching: click a gutter icon → sidebar and terminal swap to that nepic's context.

### Flow

1. **Gutter click** → `store.switchNepic(id)` (new async action)
2. **Store**: early return if same nepic (no-op, T-1100-12). Otherwise: set `activeNepicId` immediately + clear `napkins[]`
3. **IPC** `nepic:switch` → main process
4. **Main**: `setNepicActive(id)` in SQLite (deactivate all, activate target)
5. **Main**: `stopNapkinWatcher()` + `await startNapkinWatcher(nepicDir)` — full scan sent via `napkin:update`
6. **Main**: returns `{ architectSessionId, napkinStatuses }` — statuses returned in response, not pushed via IPC
7. **Renderer**: napkin:update arrives (via existing listener) → `setNapkinData` with array → **replaces** (not merges)
8. **Renderer**: after IPC resolves, guard on `activeNepicId` still matching (handles rapid switching). Apply statuses via `mergeNapkinStatus`. Switch terminal to architect if exists.

### Changes by file

- **session-store.ts**: Added `setNepicActive(id)` (deactivate-all + activate-target) and `getNepicById(id)` (lookup by id)
- **napkin-store.ts**: Added `getNapkinStatusesForNepic(nepicId)` — statuses filtered by `nepic_id`
- **main.ts**: Added `nepic:switch` IPC handler (handle/invoke pattern). Imports new functions. Exposed new functions in `__napTest`
- **preload.ts**: Added `switchNepic` bridge
- **electron-api.d.ts**: Added `switchNepic` type to `ElectronAPI`
- **store.ts**: Added `switchNepic` async action. Changed `setNapkinData` — array input now replaces all napkins instead of merging (prevents cross-nepic slug contamination)
- **Gutter.tsx**: Click handler uses `switchNepic` instead of `setActiveNepic`
- **nap-test.d.ts**: Added `setNepicActive`, `getNepicById`, `getNapkinStatusesForNepic` to test helpers

### Key decisions

1. **`setActiveNepic` kept as sync store setter** — still used by nepic creation flow and UI state hydration. New `switchNepic` action handles the full async flow for user-initiated switching.

2. **Array = replace in `setNapkinData`** — the test notes flagged that merge would mix slugs from different nepics. Full scan (array) now replaces; single-item updates still merge. This also fixes the creation flow where old napkins would linger.

3. **Statuses returned in IPC result, not pushed via `napkin:status-changed`** — avoids race conditions during rapid switching where stale status events could arrive after a subsequent switch has already cleared and repopulated napkins.

4. **Generation guard for rapid switching** — after `await switchNepic`, the handler checks if `activeNepicId` still matches. If superseded by another switch, the result is discarded. Combined with array-replace semantics, this ensures T-1100-11 (rapid switching) settles correctly.

5. **No-architect case** — if the target nepic has no running architect, `activeTerminalId` is left unchanged (user keeps viewing whatever terminal was active). This matches T-1100-05 expectations.

6. **Previous ptys untouched** — the switch handler never kills any ptys. Old nepic's agents keep running. T-1100-06 satisfied by omission.

### Typecheck

`tsc --noEmit` — zero errors.
