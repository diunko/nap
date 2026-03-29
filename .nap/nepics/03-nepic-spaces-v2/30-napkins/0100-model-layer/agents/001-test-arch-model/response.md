# 001-test-arch-model — response

## What I read

- Role file, napkin, spec, mega napkin
- Nova's reflections (70, 72, 73) — the inline `//` and `//AN:` discussion tracing the 2-state model, journey testing gap, and why 232 tests didn't catch broken wiring
- T3Code testing patterns — especially pattern 1 (fake service boundary), 4 (pure derivation), 5 (fixture composition)
- V2 codebase: main.ts startup/reconcile flow, napkin-watcher.ts, store.ts zustand shape, NapkinBrowser.tsx derive functions, test suite patterns and gaps

## Key insight from v2 study

V2's test gap was at the wiring level. Each component had thorough tests (napkin-watcher reads dirs correctly, store merges correctly, NapkinBrowser derives correctly) but nobody tested: "marker file on disk → model → IPC → store → rendered card." That wiring IS what 0100 proves.

The v2 derive functions (deriveArchitects, deriveNapkinCards) do matching-by-name between filesystem agents and terminal sessions — this cross-system matching was a major bug source. The v3 model eliminates this by making the model the single source, and the bridge just pushes snapshots.

## Test architecture

### Fixture strategy

5 named fixtures (F1-F5) covering: minimal project, rich project (3 napkins × mixed agents/statuses), empty project (dirs without markers), exited agent, no architects. All represented as `Record<string, object>` — path-to-JSON maps that feed directly to MemoryFileSystem.

The fixture IS the test setup. No filesystem writes for small tests. JSON in, assertions out.

### Test layers

**Small tests (vitest, no Electron)** — 15 cases:
- T-0100-01 through T-0100-08: model loading from MemoryFileSystem. Cover: correct loading, multi-napkin, missing markers (defaults), exited flag, no architects, change events, unsubscribe, slug derivation from dirname.
- T-0100-10 through T-0100-13: bridge with FakeBridge. Cover: snapshot delivery on model change, full-state-not-delta, intent round-trip, multi-listener fan-out.
- T-0100-20 through T-0100-22: **journey tests** — the hypothesis validation. Full path: MemoryFileSystem → model → FakeBridge → simulated zustand store. These prove the architecture is testable end-to-end in vitest without Electron.

**Medium tests (Playwright + Electron)** — 3 cases:
- T-0100-30: app boots, sidebar renders napkins from real marker files
- T-0100-31: IPC seam — snapshot arrives at renderer store through real Electron IPC
- T-0100-32: agent dots render under napkin cards

### What shapes the fs-eng's build

The test cases define the model's public API implicitly:
- `loadFromFilesystem(nepicDir)` must walk `30-napkins/` and `20-architects/`
- `getNapkins()` returns `NapkinState[]` with slug, status, nested agents
- `getArchitects()` returns `AgentState[]`
- `onChange(listener)` returns unsubscribe function
- Missing marker files → defaults (not crashes)
- `exited: true` in agent marker → preserved in AgentState

The bridge's contract:
- Pushes full `AppSnapshot` (not deltas) on every model change
- Renderer → main: `sendIntent({ type: 'setActiveTerminal', id })` round-trips

Infrastructure the fs-eng must build:
1. `MemoryFileSystem` implementing `FileSystemReader`
2. `FakeBridge` — two EventEmitters, same interface as real IPC
3. Fixture helpers for each F1-F5
4. Playwright fixture helper that writes fixtures to real tmpDir

## Confidence

If T-0100-20 (journey test) passes — model loaded from MemoryFileSystem, snapshot delivered through FakeBridge, store populated with correct state, all in vitest — the hypothesis is validated. The rest of the napkins can build on this foundation.

If it doesn't pass, we'll know within the first smoke test, not after building the full stack.
