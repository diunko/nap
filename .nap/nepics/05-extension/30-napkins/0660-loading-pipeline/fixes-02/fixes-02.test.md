# fixes-02 — test architecture

Three seams: gate step (pipeline-level), session reset (IDB wipe + remount), playground auto_start. The theme: a step that blocks on user input, and a lifecycle operation that tears down and rebuilds.

---

## What changed — test implications

| Change | Seam | What breaks if wrong |
|---|---|---|
| Gate step (autoStart=true) | Pipeline runner — step 0 resolves instantly, invisible | Gate step visible on normal boot, or blocks pipeline |
| Gate step (autoStart=false) | Pipeline runner — step 0 blocks until UI callback | Promise never resolves (hung pipeline), or resolves before user click |
| Reset session | IDB wipe + React remount via key change | Stale data survives wipe, panel doesn't remount, global tokens lost |
| `__wipeCurrentSession__` | Console API → same as reset button | Wipe incomplete, no remount, or function not exposed |
| Playground auto_start | YAML parsing + yamlToSteps | `auto_start: false` ignored, or breaks existing playground steps |

---

## Layer 1: Gate step — pure logic (small, vitest)

The gate step is a `StepDef` whose `run()` returns a promise that either resolves immediately (autoStart=true) or waits for an external trigger (autoStart=false). The pipeline runner doesn't know — it's just another step. The interesting seam is the trigger mechanism.

### RS-S01: gate step autoStart=true — resolves immediately

* **flow:** `makeGateStep(true)` → pipeline runs → step 0 resolves → step 1 starts
* **subsystems:** gate step, pipeline runner
* **expected:** step 0 status=done, pipeline continues to step 1 without delay
* **where it breaks:** gate step blocks waiting for trigger even when autoStart=true
* **verification:** create pipeline with [gate(true), fakeStep], run, assert both done
* **test size:** small

### RS-S02: gate step autoStart=false — blocks pipeline

* **flow:** `makeGateStep(false)` → pipeline runs → step 0 status=running, step 1 stays pending
* **subsystems:** gate step, pipeline runner
* **expected:** pipeline state: step 0 running, step 1 pending, overall running. Pipeline's `run()` promise not yet resolved.
* **where it breaks:** step resolves immediately despite autoStart=false, or pipeline doesn't start (run() never enters exec)
* **verification:** run pipeline, check state after microtask (not awaiting run()), assert step 0 running, step 1 pending

### RS-S03: gate step triggerStart() — unblocks pipeline

