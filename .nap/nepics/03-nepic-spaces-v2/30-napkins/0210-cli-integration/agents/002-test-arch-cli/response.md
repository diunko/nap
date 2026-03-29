# Test architect response — 0210 CLI integration

## What I produced

`0210-cli-integration.test.md` — 50+ test cases organized into:

### Small tests (vitest)
- **Socket server protocol** (T-0210-01..04): round-trip, error wrapping, concurrent connections, stale socket cleanup
- **Name resolution** (T-0210-10..14): exact match, suggestions, scoping to nepic, duplicate rejection
- **New model methods** (T-0210-20..30): createNapkin, createAgentStub, createArchitectStub, createNepic, startAgentByName, getStatus, getAllAgentsTree — each verifies marker writes, model state, and onChange
- **Socket handlers** (T-0210-40..50): each handler → correct model method → correct response shape (matching CLI design JSON output)
- **Message queue** (T-0210-55..57): three-step delivery, sequential queuing, clearQueue
- **nap init** (T-0210-60..65): directory structure, marker content, ui-state, prompt.md, idempotency guard, --add-skills
- **nap open walk-up** (T-0210-68..69): findProjectRoot from subdirectory
- **Error messages** (T-0210-70..73): every failure mode per CLI design (not found + suggestions, already running, already exists, bad phase, bad nepic)
- **Handler → model → bridge** (T-0210-75..77): socket mutations flow through to renderer snapshots

### Medium tests (Playwright)
- T-0210-80..89: each CLI command via real subprocess → real socket → real Electron → renderer store assertions
- Full workflow test (T-0210-89): create napkin → create agent → start → done → nap nap returns

## Key design decisions

1. **Socket server is testable in small tests.** Used real unix socket (in tmpDir) with the handler function directly. No Electron needed for socket protocol tests.

2. **Equivalence map continues.** Every medium test has small test equivalents. Small tests verify logic, medium tests verify the process boundaries (CLI→socket→IPC→renderer).

3. **Error messages tested explicitly.** The CLI design specifies exact error formats — each gets its own test case. This is where real bugs hide (unhelpful errors break the architect workflow).

4. **nap init tested as subprocess.** It's filesystem-only (no socket, no Electron), so small tests run the real CLI binary in a tmpDir. No fakes needed.

5. **Done is ephemeral — tested explicitly.** T-0210-45 verifies done is NOT written to marker (in-memory only). This is a subtle correctness requirement that would be easy to get wrong.

## Fixtures

- **F10**: CLI integration — running + exited + fresh agents, multiple napkins, architect with children
- **F11**: Empty nepic — just an architect, no napkins. For create-from-scratch flows.

## Infrastructure the fs-eng must build

10 items listed at the bottom of the test.md. Key: socket server, request handler, name resolver, message queue, 7 new model methods, protocol types, CLI rewrite, walk-up discovery, fixtures, medium test helper.
