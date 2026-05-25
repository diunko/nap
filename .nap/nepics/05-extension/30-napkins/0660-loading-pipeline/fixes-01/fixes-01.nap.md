# loading polish — debug flag, global tokens, error classification, inline token form

* four fixes, one napkin
  * global debug flag
  * global tokens (not per-session)
  * correct error classification for 401
  * inline token form in loading gate on auth failure

* global debug flag
  * `chrome.storage.sync` boolean: `debugMode`
  * when on: Playground tab visible, future debug features
  * when off: Playground tab hidden
  * toggle: settings gear → checkbox, or console `chrome.storage.sync.set({ debugMode: true })`
  * not in Zustand — global, not per-session

* global tokens
  * move `githubToken` + `gitlabToken` from per-session Zustand to `chrome.storage.sync`
  * read on boot, before session creation
  * available to all sessions — no re-entering on PR switch
  * settings UI writes to `chrome.storage.sync`
  * pipeline steps read from `chrome.storage.sync` (or a global ref passed through ctx)
  * see: `.nap/nepics/05-extension/20-architects/001-architect/scratch/bugfixes/30-global-tokens.nap.md`

* correct error classification
  * the problem: GitLab 401 shows "no network" in loading gate
  * the cause: clone step guesses error type from string matching, gets it wrong
  * the fix: DON'T GUESS
    * fs-eng writes a Playwright debug test that clones from GitLab with and without token
    * captures the actual isomorphic-git error object
    * logs it — sees the real structure (HttpError? status code? message format?)
    * then classifies based on what they actually see
    * token is in `.env` (GITLAB_API_TOKEN)
  * isomorphic-git errors for HTTP failures include status codes
    * the step should check the status code, not pattern-match the message

* inline token form in loading gate
  * when clone or fetch-diff fails with 401 and no token set:
    * loading gate shows a token input field right on the step
    * not "go to settings" — the form is RIGHT THERE
    * user enters token, clicks save+retry, pipeline continues
  * custom components per step, matched by step name:
    ```typescript
    const STEP_RENDERERS: Record<string, React.FC<StepRenderProps>> = {
      'clone': CloneStepRenderer,
      'fetch-diff': FetchDiffStepRenderer,
    };
    ```
  * default renderer: text + hint + retry (current behavior)
  * clone/fetch-diff renderer: token form + retry
  * the component knows github vs gitlab from `ctx.config.provider`
    * shows "GitHub PAT" or "GitLab PAT" label accordingly
  * on token save:
    * write to `chrome.storage.sync` (global)
    * update the global token ref (so retry reads the new token)
    * auto-retry the step

* what changes
  * store.ts: remove githubToken/gitlabToken from state + partialize
  * pipeline-steps.ts: clone + fetch-diff steps read tokens from global ref (not store)
  * LoadingGate.tsx: step renderer dispatch by name, custom components
  * index.tsx: read tokens from chrome.storage.sync on boot, pass through pipeline ctx
  * settings UI: write tokens to chrome.storage.sync, read debug flag
  * new: CloneStepRenderer.tsx, FetchDiffStepRenderer.tsx

* what doesn't change
  * pipeline runner, step interface, retry mechanics
  * session isolation (LFS + nav + tabs still per-session)
  * editor, terminal, playground, nav tree
