# loading pipeline — stories

## LP1: fresh visit — all steps succeed

* reviewer clicks link with #nap-repo hash
* panel opens, loading gate shows step list
* steps progress: parse ✓, session ✓, init ✓, terminal ✓, clone ⟳...
* clone step shows "cloning gitlab.grammarly.io/org/repo..."
* clone completes ✓, scan ✓, nav ✓, diff fetch ✓
* loading gate disappears, normal panel appears
* nav focused on the URL napkin

## LP2: return visit — clone skipped

* same link, panel reopened
* loading gate appears briefly
* parse ✓, session ✓, init ✓, terminal ✓, scan ✓ (found repo), clone ✓ (skipped)
* nav ✓, diff fetch ✓
* panel appears in under 1 second

## LP3: auth failure — enter token, retry

* fresh visit, private .nap repo, no token entered
* steps progress until clone: parse ✓, session ✓, init ✓, terminal ✓
* clone ✗ — "authentication failed — enter your GitLab token in settings"
* [retry] button visible
* reviewer clicks settings gear, enters token, saves
* reviewer clicks [retry]
* clone ⟳... ✓, scan ✓, nav ✓
* panel appears

## LP4: network failure — fix network, retry

* fresh visit, host unreachable (no VPN)
* clone ✗ — "can't reach gitlab.grammarly.io — check your network or VPN"
* reviewer connects VPN
* clicks [retry]
* clone ✓, continues

## LP5: wrong repo — no .nap structure

* clone succeeds but repo has no nepics/ directory
* scan ✗ — "cloned repo but no .nap structure found"
* [retry] available (maybe author pushed the structure since)

## LP6: mid-flight close

* clone step in progress (spinner showing)
* reviewer closes panel
* reopens panel → fresh pipeline, no partial state
* staging dir (.tmp-*) from previous attempt is invisible
* clone runs again from scratch

## LP7: retry all

* clone fails, user clicks [retry all]
* all completed steps cleaned up
* pipeline restarts from step 0
* everything fresh

## LP8: step list is transparent

* at any point during loading, the user can see:
  * which steps completed (checkmarks)
  * which step is active (spinner + description)
  * if something failed (error + hint + retry)
* no "cloning..." forever. no gray screen. no guessing.
