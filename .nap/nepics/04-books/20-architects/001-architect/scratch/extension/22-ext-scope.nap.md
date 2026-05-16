# extension scope

* v0 — side panel reader + ephemeral editing
  * Chrome side panel on GitHub PR pages
  * loads mini-book .md from repo via GitHub API
    * // should load from folder
      * // books are numbered files, should sort accordingly
  * Monaco with napkin-markdown tokenizer
  * Cmd+J rendered/edit toggle
  * file:line links → navigate PR diff in main tab
  * .md links → navigate between chapters in panel
  * edits in memory only, gone on reload

* v1 — persistence + commit
  * localStorage drafts (survive browser restart)
    * // should be some way to manage model persistnce and map it to local storage
  * GitHub API commit (one clean commit to PR branch)
  * auth via chrome.identity OAuth or PAT
    * // just use api token

* v2 — workflowy mode
  * zoom into subtree via setHiddenAreas()
  * breadcrumbs for navigation back
  * #tag and @agent tokens
  * tab/shift-tab indent whole subtree

* v3 — rich editing
  * bullet anchors + cross-file linking
  * diff layers (agent commit vs user edits)
  * AI summary per subtree
  * search-then-zoom / filtering

* v4 — collaboration + beyond
  * concurrent cursors (git-based or WebSocket)
  * presentation mode
  * version diffing between napkin iterations
  * reactions/voting on bullets
