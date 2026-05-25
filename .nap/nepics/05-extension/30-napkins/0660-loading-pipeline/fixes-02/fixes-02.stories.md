# fixes-02 — stories

## RS1: normal boot — gate step invisible

* reviewer opens panel from PR link
* pipeline runs: gate step auto-resolves (invisible) → parse → session → clone → ...
* user never sees the gate step
* same experience as before

## RS2: reset session — wipe and wait

* reviewer clicks "reset session" in settings
* panel wipes: LFS database gone, Zustand persist entry gone
* panel shows loading gate with step 0 "ready to start" and [start] button
* all other steps pending
* tokens still there (global)

## RS3: start after reset

* from RS2, reviewer clicks [start]
* pipeline runs from step 1: parse → session → clone (fresh, from network) → scan → nav
* full fresh experience, as if visiting this PR for the first time
* but tokens already entered — no auth failure

## RS4: __wipeCurrentSession__ from console

* developer opens panel console
* types `__wipeCurrentSession__()`
* same effect as clicking "reset session"
* loading gate appears with [start] button

## RS5: reset doesn't touch tokens

* reviewer has GitLab PAT entered
* clicks reset session
* re-starts pipeline → clone from GitLab → works (token still in chrome.storage.sync)
* no re-entering tokens

## RS6: playground gate step

* playground YAML has a step with `auto_start: false`
* click [run] in playground → gate step shows [start] button
* click [start] → gate step resolves → remaining steps execute
* tests the gate step behavior in isolation
