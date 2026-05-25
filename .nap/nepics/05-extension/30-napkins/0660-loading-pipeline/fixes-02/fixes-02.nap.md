# fixes-02 — gate step, reset session, wipe API

* gate step — step 0 in the pipeline
  * controls whether pipeline auto-runs or waits for user
  * `makeGateStep(autoStart: boolean)`
  * autoStart=true: resolves immediately, invisible (normal boot)
  * autoStart=false: shows [start] button, waits for user click
  * the step's `run()` returns a promise resolved by the UI callback
  * no new state branches anywhere — just a step that waits

* reset session
  * button in settings overlay or header: "reset session"
  * wipe per-session data:
    * delete LFS IDB database for this session key
    * delete Zustand persist entry for this session key
  * does NOT touch global data (tokens, debug flag in chrome.storage.sync)
  * after wipe: recreate session with same key
    * gate step has autoStart=false
    * pipeline shows loading gate, step 0 "ready" with [start] button
    * user clicks [start] → pipeline runs → clones fresh
  * implementation: wipe IDB → bump reset counter → `key={session.key + '-' + resetCount}`
    * React remounts Panel, fresh pipeline with gate step waiting

* __wipeCurrentSession__ console API
  * restore this (was removed in 0651)
  * same as reset button: wipe IDB + recreate with gate step waiting
  * useful for debugging

* playground
  * gate step configurable in YAML: `auto_start` flag on the first step
  * `auto_start: true` → step resolves immediately (default, same as before)
  * `auto_start: false` → step shows [start] button, waits for click
  * playground default YAML gets a gate step with `auto_start: false`
    * so the playground always waits for the user to click run
    * wait, we already have [run] in the playground — is the gate step redundant there?
    * //A: yes, playground already has a [run] button that creates+runs the pipeline
    * //A: the gate step in playground is for testing the gate step itself
    * //A: playground YAML can include it to simulate the reset flow

* what changes
  * pipeline-steps.ts: new makeGateStep(autoStart)
  * index.tsx: gate step as first step, reset handler, resetCount state
  * LoadingGate.tsx: gate step renderer — [start] button when step 0 is pending
  * settings overlay: "reset session" button
  * console: __wipeCurrentSession__ restored
  * playground.ts: auto_start flag in YAML parsing

* what doesn't change
  * pipeline runner (steps are steps — gate step is just another step)
  * session isolation, store, model
  * editor, terminal, nav tree
  * global tokens, debug flag
