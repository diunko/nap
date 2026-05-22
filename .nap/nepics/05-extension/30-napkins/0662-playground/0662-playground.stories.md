# playground — stories

## PG1: first open — see default steps

* panel boots, playground.yaml seeded on fs init
* click Playground tab
* step list renders from default YAML: parse, session, clone, scan, nav, diff
* clone step has conditions: token_present=false, network_available=true
* all steps show as pending (gray circles)
* [run] button visible

## PG2: run with a failing step

* from PG1, click [run]
* steps progress: parse ✓, session ✓
* clone step fails: "401 — enter token" (token_present is false)
* steps after clone show as pending
* [retry] button on clone step

## PG3: toggle condition, retry

* from PG2, check the "token_present" checkbox on clone step
* click [retry] on clone step
* clone runs (3s delay) → succeeds ✓
* pipeline continues: scan ✓, nav ✓, diff ✓
* all steps done

## PG4: edit YAML in editor, see changes in playground

* switch to Editor tab
* open playground.yaml
* add a new step, change a delay, add a condition
* switch to Playground tab
* step list reflects the edits (new step visible, new condition checkbox)

## PG5: invalid YAML mid-edit

* editing playground.yaml, auto-save fires with incomplete YAML
* switch to Playground tab
* shows parse error message: "invalid YAML: ..."
* continue editing, fix the syntax
* auto-save fires again
* switch to Playground — step list renders correctly

## PG6: run again after completion

* from PG3 (all done), click [run]
* fresh run — all steps reset to pending
* new config read from LFS (picks up any edits since last run)
* pipeline executes from step 0

## PG7: retry-all

* run with clone failing
* click [retry all]
* all steps reset, pipeline restarts from step 0
* conditions preserved (checkboxes stay as-is)

## PG8: multiple conditions on one step

* clone step has token_present=false AND network_available=false
* run → clone fails with first unmet condition's error
* toggle token_present → retry → fails with network error
* toggle network_available → retry → clone succeeds
