# playground — interactive pipeline testing surface

* what: a tab where you edit pipeline step config and watch it run
  * edit playground.yaml in the editor (regular tab, yaml language)
  * switch to Playground tab → see step list with per-step condition checkboxes
  * click run → pipeline executes with configured delays and conditions
  * toggle conditions mid-run → retry → see different outcomes

* the file
  * `/home/user/playground.yaml` — seeded on fs init (pipeline step 3)
  * edited in the regular Monaco editor like any file
  * auto-save writes to LFS (1s debounce)
  * may be invalid YAML mid-edit — playground handles parse errors gracefully

* the format
  ```yaml
  steps:
    - name: parse URL
      delay: 200

    - name: clone repo
      delay: 3000
      conditions:
        token_present: false
        network_available: true
      on_fail:
        token_present: { error: "401", hint: "enter token" }
        network_available: { error: "network error", hint: "check VPN" }

    - name: scan repo
      delay: 200
      conditions:
        has_nepics: true
      on_fail:
        has_nepics: { error: "no .nap structure", hint: "wrong repo" }
  ```

* inputs (true events that change state)
  * playground.yaml content — changes on auto-save (may be partial/invalid)
  * "run" click — execute current config
  * "retry" click on a step — re-run that step
  * per-step condition toggles — checkboxes in the playground UI

* derived state
  * config: valid parsed YAML | parse error
    * re-parsed on every LFS change
    * if invalid: show parse error in playground, don't crash
  * step list: names + conditions + delays from config
  * condition state: per-step, per-condition boolean
    * editable via checkboxes in the UI
    * also set by YAML (initial values)
    * checkboxes are live — YAML sets initial, user overrides via toggles

* run state
  * null (no run yet) → show step list from config, all pending
  * "run" clicked → snapshot config (step defs + delays) → execute
    * conditions are NOT snapshotted — they're live
    * step checks its conditions at execution time
    * all conditions true → wait delay → ok
    * any condition false → return error from on_fail for that condition
  * steps transition: pending → running → done | error
  * "retry" → re-run that step with CURRENT condition values
    * user toggles condition, clicks retry → step may now pass

* what the playground tab shows
  * vertical step list (same LoadingGate component, reused)
  * each step has:
    * status indicator (pending/running/done/error)
    * name
    * condition checkboxes (inline, per-step)
    * if error: message + hint
  * controls:
    * [run] button — starts/restarts the pipeline
    * [retry] on failed steps
    * [retry all] at bottom
  * if YAML parse error: show error message instead of step list

* the tab
  * third surface: Editor | Terminal | Playground
  * same visibility toggle pattern as editor/terminal
  * always available — doesn't require a cloned repo

* fs init seeding
  * pipeline step 3 (init-fs) creates `/home/user/playground.yaml` if not exists
  * default content: a representative pipeline matching the real boot steps
  * with some conditions defaulting to false (so user sees failure on first run)

* dependencies
  * `js-yaml` for parsing (~30KB)
  * LoadingGate component (reused from 0660)
  * pipeline runner (reused from 0660)
