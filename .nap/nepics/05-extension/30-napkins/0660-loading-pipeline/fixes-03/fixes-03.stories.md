# fixes-03 — stories

## FX31: GitLab 401 → inline token form

* open panel with `#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap`
* no GitLab token entered
* clone fails → loading gate shows "authentication failed" (NOT "network failed")
* inline token form appears: "GitLab PAT" label + input field
* user enters token → save & retry → clone succeeds

## FX32: settings accessible during loading

* panel opens, loading gate visible (pipeline running or errored)
* settings gear icon visible somewhere on the loading screen
* click → settings overlay opens
* enter GitLab PAT + hostname → save → overlay closes
* click retry on the failed step → clone succeeds with new token

## FX33: settings accessible when pipeline errored

* clone fails with 401, loading gate shows error
* BOTH paths work:
  * inline token form on the step itself (quick path)
  * settings gear → full settings overlay (workaround path)
* either path: enter token → retry → works

## FX34: settings during successful loading

* pipeline running (steps progressing with spinners)
* settings gear still visible — user can click it even during loading
* opening settings doesn't interrupt the pipeline
