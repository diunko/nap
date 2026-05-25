# fixes-01 — spec

## Global debug flag

* `chrome.storage.sync.get('debugMode')` — boolean, default false
* read on panel boot (before session creation)
* controls: Playground tab visibility
* toggle in settings overlay: debug mode checkbox
* not in Zustand — global, survives across sessions

## Global tokens

* move `githubToken` + `gitlabToken` from per-session Zustand to `chrome.storage.sync`
* keys: `githubToken`, `gitlabToken`
* read on boot, passed through pipeline ctx
* pipeline steps (clone, fetch-diff) read from ctx, not store
* settings UI reads/writes chrome.storage.sync
* remove from store.ts state, PARTIALIZE, actions

## Error classification — don't guess, observe

Before classifying errors in the clone step, the fs-eng MUST:
1. Write a Playwright test that clones from gitlab.grammarly.io WITHOUT a token
2. Capture the actual error: `console.log(JSON.stringify(error))` in the catch block
3. Read the Playwright output to see the real error structure
4. THEN write the classification logic based on what they observed

The token is in `.env` (GITLAB_API_TOKEN). The test toggles between with-token and without-token.

isomorphic-git HTTP errors typically include a `statusCode` property on the Error object. Check for that first. Fall back to message matching only if statusCode is absent.

## Custom step renderers in LoadingGate

```typescript
interface StepRenderProps {
  step: StepState;
  ctx: Record<string, any>;
  onRetry: () => void;
}

const STEP_RENDERERS: Record<string, React.FC<StepRenderProps>> = {
  'clone': CloneStepRenderer,
  'fetch-diff': FetchDiffStepRenderer,
};
```

Default renderer: error text + hint + [retry] button (current).

CloneStepRenderer (on 401 with no token):
* PAT input field
* label from `ctx.config.provider`: "GitLab PAT" or "GitHub PAT"
* [save & retry] button
* save writes to `chrome.storage.sync`, then calls `onRetry()`

FetchDiffStepRenderer (on 401):
* same pattern, always "GitHub PAT" (code repo is GitHub)

When token exists but 401 still: show "authentication failed — check your token" (not the input form). The form only shows when the token field is empty.

## What "done" looks like

* debug flag off → no Playground tab. debug on → Playground visible.
* enter token once → works across all PRs
* GitLab 401 → correct error message + inline token form
* enter token in form → save → auto-retry → clone succeeds
* fetch-diff 401 → inline GitHub token form → save → retry → succeeds
