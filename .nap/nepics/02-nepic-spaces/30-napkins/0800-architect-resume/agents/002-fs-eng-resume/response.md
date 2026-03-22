# 0800 — Architect Resume: Implementation Summary

## What was built

### 1. Architect auto-resume on startup (`main.ts`)
- After `initSessionStore` + `initNapkinStore`, loads saved UI state to get `activeNepicId`
- Queries `getArchitectForNepic(nepicId)` — finds the most recent running architect session
- If found with `cc_session_uuid`: spawns `claude --resume <uuid>` in a pty
- If found without uuid (legacy): spawns fresh `claude`
- Pty is created before the window, data buffers until renderer connects

### 2. Expired CC session fallback (`main.ts` exit handler)
- Tracks `architectResumeId` + `architectResumeTime`
- If the resumed pty exits within 5 seconds: treats as failed resume
- Respawns fresh `claude` with the same session id (same pty slot)
- Keeps `readyTerminals` entry so data flows to renderer without re-handshake
- Renderer never sees the exit event — seamless fallback

### 3. Orphaned session detection (`main.ts` → `get-resume-data` IPC)
- New IPC handle `get-resume-data` returns:
  - `architectSession`: the auto-resumed architect (or null)
  - `orphanedSessions[]`: sessions with status='running' in SQLite but no live pty
- Orphaned = `getAllSessions().filter(s => s.status === 'running' && !livePtyIds.includes(s.id))`
- Excludes the auto-resumed architect from orphaned list

### 4. Orphaned visual state (`store.ts`, `NapkinBrowser.tsx`)
- New `AgentStatus = 'orphaned'` value
- New `TerminalMeta` fields: `isOrphaned?: boolean`, `ccSessionUuid?: string`
- `StatusDot` renders orphaned as: dashed border, transparent fill, 0.5 opacity
- `deriveArchitects` and `deriveNapkinCards` pass orphaned state through
- Orphaned label shows "orphaned" text in sidebar

### 5. Click-to-resume for orphaned agents (`store.ts`, `NapkinBrowser.tsx`)
- New store action: `resumeOrphanedTerminal(id)`
  - Creates xterm instance, sends `pty:resume` IPC, signals ready
  - Clears `isOrphaned` flag on the terminal entry
- New IPC: `pty:resume` — main spawns `claude --resume <uuid>` pty
- NapkinBrowser: clicking orphaned agent triggers resume + setActive
- ArchitectCard: clicking orphaned architect triggers resume + setActive

### 6. Renderer startup sequence (`index.tsx`)
- After `getUiState()`: calls `getResumeData()`
- Adds resumed architect via `addSocketTerminal` (pty already exists)
- Adds orphaned sessions via `addOrphanedTerminal` (no pty, no xterm)
- Then creates the default shell terminal
- Restores `activeTerminalId` from saved state

### 7. New store action: `addOrphanedTerminal`
- Adds terminal entry to store without creating xterm or pty
- Sets `isOrphaned: true`, stores `ccSessionUuid` for later resume

### 8. Session store: `getArchitectForNepic(nepicId)`
- Queries: `WHERE role = 'architect' AND nepic_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1`
- Handles multiple architects: only the most recent running one is returned
- Exposed via `__napTest` for Playwright access

## Decisions made

- **Resume command**: `claude --resume <uuid>`, not `--session-id`. Per spec: `--session-id` is for first launch, `--resume` reconnects.
- **Session ID stability**: the resumed pty reuses the same session id from SQLite. No new row created. This keeps `activeTerminalId` from saved UI state valid.
- **Fallback threshold**: 5 seconds. If CC exits within 5s of resume, assumed to be a "session not found" failure.
- **Orphaned detection timing**: computed when renderer requests `get-resume-data`, not at startup. This ensures the live pty list is current.
- **No auto-resume for non-architects**: per spec. They show as orphaned and require manual click.

## Files changed

| File | Change |
|------|--------|
| `src/main/session-store.ts` | Added `getArchitectForNepic()` |
| `src/main/main.ts` | Architect resume logic, fallback, `get-resume-data` + `pty:resume` IPC, `__napTest` additions |
| `src/main/preload.ts` | Added `pty.resume()` + `getResumeData()` bridges |
| `src/renderer/store.ts` | `'orphaned'` AgentStatus, new TerminalMeta fields, `addOrphanedTerminal` + `resumeOrphanedTerminal` actions |
| `src/renderer/index.tsx` | Resume data loading in startup sequence |
| `src/renderer/components/NapkinBrowser.tsx` | Orphaned dot style, orphaned click-to-resume, updated derive functions |
| `src/types/electron-api.d.ts` | `ResumeData` types, `pty.resume`, `getResumeData` |
| `src/types/nap-test.d.ts` | `getArchitectForNepic`, `getLivePtyIds` |

## Typecheck

`tsc --noEmit` — zero errors.
