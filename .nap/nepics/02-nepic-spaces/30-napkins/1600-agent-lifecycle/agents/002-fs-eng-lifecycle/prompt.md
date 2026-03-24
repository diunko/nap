You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: implement the entire agent lifecycle redesign. This is a large refactoring — read everything carefully before writing any code.

## What to read (in order)

1. `.nap/00-org/10-promise.nap.md` — why NAP exists
2. `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/1600-agent-lifecycle.nap.md` — the system design (authoritative)
3. `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/64-agent-lifecycle-roadmap.nap.md` — the roadmap
4. `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/1600-agent-lifecycle.test.md` — test strategy + audit of what breaks

## Implementation order

Implement in four phases. After each phase, run `npm run typecheck`. Mark tests you KNOW break with `test.skip` and a `// 1600: reason` comment. Don't fix old tests — the test engineer handles that.

### Phase 1: Session schema + nap start claude + appIsClosing

1. **Schema**: add columns to sessions table: `home_dir TEXT`, `exit_code INTEGER`, `launches INTEGER DEFAULT 1`, `last_resumed_at INTEGER`. Update init script.
2. **`nap start claude` detection**: in CLI, detect `claude` as first arg. When detected: auto-inject `--verbose --session-id <uuid>`. Prompt = everything after `claude`. Without `claude` = bare terminal (tier 1: no ccSessionUuid generated).
3. **Flags**: `--role`, `--dir` on nap start. Pass to createSession. `--napkin` already exists — make it also set homeDir to conventional path.
4. **appIsClosing**: flag in main.ts. Set in window-all-closed BEFORE killAllPtys. onExit: if appIsClosing → skip status update. If NOT → set 'exited' + exitCode.
5. **Broadened queries**: `getArchitectForNepic` → `status != 'exited'` instead of `status = 'running'`. `get-resume-data` orphaned filter → `status !== 'exited'`.

### Phase 2: nap ps tree

1. **nap ps** output as tree (parent-child indentation).
2. Show all metadata: PID, status, napkin, role, cc-session, resumable (derived: has uuid + status != exited).
3. Read from SQLite only, no PID polling.

### Phase 3: Home dir cards

1. **fs watcher**: also watch `20-architects/` directory.
2. **Unified card component**: same rendering for napkin agents, architects, free-floating. Card = window into homeDir.
3. **Architect card**: pinned at top, same rendering otherwise. Uses homeDir from session.
4. **Napkin extended view**: agent dirs decorated with runtime metadata (status, hasTerminal from session data).
5. **Free-floating without dir**: card shows [terminal] + command text only.

### Phase 4: Auto-resume all

1. **On app launch**: resume ALL sessions with ccSessionUuid where status != 'exited'. Not just architect — every claude session.
2. Architect pinned at top, others resume in background.
3. Exited sessions: show in UI, manual resume on click.
4. Increment `launches`, update `last_resumed_at`.

## Key code files

- `src/cli/nap.ts` — nap start, nap ps
- `src/main/main.ts` — pty lifecycle, startup, quit, socket handlers
- `src/main/session-store.ts` — session CRUD, queries
- `src/main/database.ts` — schema
- `src/main/napkin-watcher.ts` — fs watcher scope
- `src/renderer/store.ts` — terminal state, napkin data
- `src/renderer/components/NapkinBrowser.tsx` — card rendering
- `src/renderer/components/KanbanOverlay.tsx`
- `src/renderer/index.tsx` — startup wiring
- `src/shared/protocol.ts` — socket request types

## Design references

- Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`
- Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
- HTML mock: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

## Test approach

- Mark breaking tests with `test.skip` + `// 1600: reason` — DO NOT fix them
- Run `npm run typecheck` after each phase
- The test engineer will fix old tests and write new ones after you're done

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1600-agent-lifecycle/agents/002-fs-eng-lifecycle/response.md`, then run `nap done` (no message).
