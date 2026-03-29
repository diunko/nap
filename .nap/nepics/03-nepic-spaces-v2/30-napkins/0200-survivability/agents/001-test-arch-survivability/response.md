# Test architect response — 0200 survivability

## Summary

Designed 27 test cases (17 small, 5 journey, 5 medium) covering the full survivability surface. Written to `0200-survivability.test.md`.

## Architecture decisions

**Three-layer testing strategy**:
1. Pure function tests for resume decisions (T-0200-10 through 14) — trivially fast
2. Model + FakePtySpawner integration tests for STOP→RUN and RUN→STOP (T-0200-20 through 46) — fast, fake everything
3. Medium Playwright tests for equivalence (T-0200-60 through 64) — real Electron, real ptys, real disk

**FakePtySpawner as the key abstraction**: The model doesn't spawn ptys directly. A startup coordinator reads model state, computes resume decisions (pure function), then feeds them to a PtySpawner. In tests, FakePtySpawner records calls + simulates exits. This keeps the model pure and testable.

**The v2 bug guard**: T-0200-31 and T-0200-34 specifically guard against the v2 appIsClosing bug. In v3, we simply don't write on quit — no flag needed. The small test spies on writeJSON to verify zero agent marker writes during stopApp. The medium test (T-0200-63) reads raw bytes from disk before/after quit.

## Key seams tested

- **STOP→RUN three cases**: A (resume with --resume), B (skip exited), C (fresh with --session-id + prompt, writes started=true)
- **RUN→STOP zero-mutation guarantee**: quit kills ptys, saves UI state, touches NO agent markers
- **Ephemeral vs persistent boundary**: running and done die on reload. exited and started survive.
- **Agent exit path**: runtime exit → exited=true written → next start skips. Quit exit → nothing written.
- **Full cycles**: T-0200-50 through 52 chain multiple transitions across restarts

## What I flagged for the fs-eng

11 infrastructure items in the "Test infrastructure" section. The biggest are:
- Expanding AgentState from 5 to 12 fields (id, nepicId, napkinId, parentName, parentId, started, running, done, homePath)
- FakePtySpawner with spawn recording + exit simulation
- Startup/shutdown coordinators as testable units
- Test pty command (NAP_TEST=1 → use cat/sleep instead of claude)

## Fixture design

**F8** (survivability): all three cases in one fixture — Case A (001-test-arch, 001-architect), Case B (002-fs-eng exited), Case C (001-fs-eng not started). Parent fields populated on 002-fs-eng.

**F9** (all-exited): edge case — nothing should spawn.

Both extend the existing fixture pattern from 0100/0150.
