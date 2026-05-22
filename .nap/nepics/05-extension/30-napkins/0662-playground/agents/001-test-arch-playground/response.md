# Test architect response — 0662-playground

## Delivered

`0662-playground.test.md` — 15 small tests + 2 medium tests.

## Key design decisions

**The one test that matters most: PG-S13 (toggle → retry → pass).** This proves the core interaction from PG3. If this test passes, the feature works. Everything else is defense-in-depth.

**PG-S10 (live read, not snapshot) is the architectural constraint.** The spec says conditions are NOT snapshotted at run() time — they're read live at step execution. This property is what makes toggle-then-retry work. PG-S10 tests it directly by toggling mid-pipeline. If someone refactors condition reads into a snapshot, this test breaks.

**YAML parsing gets 4 tests (PG-S01..S04) because auto-save guarantees invalid input.** The user is typing in Monaco, auto-save fires every second. Incomplete YAML hitting the parser is not an edge case — it's the normal state during editing. The parser must return errors, never throw.

**Only 2 medium (Playwright) tests.** The playground reuses proven infrastructure. The small tests cover all the new logic. Medium tests only prove the wiring composes correctly — one happy path (run → fail → toggle → retry → done) and one error recovery (invalid YAML → fix → renders).

## What the fullstack engineer should know

- `parsePlaygroundYaml` must return `{ ok, config?, error? }`, never throw. Tests PG-S01..S04 rely on this contract.
- Condition state must be a mutable reference read at step execution time, not captured in a closure at `yamlToSteps` time. PG-S09 and PG-S10 enforce this.
- `DEFAULT_PLAYGROUND_YAML` must have at least one false condition. PG-S14 checks this — it's the "first run shows failure" guarantee from the napkin.
- File seeding must check existence before writing. PG-S15 prevents overwriting user edits.
