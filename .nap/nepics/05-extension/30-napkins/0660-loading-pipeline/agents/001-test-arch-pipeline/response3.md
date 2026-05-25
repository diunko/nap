# Test architect response — fixes-02

## What I produced

`fixes-02/fixes-02.test.md` — 28 test cases across 4 layers + 2 properties.

## Architecture summary

**The central insight: the gate step is just a step.**

The pipeline runner doesn't change. `makeGateStep(autoStart)` returns a `StepDef` whose `run()` either resolves immediately or returns a promise resolved by an external `triggerStart()` callback. The LoadingGate detects `name === 'ready'` + `status === 'running'` and renders a [start] button. Everything else — retry, retryAll, cleanup, state transitions — works unchanged.

The hard part is the lifecycle: `triggerStart()` exposes a resolve function from inside a promise. Three things can go wrong:
1. **Stale promise on retryAll** — if gate step reuses the promise from the first run, retryAll blocks forever. RS-S06 tests this: after retryAll, a fresh `triggerStart()` must be needed.
2. **Race: trigger before run** — RS-S04 tests calling `triggerStart()` before `run()`. The resolve fn is null → must be a no-op, not a crash.
3. **Multiple triggers** — RS-S40 tests idempotency. Calling `triggerStart()` 3 times must not throw or double-resolve.

**4 layers:**

1. **Gate step pure logic** (7 vitest) — autoStart true/false, trigger mechanics, retryAll creates fresh promise, subscriber sees running state
2. **Session reset** (4 vitest + 4 Playwright) — IDB wipe targets correct databases, doesn't touch chrome.storage.sync (tokens survive), resetCount causes React remount, fresh pipeline has gate(false)
3. **LoadingGate rendering** (4 vitest) — [start] button appears only for step named 'ready' in 'running' status, click calls triggerStart, no button when done or for other steps
4. **Playground auto_start** (5 vitest) — YAML parsing picks up field, yamlToSteps creates blocking step for false, existing conditions unchanged

## Key design decisions for fs-eng

**Gate step must create a fresh promise on every `run()` call.** The spec shows a closure with `let startResolve`. This works for a single run, but on `retryAll` the pipeline calls `run()` again → needs a new promise. The factory can't capture the promise at construction time; it must create it inside `run()`.

**`triggerStart()` must be idempotent and null-safe.** Before `run()`, `startResolve` is null → no-op. After resolution, calling it again → no-op (promise already resolved).

**LoadingGate detection: name + status, not step index.** The gate step is step 0 today, but detection should be `name === 'ready' && status === 'running'`, not `index === 0`. This survives reordering.

## What existing tests need

- **PB-P04/PB-P05 (Playwright)**: step indices shift +1 if counting steps. But these tests wait for navSections or cloningStatus, not step indices — should be fine.
- **PG-P01..P06 (Playground)**: only affected if DEFAULT_PLAYGROUND_YAML adds a gate step. Napkin says it doesn't (playground already has [run]). Verify.
- Everything else: unchanged. Gate step is invisible on normal boot.

## Execution order

1. RS-S01..S07 (gate step) + RS-S30..S34 (playground) — in parallel, both pure logic
2. RS-S20..S23 (LoadingGate rendering)
3. RS-S10..S13 (reset logic)
4. RS-P13 (normal boot regression) — before reset tests
5. RS-P10..P12 (reset Playwright) — last, needs network
