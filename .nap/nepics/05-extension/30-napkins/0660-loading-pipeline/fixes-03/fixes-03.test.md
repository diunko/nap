# fixes-03 — test architecture

Two bugs, one root cause: the user can't recover from GitLab auth failure.
Bug 1 prevents the system from *knowing* it's an auth failure. Bug 2 prevents the user from *fixing* it even if they know.

---

## Bug analysis — why both must be fixed together

The recovery path for "private GitLab repo, no token" is:

```
clone fails → loading gate shows "auth failed" → inline token form → enter token → save & retry → done
```

Bug 1 breaks the first arrow: clone fails but says "network failed" → no inline token form (CloneTokenForm only renders when `step.error === 'authentication failed'`). User sees "check your network or VPN" — wrong diagnostic.

Bug 2 breaks the workaround: even if the user knows they need to enter a token, there's no settings gear during loading. The settings gear is inside `Panel`, which only mounts after the pipeline completes (`index.tsx:740` renders `<LoadingGate>` alone, no header). User is stuck.

Both must be fixed for the recovery path to work.

---

## Bug 1: Error classification

### The problem

`pipeline-steps.ts:218` checks `e.statusCode === 401 || e.data?.statusCode === 401`. If isomorphic-git's GitLab error puts the status code somewhere else (e.g., only in `e.data.response.statusCode`, or only in `e.message`, or wraps it in an `HttpError` with different field names), the check fails → falls through to the catchall → `"can't reach {hostname}"`.

The error capture test (`fx-error-capture.test.ts`) was designed to discover this. But the classification code was written before the capture test was run — the exact pattern the principles warn against.

### Required approach — observe, then classify

The fs-eng MUST:

1. Run `fx-error-capture.test.ts` against real GitLab (VPN on, GITLAB_API_TOKEN in `.env`)
2. Read the console output: the raw error's `name`, `message`, `statusCode`, `ownKeys`, `data`, prototype chain
3. Update classification logic based on what they actually see
4. THEN write the regression test that asserts correct classification

This is NOT a "try different field names until one works" task. It's an observation task.

### FX3-S01: error capture discovery test (medium, Playwright) — already exists

* **test:** `fx-error-capture.test.ts` — run this FIRST
* **what it does:** clones from gitlab.grammarly.io WITHOUT token, captures raw error via `__napPipelineRawError__`, logs every property
* **what fs-eng does with output:** reads the console output, identifies where `401` lives on the error object
* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`, VPN required, no GITLAB_API_TOKEN in chrome.storage.sync
* **note:** already exists and works. Just needs to be run and its output READ.

### FX3-S02: classification matches observed error shape (small, vitest)

* **flow:** mock `cloneFn` to throw an error shaped EXACTLY like the observed GitLab error (from FX3-S01 output)
* **subsystems:** clone step error classification
* **expected:** `{ ok: false, error: 'authentication failed', hint: 'enter your GitLab token in settings' }`
* **where it breaks:** classification checks wrong field
* **verification:** assert error string is exactly 'authentication failed'
* **critical:** the mock error in this test MUST match the real error shape observed in FX3-S01. Not guessed. Copied from the console output.

### FX3-S03: classification still works for GitHub 401 (small, vitest)

* **flow:** mock error with `{ statusCode: 401 }` (GitHub-style, as currently tested)
* **expected:** still classified as 'authentication failed'
* **where it breaks:** GitLab fix breaks GitHub path
* **verification:** existing LP-S20 test — run after the fix, assert it still passes
* **note:** regression guard. GitHub and GitLab errors may have different shapes. Both must be handled.

### FX3-S04: classification with isomorphic-git HttpError (small, vitest)

* **flow:** mock error that mimics isomorphic-git's `HttpError` class — has `data.statusCode`, `data.response`, etc.
* **expected:** classified as 'authentication failed' when status is 401
* **note:** isomorphic-git v1 `HttpError` typically stores: `{ name: 'HttpError', message: 'HTTP Error: 401 ...', data: { statusCode: 401, statusMessage: 'Unauthorized' } }`. But the actual shape may differ — FX3-S01 tells us.

### FX3-S05: 401 from GitLab triggers inline token form in LoadingGate (small, vitest)

* **flow:** pipeline step returns `{ ok: false, error: 'authentication failed', hint: '...' }` for a step named 'cloning gitlab.grammarly.io/...'
* **subsystems:** LoadingGate, StepRow, CloneTokenForm dispatch
* **expected:** CloneTokenForm renders (inline PAT input visible), NOT DefaultError
* **where it breaks:** step.error check in LoadingGate doesn't match the error string
* **verification:** check `isAuthError` flag: `step.error === 'authentication failed'` on line 101 of LoadingGate.tsx

### FX3-P01: GitLab 401 → inline form → enter token → clone succeeds (medium, Playwright)

* **flow:** fresh visit with GitLab hash, no token → clone fails → "authentication failed" shown (not "network failed") → inline token form visible → enter GITLAB_API_TOKEN → save & retry → clone succeeds → pipeline completes
* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`, GITLAB_API_TOKEN from .env, VPN required
* **expected:**
  * DOM: clone step shows "authentication failed" (not "can't reach")
  * DOM: `data-testid="inline-token-input"` visible
  * DOM: label says "GitLab PAT"
  * DOM: after save & retry, clone step shows spinner then checkmark
  * DOM: loading-gate unmounts, Panel renders
