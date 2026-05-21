


* //DU: some thoughts:
  * simple steps focusing on business logic
    * errors report if it's retriable or not
  * ui that shows transparent and simple status
    * static nice list of steps and status of each
      * leads to having both state and ui transparent and nice
  * mid-flight close doesn't break things
    * leverage "atomic" state management that guards the intermediate state
    * mid-step failure
      * happen in tmp "staging" area invisible to outside world
      * e.g. just name it .tmp-<repo-name> while cloning
        * when that succeeded:
          * do "atomically":
            * move the repo
            * report success
            * // yeah, i know, this is mostly faking the transaction
            * // but we don't have cas and transactions for things like that
            * // or what would be the most simple pragmatic equivalent of 
              * // of kinda transaction mechanics?
        * user sees:
          * step state = not started
          * step state = in-progress (atomic enter)
            * <cloning>... => until it errored out or succeeded
          * step state = error
            * user sees description with {retry} button
              * (e.g. auth failure)
              * (e.g. no connection)
            * user fixes inputs
              * (enter tokens)
              * (connect to wifi)
            * user clicks {retry} -> step state = not started 
              * back to started
          * step state = success
            * checkmark on that step
          * go to next one
  * simple retry + ui transparency strategy

* //A:
  * components
    * pipeline runner — runs steps in order, tracks state, exposes retry(stepIndex)
    * step — async function returning `{ ok } | { error, hint, retryable }`. owns its business logic.
    * staging — `.tmp-{name}` dirs invisible to scanner. clone there, rename on success. new attempt = new staging dir.
    * pipeline state — `{ steps[], currentStep, status, error }`. ephemeral (ref, not persisted). panel close = gone.
    * loading gate UI — reads pipeline state, renders step list with checkmarks / spinner / error+retry
  * workflows
    * fresh visit: parse → session → init → shell → clone (staging → rename) → scan → nav → diff fetch
    * return visit: parse → session → init → shell → scan finds repo → skip clone → nav → diff fetch
    * auth failure: clone → 401 → error (retryable, "enter token") → user enters → retry → clone again (fresh staging)
    * network failure: clone → fetch error → error (retryable, "check connection") → user fixes → retry
    * mid-flight close: staging dir left behind → next boot ignores it (dotfile) → fresh pipeline, fresh staging
    * wrong repo: clone succeeds → scan finds no nepics/ → error (permanent, "not a .nap repo")
  * invariants
    * user never sees partial state — staging is invisible, rename is atomic
    * retry = fresh attempt — new staging dir, zero carry-over from failed run
    * pipeline state is ephemeral — not persisted, restart from scratch on panel reopen
    * tokens are global — chrome.storage.sync, survive across sessions
    * each step's side effects are contained until explicitly committed (staging pattern)

