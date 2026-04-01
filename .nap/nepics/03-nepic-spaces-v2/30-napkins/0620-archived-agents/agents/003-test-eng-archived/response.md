## 0620 — archived agents: test engineer response

### What I read

- TA's test cases (0620-archived-agents.test.md) — 31 cases, 24 small, 7 medium
- TA's response (critical seams, fixture needs)
- User stories (6 stories)
- Napkin + spec
- FS-eng's response (implementation summary, 27 tests already written)
- All v3 source: model.ts, coordinators.ts, resume.ts, pty-spawner.ts, node-pty-spawner.ts, bridge-types.ts, dot-style.ts, Sidebar.tsx, Terminal.tsx, main.ts, nap.ts CLI
- All v3 tests: fixtures.ts, helpers.ts, archived-agents.test.ts, archived-agents.spec.ts

### Existing test coverage

The FS-eng already implemented 27 small tests and 4 medium tests covering:

| Section | Tests | Status |
|---------|-------|--------|
| I. Model layer (T-0620-01–05) | 5 small | all pass |
| II. Resume Path A (T-0620-10–13) | 4 small | all pass |
| III. Resume Path B (T-0620-20–24) | 5 small | all pass |
| IV. Successor flow (T-0620-32–36) | 5 small | all pass |
| V. Dot style (T-0620-40, 40b) | 2 small | all pass |
| VI. Role inference (T-0620-52) | 1 small | all pass |
| VII. Journeys (T-0620-62–63) | 2 small | all pass |
| VIII. Regression (T-0620-70–72) | 3 small | all pass |
| Medium: T-0620-30, 41, 42, 57 | 4 medium | present in archived-agents.spec.ts |

### Tests NOT implemented (vs TA spec)

The TA designed 31 tests. The FS-eng implemented 27 small + 4 medium. Missing from the TA's spec:

**Small tests not implemented:**
- T-0620-50 through T-0620-56 (import-agents CLI logic) — 7 tests. The FS-eng only implemented T-0620-52 (role inference). The remaining 6 tests cover scan logic, marker field validation, skip-existing, skip-empty, no-socket, and architect dir scanning. These test the `import-agents` CLI command internals. The CLI uses real `fs` (not MemoryFileSystem), so testing requires tmpdir scaffolding or extracting the scan logic into a testable function.

**Medium tests not implemented:**
- T-0620-31 (resume failure → successor prompt shown) — needs real Electron + simulated resume failure
- T-0620-60 (full journey: import → click → successor → regular agent) — end-to-end
- T-0620-61 (journey: resume fails → successor → regular agent) — end-to-end

### Test results

**Small tests: 29 pass, 0 fail** (27 from FS-eng + 2 dot style variants)

**Medium tests: 4 present** in archived-agents.spec.ts (T-0620-30, 41, 42, 57). Not run — require Electron build.

### Bug investigation

Investigated a user-reported bug: clicking an archived agent showed an empty terminal with blinking cursor instead of the successor prompt.

**Root cause: typo in the marker data** — `"archieved": true` instead of `"archived": true`. The model reads `marker?.archived` which returns `undefined`, defaults to `false`. The entire successor flow is silently bypassed.

Wrote reproduction tests confirming the typo causes:
1. `agent.archived === false` (model doesn't recognize the flag)
2. Dot style shows green (fs-eng done) instead of gray hollow (archived)

**Resolution**: data issue, not code bug. The feature works correctly with `archived: true`. Tests reverted — no code fix needed.

### Findings

- All 5 TA-identified critical seams are correctly addressed by the implementation
- The FS-eng's test coverage is solid for the implemented sections
- The import-agents CLI tests (T-0620-50–56) are the main gap — they'd need either tmpdir-based testing or extraction of scan logic into a unit-testable function
- The `pty:resume` IPC handler in main.ts (line 134) has no dead-session detection — it only calls `setAgentExitedById` on exit. The detection logic (fast exit + "No conversation found") only exists in `startAgents` (coordinators.ts). This means clicking a non-archived agent with a dead session would also produce an empty terminal. Not a bug in the archived feature specifically, but a gap in Path B coverage for click-resumed agents.