* **where it breaks:** error classified as network → DefaultError shown → no inline form → user stuck
* **verification:** full Playwright end-to-end
* **skip:** `test.skip(!!process.env.CI, 'requires VPN')`
* **note:** this is the critical acceptance test for bug 1. If this passes, the error classification is correct.

---

## Bug 2: Settings inaccessible during loading

### The problem

`index.tsx:739-741`:
```tsx
if (!pipelineDone && pipelineRef.current) {
  return <LoadingGate pipeline={pipelineRef.current} gateStep={...} />;
}
```

LoadingGate is rendered alone. No header bar. No settings gear. The `SettingsOverlay` component is inside `Panel`, which only mounts after `pipelineDone`. During loading or pipeline error, the user has no way to access settings.

### The fix options (for fs-eng to choose)

**Option A:** Add a settings gear icon to LoadingGate itself. Click opens a minimal settings overlay (just token inputs + debug checkbox). No session needed — tokens are in chrome.storage.sync.

**Option B:** Render a mini header bar above LoadingGate in the App component's pipeline-running branch. Just the gear icon.

**Option C:** The inline token form (already on the clone step) IS the settings. No separate gear needed — but this doesn't help when the user wants to enter a token BEFORE the clone step fails.

The napkin says both paths should work: inline form on the step (quick) AND settings gear (workaround).

### FX3-S10: settings gear visible during loading gate (medium, Playwright)

* **flow:** panel opens → pipeline running (loading gate visible) → settings gear icon visible
* **subsystems:** LoadingGate or App rendering, settings gear
* **expected:** DOM: settings gear / icon clickable while loading gate is visible
* **where it breaks:** gear only in Panel, Panel not mounted during loading
* **verification:** open panel, while loading-gate is visible, assert settings trigger element exists and is clickable

### FX3-S11: settings gear visible when pipeline errored (medium, Playwright)

* **flow:** clone fails → loading gate shows error → settings gear still visible
* **expected:** DOM: settings gear clickable on error screen
* **where it breaks:** settings only shown during 'running' state, hidden on 'error'
* **verification:** wait for pipeline error, assert settings trigger visible

### FX3-S12: settings overlay opens during loading, tokens saveable (medium, Playwright)

* **flow:** pipeline running → click settings gear → overlay opens → enter GitLab token → save → overlay closes → tokens saved to chrome.storage.sync
* **subsystems:** settings overlay, chrome.storage.sync, globalTokens ref
* **expected:**
  * DOM: settings overlay visible after click
  * DOM: token inputs functional (can type)
  * DOM: save button works
  * After save: `globalTokens.gitlabToken` updated
