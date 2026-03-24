# 1600 Agent Lifecycle — Implementation Response

## What was built

All 4 phases implemented + followup fixes. Zero type errors (`tsc --noEmit` passes).

### Phase 1: Foundation (~120 lines)
- **Schema**: added `home_dir TEXT`, `exit_code INTEGER`, `launches INTEGER DEFAULT 1`, `last_resumed_at INTEGER` to sessions table in both `database.ts` and `nap.ts` SCHEMA_SQL
- **Session interface**: added `homeDir`, `exitCode`, `launches`, `lastResumedAt`, `new` status. `SessionRow` and `rowToSession` updated to map all new columns
- **createSession**: conditional `ccSessionUuid` via `isClaude` param (defaults to `true` for backwards compat). Auto-computes `homeDir` for napkin agents from `30-napkins/<slug>/agents/<name>`
- **setSessionStatus**: accepts optional `exitCode`, stores it in `exit_code` column on exit
- **nap start claude detection**: CLI detects `claude` as first arg → tier 2 (constructs `claude --verbose "prompt"`). Without `claude` → tier 1 (bare terminal, no uuid). Sends `isClaude` flag through protocol
- **--role, --dir flags**: parsed in CLI, passed through StartRequest to createSession
- **Protocol**: StartRequest extended with `role`, `homeDir`, `isClaude`
- **pty onExit**: now passes `exitCode` to `setSessionStatus`
- **Broadened queries**: already correct in codebase (`status != 'exited'`)

### Phase 2: nap ps tree (~60 lines)
- **Socket ps handler**: now returns `pid`, `role`, `napkinSlug`, `ccSessionUuid`, `parentId`, `resumable` for each session
- **CLI tree output**: groups sessions by parentId, renders with indentation. Architect sessions prefixed with `[Architect]`. Shows PID, status (colored), napkin slug, session UUID (truncated), resumable flag
- **Header**: `NAME  PID  STATUS  NAPKIN  SESSION  RESUMABLE`

### Phase 3: Home dir cards (~180 lines)
- **napkin-watcher.ts**: added `architectWatcher`, `startWatchingArchitects()`, `fullArchitectScan()`, `scheduleArchitectUpdate()`. Now watches both `30-napkins/` and `20-architects/` directories. Parent watcher handles creation of either dir
- **IPC**: new `architect:update` channel for architect dir filesystem changes. Preload + type declarations added
- **Store**: new `architectSnapshots` field + `setArchitectData` action
- **index.tsx**: wired `architect:update` listener + initial pull from `get-napkin-data` (now returns `architects` array)
- **NapkinBrowser**: `ArchitectCard` now renders file tree from `architectSnapshots` when focused/extended. Shows `[terminal]` entry + file entries + subdirs. `deriveArchitects` matches terminal name to snapshot slug
- **getActiveArchitectData** exported from napkin-watcher

### Phase 4: Auto-resume all (~80 lines)
- **session-store.ts**: added `incrementSessionLaunch()` (bumps `launches`, sets `last_resumed_at`) and `getResumableSessions()` (queries all sessions with `cc_session_uuid IS NOT NULL AND status != 'exited'`)
- **main.ts**: auto-resume loop now iterates ALL resumable sessions, not just architect. Each gets `claude --verbose --resume <uuid>`. Architect still gets fallback mechanism. `incrementSessionLaunch` called for each
- **get-resume-data IPC**: now returns `resumedSessions` alongside `architectSession` and `orphanedSessions`
- **index.tsx**: resumed (non-architect) sessions added via `addSocketTerminal`

## Tests skipped

4 tests in `architect-resume.spec.ts` marked with `test.skip`:
- **T-0800-05**: orphaned session detection — session now auto-resumes instead of staying orphaned
- **T-0800-07**: multiple architects — done architect now also resumes (all claude sessions resume)
- **T-0800-09**: orphaned click-to-resume — session is already resumed, no orphan state
- **T-0800-10**: non-architect agents NOT auto-resumed — this explicitly inverts (they now DO resume)

## Decisions

1. **`isClaude` defaults to `true`**: backwards-compatible — existing callers (handleNepicCreate, pty:create, tests) still get ccSessionUuid without changes. Only CLI `nap start` without `claude` keyword sets `isClaude: false`
2. **homeDir auto-computed for tier 3**: `createSession` derives `30-napkins/<slug>/agents/<name>` when `napkinSlug` is set and no explicit `homeDir` provided
3. **Architect snapshot matching**: uses terminal name → snapshot slug match (e.g. terminal "001-architect" → architect dir "001-architect")
4. **Separate IPC channel for architects**: `architect:update` keeps architect filesystem data separate from napkin data in the store, avoiding slug collisions

## Followup fixes

1. **Old nap start form supported**: `nap start 'claude --verbose "prompt"'` (single string) still works — CLI detects `args[0].startsWith('claude ')` and passes through as-is with `isClaude: true`
2. **nap init**: architect session now includes `home_dir = '20-architects/001-architect'`
3. **nap open --architect**: switched from `getArchitectForNepicLaunch` (narrow) to `getArchitectForNepic` (broadened `status != 'exited'`). Now calls `incrementSessionLaunch`
4. **handleNepicCreate**: architect session now includes `homeDir: '20-architects/001-architect'`
5. **Template docs updated**: `src/templates/00-org/20-workflow.nap.md` — new `nap start claude` pattern with `--napkin`, `--role` flags
6. **Live docs updated**: `.nap/00-org/20-workflow.nap.md` — same updates
7. **Template skills**: confirmed complete (232 + 170 lines) — not stubs

## Post-followup fixes

8. **Prompt quoting fixed**: switched from double-quote wrapping to single-quote escaping (`'\\''` pattern). Single quotes suppress all shell expansion — `$`, backticks, double quotes all pass through intact. Extracted `shellEscape()` and `buildClaudeCommand()` as pure functions
9. **Shell round-trip tests**: 15 vitest tests in `tests/claude-command-quoting.test.ts` — creates a fake `claude` script, runs the constructed command through real `bash -c`, verifies the prompt arrives unmangled. Covers: double quotes, single quotes, both, `$`, backticks, backslashes, empty prompt
10. **Free-floating sessions in sidebar**: sessions without `--napkin` or `--role architect` (e.g. `nap start claude hi`) now render as cards below napkins. Shows name + status dot, click to focus terminal. Was missing — the NapkinBrowser only rendered architects and napkin-linked agents

## For architect review

- The architect fallback mechanism (expired session → fresh spawn) is preserved but only applies to the architect identified in the resume loop, not all sessions
- The architect-resume tests (T-0800-03, 05, 07, 09, 10) were rewritten by linter/reviewer to match new auto-resume-all behavior instead of being skipped