* **flow:** pipeline with gate(false) + 2 more steps → run() → step 0 blocks → call triggerStart() → step 0 resolves → steps 1,2 execute
* **subsystems:** gate step trigger, pipeline runner
* **expected:** after triggerStart(), step 0 done, steps 1-2 done, overall done
* **where it breaks:** triggerStart resolves promise but pipeline doesn't continue (await not wired)
* **verification:** run pipeline (don't await), wait for step 0 running, call triggerStart(), await run(), assert all done

### RS-S04: gate step triggerStart() before run — no crash

* **flow:** create gate step, call triggerStart() before pipeline.run()
* **expected:** no error. When pipeline.run() is later called, step 0 should still auto-resolve (trigger was pre-fired).
* **where it breaks:** triggerStart() throws because resolve fn is null, or trigger is lost and step blocks forever
* **verification:** call triggerStart(), then run pipeline, assert step 0 completes
* **note:** this tests the edge case where UI races ahead of pipeline. The `startResolve` is null before run(), so `triggerStart()` must be a no-op, and the step should still block until trigger is called again after run starts.

### RS-S05: gate step name is 'ready'

* **flow:** `makeGateStep(false)` → inspect step.name
* **expected:** name is 'ready' — LoadingGate uses this to detect the gate step
* **where it breaks:** name mismatch between step def and LoadingGate detection
* **verification:** assert step.name === 'ready'

### RS-S06: gate step is just a step — retryAll resets it

* **flow:** pipeline with gate(false) + 2 steps → trigger → all done → retryAll() → gate step blocks again
* **subsystems:** pipeline runner, gate step
* **expected:** after retryAll, step 0 running (waiting for trigger), steps 1-2 pending. New triggerStart() needed.
* **where it breaks:** retryAll calls run() but gate step's promise from first run is stale — needs fresh promise
* **verification:** retryAll, check state, call triggerStart again, await, assert all done
* **note:** this is the critical test. The gate step factory must create a NEW promise on each `run()` call, not reuse the old one.

### RS-S07: pipeline with gate step — state subscriber receives 'running' for step 0

* **flow:** gate(false) pipeline → subscribe → run → subscriber fires with step 0 running
* **expected:** at least one callback with step 0 status=running, step 1 pending
* **where it breaks:** subscriber not called before step blocks, or called with wrong state
* **verification:** collect states in subscriber, assert first state has step 0 running

---

## Layer 2: Session reset (small vitest + medium Playwright)

The reset flow: wipe IDB → increment resetCount → React remounts Panel with new key → fresh pipeline with gate(false) → user clicks [start] → fresh clone.

### RS-S10: wipe function deletes correct IDB databases

* **flow:** `wipeSessionData('test-key')` → indexedDB.deleteDatabase called for `nap-fs-test-key`, Zustand persist key `nap-ui-test-key` removed
* **subsystems:** wipe function
* **expected:** correct database names derived from session key
* **where it breaks:** wrong key format, or only deletes one of the two stores
* **verification:** mock indexedDB.deleteDatabase, assert called with `nap-fs-test-key` and lock db; mock IDB transaction for kv store removal
* **test size:** small — mock IndexedDB API

### RS-S11: wipe does NOT touch chrome.storage.sync

* **flow:** wipe session → chrome.storage.sync.get → tokens still there
* **subsystems:** wipe function, chrome.storage.sync
* **expected:** globalTokens unchanged, debugMode unchanged
* **where it breaks:** wipe clears global state, or re-initializes chrome.storage
* **verification:** set tokens, wipe, assert tokens unchanged
* **note:** story RS5 — tokens survive reset. This is the unit test for that invariant.

### RS-S12: resetCount increment causes Panel remount

* **flow:** Panel has `key={session.key + '-' + resetCount}` → increment resetCount → React unmounts old Panel, mounts new
* **subsystems:** React key prop, App state
* **expected:** old session's model.destroy() called on unmount, new session created
* **where it breaks:** key doesn't change (resetCount not included), or key changes but session not recreated
* **verification:** this is primarily a React integration test — hard to unit test without React. Verify via Playwright (RS-P10).

### RS-S13: fresh pipeline after reset has gate(false)

* **flow:** reset → new pipeline created → step 0 is gate step with autoStart=false
* **subsystems:** pipeline creation in App
* **expected:** step 0 name='ready', step 0 blocks (waiting for trigger)
* **where it breaks:** reset creates pipeline with gate(true), skipping the [start] button
* **verification:** mock pipeline creation, assert first step is gate(false)

### RS-P10: reset session — full cycle (medium, Playwright)

* **flow:** normal boot → clone completes → nav populated → click "reset session" → loading gate appears with [start] button → click [start] → clone runs fresh → nav populates
* **subsystems:** settings overlay, wipe, React remount, pipeline, LoadingGate, gate step
* **expected:**
  * DOM: after reset click, loading-gate appears
  * DOM: step 0 shows "ready" with [start] button (`data-testid="gate-start"`)
  * DOM: other steps pending
  * DOM: after [start] click, steps progress (clone runs fresh from network)
  * DOM: after pipeline completes, loading-gate unmounts, Panel renders with nav
  * Store: navSections.length > 0 (fresh clone, not IDB restore)
* **where it breaks:** wipe incomplete (IDB data survives), remount doesn't happen, [start] button missing, pipeline starts with gate(true)
* **verification:** full Playwright flow with fixture repo
* **skip:** needs network (real clone)

### RS-P11: reset session preserves tokens (medium, Playwright)

* **flow:** enter GitLab token → clone succeeds → reset session → [start] → clone succeeds again (token still in chrome.storage.sync)
* **subsystems:** wipe scoping, chrome.storage.sync, gate step
* **expected:** no auth failure after reset — token persists globally
* **where it breaks:** wipe clears chrome.storage.sync, or pipeline reads token from per-session store (deleted)
* **verification:** after reset + start, clone step doesn't fail with 401
* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`, GITLAB_API_TOKEN from .env

### RS-P12: `__wipeCurrentSession__()` from console (medium, Playwright)

* **flow:** normal boot → console: `__wipeCurrentSession__()` → loading gate appears with [start]
* **subsystems:** console API, wipe, React remount
* **expected:** same as RS-P10 but triggered from console instead of settings button
* **where it breaks:** function not exposed on window, or doesn't trigger remount
* **verification:** `panel.evaluate(() => __wipeCurrentSession__())` → wait for loading-gate testid

### RS-P13: normal boot — gate step invisible (medium, Playwright)

* **flow:** normal boot (not reset) → pipeline runs → user never sees gate step or [start] button
* **subsystems:** gate step(true), LoadingGate
* **expected:**
  * DOM: no `data-testid="gate-start"` ever visible
  * DOM: step 0 completes so fast it's either invisible or shows checkmark briefly
  * DOM: pipeline proceeds to clone step
* **where it breaks:** gate step(true) still renders [start] button
* **verification:** boot panel, wait for clone step running or pipeline done, assert no gate-start button in DOM

---

## Layer 3: LoadingGate — gate step rendering (small, vitest)

### RS-S20: LoadingGate detects gate step — shows [start] button

* **flow:** pipeline with gate(false) → step 0 status=running, name='ready' → LoadingGate renders
* **subsystems:** LoadingGate, step row rendering
* **expected:** DOM: [start] button visible (`data-testid="gate-start"`)
* **where it breaks:** name check wrong ('ready' vs 'gate'), or status check wrong (looking for 'pending' not 'running')
* **verification:** render LoadingGate with mock pipeline in gate-waiting state, assert button present
* **test size:** small (vitest + jsdom or component test)

### RS-S21: LoadingGate [start] click calls triggerStart()

* **flow:** render LoadingGate → click [start] button → pipeline's gate step triggerStart called
* **subsystems:** LoadingGate, gate step trigger
* **expected:** triggerStart() invoked
* **where it breaks:** button onClick wired wrong, or calls pipeline.retry instead
* **verification:** mock triggerStart, simulate click, assert called

### RS-S22: LoadingGate — gate step done, no [start] button

* **flow:** gate step already done (autoStart=true passed through) → LoadingGate renders step 0 with checkmark, no button
* **expected:** no gate-start button, step shows checkmark
* **where it breaks:** button rendered for any step named 'ready' regardless of status
* **verification:** render with step 0 status=done, name='ready', assert no button

### RS-S23: LoadingGate — non-gate step running, no [start] button

* **flow:** step 3 (clone) is running → no [start] button (only for step named 'ready')
* **expected:** spinner for step 3, no gate-start button
* **where it breaks:** [start] button appears for any running step
* **verification:** render with step 3 running, name='cloning foo', assert no gate-start

---

## Layer 4: Playground auto_start (small, vitest)

### RS-S30: parsePlaygroundYaml parses auto_start field

* **flow:** YAML with `auto_start: false` on first step → parse → config.steps[0] has auto_start property
* **subsystems:** parsePlaygroundYaml
* **expected:** `config.steps[0].auto_start === false`
* **where it breaks:** unknown field silently dropped during parsing
* **verification:** parse YAML string, assert property present and false

### RS-S31: yamlToSteps with auto_start=false creates blocking step

* **flow:** config with auto_start=false on step 0 → yamlToSteps → run pipeline → step 0 blocks
* **subsystems:** yamlToSteps, gate pattern
* **expected:** step 0 run() returns a promise that doesn't resolve immediately
* **where it breaks:** auto_start not wired into yamlToSteps, step resolves normally
* **verification:** create pipeline from yamlToSteps output, run (don't await), check step 0 running after microtask

### RS-S32: yamlToSteps without auto_start — step runs normally

* **flow:** config with NO auto_start on step 0 → yamlToSteps → run → step resolves immediately
* **expected:** step 0 done, pipeline continues
* **where it breaks:** all steps treated as gate steps
* **verification:** run pipeline, assert step 0 done

### RS-S33: yamlToSteps auto_start=true — step runs normally

* **flow:** config with `auto_start: true` → yamlToSteps → step resolves immediately
* **expected:** same as no auto_start — step runs normally
* **where it breaks:** `auto_start: true` treated same as `auto_start: false`
* **verification:** run pipeline, assert step 0 done

### RS-S34: playground default YAML — existing steps unchanged

* **flow:** parse DEFAULT_PLAYGROUND_YAML → yamlToSteps → run → steps execute with delays + conditions as before
* **expected:** no regression — conditions (token_present, network_available) still work
* **where it breaks:** auto_start change breaks condition parsing
* **verification:** parse default YAML, check all steps have expected names and conditions

---

## Existing test impact

| Existing test | Action | Reason |
|---|---|---|
| `pipeline.test.ts` LP-S01..S10 | **keep** | Pipeline runner unchanged — gate step is just a step. |
| `pipeline.test.ts` LP-S20..S28 | **keep** | Step failure injection unchanged. |
| `pg-playground.test.ts` PG-P01..P06 | **adapt** | If default YAML gains an `auto_start: false` gate step, PG-P01 may need to account for the [start] button. But napkin says playground already has [run] — gate step in playground is for testing, not default. Verify default YAML doesn't change. |
| `pb-panel-boot.test.ts` PB-P01..P08 | **adapt PB-P04, PB-P05** | Normal boot now has gate step(true) as step 0. Step indices shift by 1 for any test counting steps. Gate step should be invisible. |
| `im-01-clone-nav.test.ts` IM-01 | **keep** | Waits for navSections, not step indices. Gate(true) is invisible. |
| `gl-gitlab-support.test.ts` GL-M01 | **adapt** | If reset mechanism changes session injection, update accordingly. |

---

## Properties

### RS-S40: gate step is idempotent — multiple triggerStart calls don't break

* **property:** calling triggerStart() N times (N>1) while step is running does not cause errors or double-resolution
* **flow:** gate(false) → run → triggerStart() → triggerStart() → triggerStart()
* **expected:** step resolves once, no errors
* **where it breaks:** second call to resolve() throws, or resolves a different promise
* **verification:** call triggerStart 3 times, assert step 0 done, no thrown errors

### RS-S41: reset + normal boot are distinguishable by gate step behavior

* **property:** after reset, pipeline always waits for user. On normal boot, pipeline never waits.
* **method:** create pipeline with gate(true), verify instant completion. Create with gate(false), verify blocked.
* **where it breaks:** autoStart flag not passed through, or always one value

---

## Test execution plan

1. **RS-S01..S07** (gate step pure logic) — first. This validates the new step type works with the existing pipeline runner.
2. **RS-S20..S23** (LoadingGate rendering) — second. Gate step UI renders correctly.
3. **RS-S30..S34** (playground auto_start) — in parallel with above. Independent.
4. **RS-S10..S13** (session reset logic) — third. Wipe + remount mechanics.
5. **RS-P13** (normal boot invisible) — fourth. Regression check — gate step doesn't break existing boot.
6. **RS-P10..P12** (reset Playwright) — last. Full cycle with real clone.
