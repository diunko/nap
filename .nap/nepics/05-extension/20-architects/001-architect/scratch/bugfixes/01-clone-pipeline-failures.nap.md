# clone pipeline — every step, who owns it, what fails

* step 1: panel boot → parse URL
  * owner: `boot-gate.ts` (resolveBootState) + `url-config.ts` (parseNapHash)
  * input: tab URL from `chrome.tabs.query`
  * output: `BootState` — `session` (with config) or `no-hash` or `wrong-page`
  * failures:
    * no hash → "ask author for a review link" (handled, user sees message)
    * malformed hash (missing nap-repo) → same as no hash? or silent broken config?
      * current: `parseNapHash` returns null → `no-hash` state → message shown
    * unknown provider key → `buildCloneUrl` throws later (step 6), not caught here
  * status: mostly handled. malformed hash edge cases could be tighter.

* step 2: session creation
  * owner: `session.ts` (createSession) + `index.tsx` (App)
  * input: state-key + config from step 1
  * output: `Session` — LightningFS + store + adapter + model
  * failures:
    * IDB creation fails → LightningFS constructor throws
    * extremely unlikely unless browser storage is full
  * status: unhandled. no error UI.

* step 3: model init
  * owner: `model.ts` (init)
  * input: adapter, store
  * output: `/home/user` created, existing repos scanned
  * failures:
    * mkdir fails → LFS internal error (extremely unlikely)
    * scanExistingRepos fails → no nepic root → ok for fresh session
  * status: handled (no repos = fresh session, auto-clone will fire)

* step 4: shell registers
  * owner: `TerminalPane.tsx` → `model.ts` (registerShell)
  * input: wterm instance + BashShell created
  * output: `shellExec` function available to model
  * failures:
    * wterm WASM fails to load → terminal blank, shell never registers
    * just-bash import fails → same
    * these are fatal — no shell = no clone, no terminal
  * status: unhandled. terminal shows blank, model never gets shellExec, auto-clone never fires. user sees loading forever.

* step 5: auto-clone guards
  * owner: `model.ts` (checkAutoClone)
  * input: `initComplete` (from step 3) + `shellExec` (from step 4) + `!cloneTriggered` + `!nepicRoot`
  * output: fires `shell.exec('git clone <url>')` or does nothing
  * failures:
    * guard never completes → clone never fires → loading forever
    * `nepicRoot` already set (return visit) → clone skipped (correct)
    * `cloneTriggered` already true (double fire) → skipped (correct)
  * status: no timeout. if shell never registers, user waits forever.

* step 6: build clone URL
  * owner: `url-config.ts` (buildCloneUrl)
  * input: provider + owner + repo from config
  * output: `https://{hostname}/{owner}/{repo}.git`
  * failures:
    * unknown provider → throws Error
    * caught inside model's auto-clone → goes where? swallowed?
  * status: error thrown but may be swallowed by the model's try/catch

* step 7: git clone execution ← MOST FAILURES HAPPEN HERE
  * owner: `git-command.ts` (clone subcommand) + `shell.ts` (exec)
  * input: clone URL + onAuth callback
  * output: repo in LightningFS, terminal shows "done." or error
  * failures:
    * **401 — no token or wrong token** (private repo)
      * onAuth returns undefined (no token set) → isomorphic-git sends no credentials → 401
      * onAuth returns wrong token → 401
      * terminal shows: `fatal: Authentication failed`
      * user sees: terminal output (but terminal is hidden behind editor tab)
    * **404 — repo doesn't exist**
      * terminal shows: `fatal: repository not found`
    * **network error — host unreachable**
      * gitlab.grammarly.io requires VPN
      * terminal shows: `fatal: unable to connect` or fetch error
    * **CORS blocked — missing host_permissions**
      * shouldn't happen (permissions in manifest) but possible for new hosts
    * **timeout — slow network, large repo**
      * isomorphic-git has no built-in timeout
  * status: ALL failures are silent. terminal has the error but terminal is hidden. nav shows "cloning..." forever. no error propagated to the UI.

* step 8: onCommandComplete → scan → refresh nav
  * owner: `model.ts` (onCommandComplete, findNepicRoot, refreshNav)
  * input: completed command string from shell
  * output: nepicRoot set, navSections populated, focusedCardSlug set
  * failures:
    * clone succeeded but repo has wrong structure (no nepics/) → no nepic root → nav empty
    * clone succeeded, nepics/ exists, but parseNavTree fails → nav empty
    * clone succeeded, nav populates, but napkin from URL not found → no focus
  * status: partial. if findNepicRoot returns null, cloningStatus stays 'cloning'. no error message.

* step 9: UI update
  * owner: `store.ts` + React (Sidebar, HeaderBar)
  * input: cloningStatus, navSections, focusedCardSlug
  * output: nav tree renders, napkin focused, "cloning..." disappears
  * failures:
    * cloningStatus never set to 'done' → loading forever
    * navSections empty → nav renders but empty (no cards)
  * status: dependent on step 8. no independent failure mode.

---

## the token problem

* tokens are per-session (Zustand persist, keyed by state-key)
* switch PR = new session = empty tokens
* user re-enters tokens every time they switch PRs
* fix: global tokens in chrome.storage.sync, read on boot, not tied to session

## the silent failure problem

* every failure in steps 4-8 results in: nav shows "cloning..." forever
* the terminal has the error message but is hidden (editor surface is default)
* the user has no way to know what went wrong without manually switching to terminal
* fix: model tracks clone result, propagates error to store, UI shows error message

## what the error UI should show

* step 7 failures (most common):
  * 401: "clone failed — authentication required. enter your {provider} token in settings ⚙️"
  * 404: "clone failed — repository not found. check the review link."
  * network: "clone failed — can't reach {hostname}. check your VPN or network."
* step 4 failure (rare):
  * "terminal failed to initialize. try reloading the panel."
* step 8 failure (wrong repo structure):
  * "cloned {repo} but no .nap structure found. the repo may not be a .nap repository."