* **where it breaks:** overlay opens but can't save (session not created yet), or save writes to wrong store
* **verification:** enter token, save, verify via console that globalTokens ref updated

### FX3-S13: opening settings doesn't interrupt pipeline (medium, Playwright)

* **flow:** pipeline running (step 3 active) → open settings → pipeline continues progressing → close settings → pipeline state unchanged
* **subsystems:** settings overlay z-index, pipeline runner
* **expected:** pipeline doesn't pause/break while settings is open. Steps continue in background.
* **where it breaks:** overlay captures focus or blocks event loop, pipeline stalls
* **verification:** open settings during pipeline execution, wait, close, verify pipeline progressed or completed

### FX3-S14: enter token in settings → retry clone → succeeds (medium, Playwright)

* **flow:** GitLab 401 → open settings gear → enter token → save → close overlay → click retry on clone step → clone succeeds
* **subsystems:** settings, globalTokens, pipeline retry, clone step
* **expected:** retry reads new token from globalTokens, clone succeeds
* **where it breaks:** retry reads stale token (token was in settings but not written to globalTokens ref before retry)
* **verification:** full Playwright flow with real GitLab clone
* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`, GITLAB_API_TOKEN from .env
* **note:** story FX33 — both inline form AND settings gear work as recovery paths

### FX3-S15: settings overlay reuses existing SettingsOverlay component (small, vitest)

* **flow:** verify that the settings shown during loading is the same component (or equivalent) as the one in Panel
* **expected:** same inputs (github-token, gitlab-token), same save behavior, same debug checkbox
* **where it breaks:** loading-gate settings is a stripped-down version missing fields
* **verification:** check for same data-testid values: `settings-github-token`, `settings-gitlab-token`, `settings-debug-mode`
* **note:** avoids two diverging settings UIs

---

## Interaction between the two bugs

### FX3-P10: full recovery path — GitLab 401 → both recovery methods (medium, Playwright)

* **flow:** GitLab no token → 401 correctly classified → inline form appears AND settings gear visible → test BOTH paths:
  * Path A: enter token in inline form → save & retry → succeeds
  * Path B (separate run): enter token via settings gear → close → retry → succeeds
* **subsystems:** error classification, LoadingGate rendering, inline form, settings overlay, pipeline retry
* **expected:** both paths lead to successful clone
* **where it breaks:** one path works, other doesn't (e.g., inline form saves to globalTokens but settings gear saves to wrong place)
* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`, GITLAB_API_TOKEN from .env
* **note:** this is the acceptance test for the entire fixes-03. If this passes, both bugs are fixed.

---

## Existing test impact

| Existing test | Action | Reason |
|---|---|---|
| `fx-error-capture.test.ts` FX-P20 | **keep, run FIRST** | Discovery test — output drives FX3-S02. |
| `pipeline.test.ts` LP-S20 | **keep** | GitHub 401 regression. Must still pass after GitLab fix. |
| `pipeline.test.ts` LP-S22 | **keep** | Network error path. Must still pass — real network errors should still say "network". |
| `LoadingGate` tests (FX-S30..S36) | **keep** | Inline form rendering. These validate the form appears when error IS correctly classified. |
| `pb-panel-boot.test.ts` PB-P01..P08 | **adapt** | If settings gear added to loading gate, PB-P01 (gate → session) may see gear during loading. Not a break — just new DOM element. |
| `pg-playground.test.ts` PG-P01..P06 | **keep** | Playground unaffected. |

---

## Test execution plan

1. **FX3-S01** — run `fx-error-capture.test.ts` FIRST. Read output. Understand the real error shape.
2. **FX3-S02..S04** — write classification vitest tests based on observed error shape. Fix classification.
3. **FX3-S05** — verify LoadingGate dispatches to inline form for the fixed classification.
4. **FX3-S10..S15** — settings gear tests. Can run in parallel with classification fix.
5. **FX3-P01** — Playwright: GitLab 401 → inline form → success. Acceptance test for bug 1.
6. **FX3-P10** — Playwright: full recovery path both methods. Acceptance test for both bugs.
