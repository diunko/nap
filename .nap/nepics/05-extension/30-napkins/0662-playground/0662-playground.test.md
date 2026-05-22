# playground — test architecture

## What's already tested (don't re-test)

* pipeline runner — 22 vitest (LP-S01..S33): sequential exec, retry, retryAll, cleanup, destroy, skip, subscribers, ctx snapshots, concurrency guard
* LoadingGate rendering — 8 Playwright: step icons, error/hint display, retry buttons, retry-all link
* auto-save — IM-03: editor write → debounce → LFS → echo suppression
* surface switching — IM-08: visibility toggle, scroll preserved

## What's new

Four seams, all testable as small tests (vitest, no browser):

1. YAML parsing — `parsePlaygroundYaml(text)` returns config or error
2. YAML → fake steps — `yamlToSteps(config, conditionState)` returns `StepDef[]`
3. Condition state lifecycle — initial from YAML, live toggles, reset on re-parse
4. File seeding — init-fs creates playground.yaml if missing

One medium test for the wiring between them in PlaygroundPane.

---

## Small tests (vitest)

### PG-S01: parsePlaygroundYaml — valid config

* flow: YAML string with 3 steps (delays, conditions, on_fail) → parse
* subsystems: js-yaml, config schema
* expected: `{ ok: true, config }` — steps array length 3, names/delays/conditions match input
* breaks: schema mismatch between YAML structure and TypeScript type, js-yaml version quirks
* verification: assert on returned config shape — step count, field values

### PG-S02: parsePlaygroundYaml — invalid YAML returns error

* flow: `"steps:\n  - name: foo\n  bar"` (invalid indentation) → parse
* subsystems: js-yaml error handling
* expected: `{ ok: false, error: string }` — error contains line info, no throw
* breaks: unhandled js-yaml exception propagates, crashes caller
* verification: assert `ok === false`, error is a string with content

### PG-S03: parsePlaygroundYaml — partial YAML (auto-save mid-edit)

* flow: `"steps:\n  - name: pa"` (incomplete, valid YAML but missing fields) → parse
* subsystems: js-yaml, schema validation
* expected: either parse error (missing required fields) or graceful partial — no crash
* breaks: auto-save fires while user is typing, incomplete content hits parser. This is the most common edge case in practice.
* verification: no throw, returns error or degraded config

### PG-S04: parsePlaygroundYaml — empty / whitespace / null-ish

* flow: `""`, `"   "`, `"---"` → parse
* subsystems: js-yaml edge cases
* expected: error, not crash. `yaml.load("")` returns `undefined` in js-yaml — must handle.
* breaks: unchecked `undefined` from yaml.load used as config object
* verification: assert `ok === false` for all inputs

### PG-S05: yamlToSteps — maps config to working StepDefs

* flow: valid PlaygroundConfig (3 steps, varying delays) → `yamlToSteps` → run each step
* subsystems: step factory, delay logic
* expected: 3 StepDefs, names match, each `run()` resolves to `{ ok: true }` (no conditions)
* breaks: wrong field mapping, delay not applied
* verification: assert names, run all steps, check ok:true. Optionally time the delay (use `vi.useFakeTimers`).

### PG-S06: yamlToSteps — condition true → step succeeds

* flow: step with `conditions: { token_present: true }`, conditionState has `token_present: true` → run
* subsystems: step run function, condition check logic
* expected: `{ ok: true }`
* breaks: condition check inverted (checking for false instead of true)
* verification: run step, assert ok

### PG-S07: yamlToSteps — condition false → step fails with on_fail

* flow: step with `conditions: { token_present: true }` and `on_fail: { token_present: { error: "401", hint: "enter token" } }`, conditionState has `token_present: false` → run
* subsystems: step run function, on_fail lookup
* expected: `{ ok: false, error: "401", hint: "enter token" }`
* breaks: wrong key lookup in on_fail map, missing error/hint fields
* verification: run step, assert error and hint match on_fail definition

### PG-S08: condition state — initial values extracted from YAML

* flow: parse YAML with step having `conditions: { token_present: false, network_available: true }` → extract initial condition state
* subsystems: config → condition state initialization
* expected: `{ "clone repo": { token_present: false, network_available: true } }`
* breaks: initial values not extracted from YAML, all default to true (masking failures)
* verification: assert condition state per step matches YAML values

### PG-S09: condition state — toggle overrides initial value

* flow: initial `token_present: false` → toggle `token_present` to `true` → step reads condition
* subsystems: condition state manager, step run function
* expected: step sees `true`, not `false`
* breaks: closure over initial value instead of live reference. Classic stale-closure bug.
* verification: toggle, run step, assert ok:true

### PG-S10: condition state — live read at execution time, not snapshot at run()

