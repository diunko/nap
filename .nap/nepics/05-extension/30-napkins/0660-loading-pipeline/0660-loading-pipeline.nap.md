# loading pipeline — explicit steps, transparent status, clean failure

* the problem
  * panel boot is an implicit pipeline — guards align, callbacks fire, errors swallow
  * user sees "cloning..." forever when anything fails
  * terminal has the error but is hidden behind editor tab
  * no indication what went wrong or what to do

* the fix: explicit pipeline
  * ordered steps, each with a name and an async function
  * pipeline runner executes them in sequence
  * loading gate UI shows a step list: checkmarks / spinner / error+hint
  * every error has retry — user fixes the input, clicks retry

* components
  * pipeline runner
    * runs steps in order
    * tracks state
    * exposes retry(stepIndex) and retryAll()
  * step
    * async function
    * returns `{ ok }` or `{ error, hint }`
    * no retryable flag — every error has retry
      * hint tells user what to fix
    * owns its business logic
    * provides cleanup() for retry-all
      * called before re-running the step
      * removes own staging artifacts
  * staging
    * `.tmp-{name}` dirs, invisible to scanner
    * clone there, rename on success
    * new attempt = new staging dir
  * pipeline state
    * `{ steps[], currentStep, status, error }`
    * ephemeral (ref, not persisted)
    * panel close = gone
  * loading gate UI
    * reads pipeline state
    * renders step list
      * checkmark / spinner / error+hint+retry

* the steps
  * parse URL → extract config
  * create session → LFS + store + model
  * init filesystem → mkdir /home/user
  * start terminal → wterm + shell
  * check existing repos → scan IDB (skip clone if found)
  * clone (if needed) → staging dir → git clone → rename
  * scan repo → find nepic root
  * load nav → parseNavTree → store
  * fetch PR diff → GitHub API (skip if not PR)

* workflows
  * fresh visit
    * parse → session → init → shell
    * → clone (staging → rename) → scan → nav → diff fetch
  * return visit
    * parse → session → init → shell
    * → scan finds repo → skip clone → nav → diff fetch
  * auth failure
    * clone → 401 → error ("enter token")
    * user enters → retry → fresh staging → clone
  * network failure
    * clone → fetch error → error ("check connection")
    * user fixes → retry
  * mid-flight close
    * staging dir left behind
    * next boot ignores it (dotfile)
    * fresh pipeline, fresh staging
  * wrong repo
    * clone succeeds → scan finds no nepics/
    * error ("not a .nap repo")

* invariants
  * user never sees partial state
    * staging invisible, rename atomic
  * retry = fresh attempt
    * new staging dir, zero carry-over
  * pipeline state is ephemeral
    * not persisted, restart on reopen
  * every error has retry
    * hint tells user what to fix
    * user fixes, clicks retry
  * side effects contained until committed
    * staging pattern

* what changes
  * model.ts: replace checkAutoClone/guards with pipeline runner
  * index.tsx: loading gate component replaces boot-gate
  * Sidebar.tsx: remove cloningStatus loading state (pipeline owns it)
  * new: pipeline.ts (runner + state)
  * new: loading-gate.tsx (UI component)

* what doesn't change
  * session isolation, store, nav tree, editor, terminal
  * git-command.ts, fs-adapter.ts, shell.ts
  * link routing, diff ranges
