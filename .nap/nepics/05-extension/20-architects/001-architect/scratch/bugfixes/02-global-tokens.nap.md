# global tokens — per-session → chrome.storage.sync

* the bug
  * tokens stored in per-session Zustand store (keyed by state-key)
  * switch PR = new session = tokens gone
  * user re-enters tokens for every PR

* the fix
  * move githubToken + gitlabToken to chrome.storage.sync
  * global, not per-session. set once, survives across all PRs.
  * on boot: read from chrome.storage.sync before creating session
  * settings UI writes to chrome.storage.sync, not store
  * model/git-command reads from chrome.storage.sync (or a global ref)

* what changes
  * store.ts: remove githubToken, gitlabToken from state + partialize
  * index.tsx: read tokens from chrome.storage.sync on mount
  * settings UI: save to chrome.storage.sync
  * model.ts: getAuth reads from chrome.storage.sync (or passed-in ref)
  * pr-diff.ts: same — reads global github token

* what doesn't change
  * session isolation (LFS, nav, tabs, focused card — still per-session)
  * provider registry
  * token format (same PATs)
