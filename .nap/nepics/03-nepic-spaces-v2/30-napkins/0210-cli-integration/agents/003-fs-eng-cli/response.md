## What was built

All 10 infrastructure items from the test cases document are complete.

### New modules

1. **Socket server** (`src/main/socket-server.ts`) — ported from v2. Ndjson over unix socket at `.nap/sock`. Stale socket cleanup, error wrapping with request id preservation.

2. **Request handler** (`src/main/socket-handler.ts`) — routes all socket request types to model methods. Handles: create-napkin, create-agent, create-architect, create-nepic, start, done, stop, set-status, status (inspect), ps, poke, peek, log, nap-wait.

3. **Name resolver** (`src/main/name-resolver.ts`) — ported from v2, adapted for `AgentState`. Exact match, substring matching, Levenshtein ≤ 3 for "did you mean" suggestions. Error format matches CLI design exactly.

4. **Message queue** (`src/main/message-queue.ts`) — ported from v2 verbatim. Three-step delivery: text → Escape (300ms) → CR (100ms). Per-session queuing, clearQueue for cleanup.

5. **Protocol types** (`src/shared/protocol.ts`) — rewritten with new request types: CreateNapkinRequest, CreateAgentRequest, CreateArchitectRequest, CreateNepicRequest, SetStatusRequest, StatusInspectRequest, StopRequest, NapWaitRequest. Old types (KillRequest, CloseRequest) removed.

### Extended modules

6. **Model** (`src/main/model.ts`) — 7 new methods on NapModel interface:
   - `createNapkin(slug, status?, nepicId?)` → writes dir + .napkin.nap.json + agents/ subdir
   - `createAgentStub(napkinSlug, name, role, nepicId?)` → writes marker, enforces name uniqueness
   - `createArchitectStub(name, nepicId?)` → writes to 20-architects/
   - `createNepic(slug, displayName)` → scaffolds full nepic structure + architect stub
   - `startAgentByName(name, prompt, ptySpawner, nepicId?)` → resolves name, spawns pty, sets started+running
   - `getStatus(query)` → napkin/agent/overview queries
   - `getAllAgentsTree()` → agents grouped by parentId for ps tree view

7. **Constants** (`src/shared/constants.ts`) — added `findProjectRoot(startDir)` for walk-up discovery.

8. **Main** (`src/main/main.ts`) — socket server starts before window creation. Message queue wired to ptySpawner.write(). Socket cleanup on quit.

### Rewritten modules

9. **CLI** (`src/cli/nap.ts`) — fully rewritten to match approved CLI design:
   - `nap create napkin|agent|architect|nepic` — new commands, JSON output
   - `nap start <name> [prompt]` — starts pre-created agent by name
   - `nap set-status` — renamed from `nap status <slug> <phase>`
   - `nap status` — new read-only inspect command
   - `nap stop` — renamed from `nap kill`
   - `nap done` — no arguments
   - `nap open` — walk-up, no flags
   - `nap ps` — 4 columns: NAME, STATUS, NAPKIN, ROLE
   - `nap close` — removed
   - `nap init` — rewired for v3 (JSON markers, no SQLite)

10. **Templates** — copied from v2 to `src/templates/`.

### Tests

**Small tests (vitest)** — 48 new tests across 7 files:
- `socket-server.test.ts` — T-0210-01..04 (round-trip, errors, concurrent, stale cleanup)
- `name-resolver.test.ts` — T-0210-10..13 (exact, suggestions, no match, nepic scoping)
- `model-cli.test.ts` — T-0210-14, T-0210-20..30 (all model methods, return shapes, errors)
- `socket-handler.test.ts` — T-0210-40..50, T-0210-70..72 (handler routing, error messages)
- `message-queue.test.ts` — T-0210-55..57 (three-step, sequential, clearQueue)
- `cli-init.test.ts` — T-0210-60..65, T-0210-68..69 (init structure, walk-up)
- `socket-bridge.test.ts` — T-0210-75..77 (socket → model → bridge snapshot)

**Medium tests (Playwright)** — 8 new tests in `cli-integration.spec.ts`:
- T-0210-80..87 (real CLI → real socket → real Electron)

**Total: 114 small + 21 medium = 135 tests, all passing. Zero type errors.**

### Decisions

- **Levenshtein threshold**: Increased from ≤2 to ≤3 and added substring matching. "test-arch" → "001-test-arch" has Levenshtein distance 4, so the original ≤2 threshold produced no suggestions. Substring matching catches these common prefix/suffix cases.

- **Socket handler response IDs**: Entity IDs (from create/start) are returned as the `id` field in responses, not the request sequence ID. The test expectations (e.g., `expect(res.id).toBe('uuid-fresh')`) require this.

- **Medium test agent lifecycle**: Tests that start agents create fresh agents first via `nap create agent`, rather than targeting agents from the fixture, because the STOP→RUN coordinator auto-starts Case C agents.

### Anything to review

- The `createNepic` method goes up one directory from `nepicDir` to find `nepics/` base. This assumes `nepicDir` always ends with a nepic slug directory.

- The `nap init` rewrite drops `15-feedback/` and `40-board/` from v2. The template directory copy for the nepic was simplified to only create the required v3 structure.