* flow: create steps with `token_present: false` → start pipeline → toggle `token_present: true` before step executes → step reads `true`
* subsystems: pipeline runner + condition state manager
* expected: step sees toggled value even though toggle happened after `run()` was called
* breaks: conditions captured in a snapshot at `run()` time. The spec says "conditions are NOT snapshotted — they're live." This is the key design property.
* verification:
  - step 0: no conditions, short delay
  - step 1: `token_present` condition, longer delay
  - after run() starts, wait for step 0 to complete, toggle token_present, let step 1 execute
  - step 1 should read the toggled value
  - use a delayed toggle (subscribe to pipeline state, toggle on step 0 done)

### PG-S11: condition state — re-run after YAML change resets conditions

* flow: parse YAML (token_present: false) → toggle to true → re-parse YAML (same or new content) → condition state resets to YAML initial (false)
* subsystems: condition state lifecycle
* expected: toggle is forgotten after re-parse
* breaks: stale condition state survives YAML re-parse. User edits YAML, expects fresh start.
* verification: toggle, re-parse, assert condition matches new YAML value (not toggled value)

### PG-S12: multiple conditions — first unmet determines error

* flow: step has `token_present: false` AND `network_available: false`, both in on_fail → run
* subsystems: condition iteration order
* expected: error from whichever condition the code checks first (iteration order of the conditions object)
* breaks: wrong iteration order, last condition wins, or error from a different condition
* verification: run step, assert error matches the expected first-failing condition. Note: JS object iteration order is insertion order — the test should match YAML definition order.

### PG-S13: toggle → retry → pass (the core interaction)

* flow: run full pipeline → step 2 fails (token_present: false) → toggle token_present to true → retry(2) → step 2 passes → pipeline continues to completion
* subsystems: pipeline runner (retry), condition state (live read), yamlToSteps
* expected: after retry, step 2 done, remaining steps done, overall done
* breaks: retry re-reads from YAML initial instead of live state. Or: retry creates new StepDefs that close over old condition state.
* verification: full pipeline flow — run, assert error, toggle, retry, assert done. This is THE test that proves the core user story (PG3).

### PG-S14: DEFAULT_PLAYGROUND_YAML is valid and parseable

* flow: parse the exported DEFAULT_PLAYGROUND_YAML constant
* subsystems: YAML constant, parser
* expected: valid config, at least 3 steps, at least one step with conditions where a condition is false (so first run shows a failure — spec says "some conditions defaulting to false")
* breaks: typo in default YAML shipped to all users. This is a regression guard.
* verification: parse, assert step count > 0, find a step with at least one false condition

### PG-S15: file seeding — creates if not exists, skips if exists

* flow: (a) adapter.exists('/home/user/playground.yaml') returns false → writeFile called with DEFAULT_PLAYGROUND_YAML. (b) adapter.exists returns true → writeFile NOT called.
* subsystems: init-fs step, adapter
* expected: idempotent seeding — never overwrites user's edited file
* breaks: missing existence check → overwrites edits. Or: wrong path.
* verification: mock adapter, run init-fs logic, assert writeFile called/not-called

---

## Medium tests (Playwright)

### PG-M01: PlaygroundPane end-to-end wiring

* flow: boot panel → switch to Playground surface → see step list → click run → see steps progress → one fails → toggle condition checkbox → click retry → step passes → pipeline completes
* subsystems: LFS read, YAML parse, condition state, pipeline runner, LoadingGate, surface switching
* expected: full PG2 + PG3 story in one test
* breaks: any wiring gap between the subsystems — wrong file path, missing subscription, checkbox doesn't update state, retry doesn't read live state
* verification: DOM assertions — step names visible, error text visible, checkbox toggleable, retry button clickable, final state all-done
* note: this is the only medium test. It's a journey test that proves the subsystems compose correctly. Individual subsystem behavior is covered by small tests above.

### PG-M02: invalid YAML → parse error displayed → fix → steps render

* flow: write broken YAML to playground.yaml → switch to Playground → see parse error message → write valid YAML → see step list
* subsystems: LFS write, adapter change event, YAML parse, PlaygroundPane re-render
* expected: parse error shown as text, not a crash. After fix, step list renders.
* breaks: error state not cleared on re-parse, or change event not subscribed
* verification: DOM assertion — error message visible, then step list visible after fix

---

## Test count

* 15 small (vitest) — pure logic, no browser, fast
* 2 medium (Playwright) — real Chrome, real component wiring

## What these tests DON'T cover (and why)

* Delay timing accuracy — not worth testing, `setTimeout` works
* Checkbox visual rendering — manual testing, CSS-level
* Monaco YAML syntax highlighting — not our code
* Surface switch animation/visibility — already covered by IM-08
* Pipeline runner internals — already covered by LP-S01..S33
