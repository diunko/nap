## Done

### What was designed

27 test cases across 7 categories in `0150-model-stress-test.test.md`.

**Async migration (T-0150-01 to T-0150-03):** verify all 0100 tests pass with async, loadFromFilesystem returns Promise, MemoryFileSystem returns resolved promises.

**Filesystem watching (T-0150-10 to T-0150-14):** watch callback fires on simulateChange, unsubscribe works, debounce collapses 10 rapid changes into 1 model update, marker change → model re-reads → onChange fires, new agent dir detected via watch.

**Write-back (T-0150-20 to T-0150-24):** createAgent writes .agent.nap.json, setAgentExited updates marker, setNapkinStatus writes marker, saveUiState writes ui-state.json, createAgent fires onChange.

**Write-then-watch loop prevention (T-0150-30 to T-0150-32):** model write → watch echo → suppressed (onChange fires once, not twice). External write → watch fires → model processes it. Pending-write ignore window clears after debounce (path not permanently suppressed).

**Lifecycle journey tests — small (T-0150-40 to T-0150-45):** six full-stack journeys on model + fakes + bridge. Create agent, agent exits, status change, full cycle (load→mutate→save→reload), external change flows through watcher to bridge, write-then-watch chain produces exactly one bridge snapshot.

**Medium tests — equivalence (T-0150-60 to T-0150-63):** four Playwright tests, one for each key journey. Same assertions as small tests. Create agent on real disk, agent exits, status change, quit→reopen survivability.

### Key design decisions

- **Debounce tested with vi.useFakeTimers()** — no real delays in small tests. Advance timer by 200ms, assert on call count. Tests stay deterministic and fast.
- **MemoryFileSystem.writeJSON triggers watch callbacks** — this means the write-then-watch path is exercised automatically in every write test. The model MUST have pending-write suppression or tests T-0150-30/45 fail.
- **MemoryFileSystem.updateFile (no watch trigger)** vs **simulateChange (manual trigger)** — separated so tests can set up external state changes in two steps: update the data, then simulate the watcher event. This mirrors what happens in production (file changes, then fs.watch fires after a delay).
- **F6 reuses F1 data** — same fixture, different intent. The lifecycle tests need a known starting state to mutate from. No new fixture data needed.
- **global.__napModel__ for medium tests** — exposed when NAP_TEST=1. Same pattern as window.__napStore__ but for main process access. Without this, medium tests can't trigger model methods.
- **Equivalence map** — each medium test is explicitly paired with its small counterpart. Same assertions in both. This is the proof that the testing pattern works.

### For the fs-eng

The test infrastructure section at the bottom of the test.md specifies exactly what needs to be built:
1. MemoryFileSystem v2 (async + writeJSON + watch + simulateChange + updateFile + addFile)
2. Model v2 (async + write methods + watching + debounce + pending-write tracking)
3. Main process test hook (global.__napModel__)
4. Two new fixture factories (F6, F7)

All 0100 tests must still pass after the async migration — T-0150-01 is explicitly about this.
