# fixes-03 — settings during loading + error classification

* two bugs, related
  * 1: GitLab clone without token shows "network failed" instead of "auth failed" + token form
  * 2: settings gear not accessible during loading — user stuck, can't enter tokens

* bug 1: wrong diagnostic
  * same class of bug as fixes-01 — error classification guessing wrong
  * GitLab without token → 401 → should show inline token form
  * instead showing "network failed" — the error pattern matching is wrong or incomplete
  * fix: fs-eng must capture the ACTUAL error from GitLab (not GitHub) without token
    * write a Playwright debug test: clone from gitlab.grammarly.io WITHOUT token
    * log the raw error object
    * classify based on what they see
    * the fixes-01 error capture test (fx-error-capture.test.ts) did this for GitHub
    * need the same for GitLab — different server, possibly different error shape
  * the inline token form should appear — it was built in fixes-01
    * CloneStepRenderer detects 401 + no token → shows input
    * if the error isn't classified as 401, the renderer doesn't trigger

* bug 2: settings inaccessible during loading
  * currently: header bar (with settings gear) only renders inside Panel
  * Panel only mounts after pipeline completes
  * during pipeline (loading gate visible): no header, no settings, no way to enter tokens
  * fix: move settings gear OUTSIDE the pipeline gate
    * the LoadingGate component should include a settings icon
    * or: render a minimal header above the LoadingGate with just settings gear
    * the settings overlay opens, user enters tokens, closes overlay
    * tokens are in chrome.storage.sync (global) — no session needed
    * the pipeline can then be retried with the new token

* what changes
  * LoadingGate.tsx or index.tsx: settings gear visible during loading
  * pipeline-steps.ts clone step: re-examine error classification for GitLab
  * new: Playwright debug test capturing real GitLab error without token

* what doesn't change
  * inline token form in CloneStepRenderer (already built)
  * settings overlay UI (already built)
  * global tokens in chrome.storage.sync (already built)
  * pipeline runner, retry mechanics
