# fixes-01 — stories

## FX1: global debug flag hides playground

* debug flag off (default)
* playground tab not visible in tab bar
* turn on: settings → debug checkbox, or console `chrome.storage.sync.set({ debugMode: true })`
* playground tab appears
* survives panel close/reopen

## FX2: tokens survive PR switch

* enter GitLab PAT in settings
* open PR 42 → clone from GitLab → works
* navigate to PR 87 → new session
* clone from GitLab → works (token still there, not re-entered)
* tokens are global, not per-session

## FX3: GitLab 401 shows correct error

* clone from GitLab with no token
* loading gate clone step shows: "authentication failed" (not "no network")
* hint: "enter your GitLab PAT"
* the error message matches the actual HTTP 401, not a string guess

## FX4: inline token form on auth failure

* clone fails with 401 (no token)
* loading gate shows a PAT input field right on the clone step
* field label: "GitLab PAT" (knows the provider from config)
* user enters token, clicks save
* token saved to chrome.storage.sync (global)
* step auto-retries → clone succeeds → pipeline continues

## FX5: inline token form for diff fetch

* clone succeeds (public .nap repo, no token needed)
* fetch-diff step fails with 401 (private code repo, no GitHub token)
* loading gate shows "GitHub PAT" input on the fetch-diff step
* user enters token → save → auto-retry → diff ranges fetched

## FX6: token form shows correct provider label

* GitLab .nap repo → clone step form says "GitLab PAT"
* GitHub .nap repo → clone step form says "GitHub PAT"
* fetch-diff always says "GitHub PAT" (code repo is always on GitHub)
