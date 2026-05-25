# fixes-01 — test architecture

Four seams. Four sets of tests. The theme: storage boundary migration (Zustand → chrome.storage.sync) and UI behavior at the error step.

---

## What changed — test implications

| Change | Old seam | New seam | What breaks if wrong |
|---|---|---|---|
| Global debug flag | n/a (playground always visible) | `chrome.storage.sync.get('debugMode')` → Playground tab | Flag read fails → tab always hidden or always visible |
| Global tokens | `store.getState().githubToken` | `chrome.storage.sync.get('githubToken')` → pipeline ctx | Tokens lost on PR switch, or not read by clone step |
| Error classification | Already uses `e.statusCode` in pipeline-steps.ts | Same — but needs real-world verification | GitLab 401 shows "no network" if isomorphic-git error shape is different than assumed |
| Inline token form | "settings" button in LoadingGate | Custom step renderer with PAT input, save to chrome.storage.sync, auto-retry | Form doesn't show, token not persisted globally, retry doesn't read new token |

---

## Layer 1: Global debug flag (small, vitest)

### FX-S01: debug flag off — Playground tab hidden

* **flow:** boot with `chrome.storage.sync = { debugMode: false }` (or absent) → component reads flag → Playground tab not rendered
* **subsystems:** boot flag reader, SurfaceTabBar
* **expected:** Playground tab DOM element absent
* **where it breaks:** flag reader defaults to true, or component doesn't check flag
* **verification:** mock chrome.storage.sync, render SurfaceTabBar, assert no `tab-playground` testid
* **test size:** small — mock chrome.storage.sync, no real browser

### FX-S02: debug flag on — Playground tab visible

* **flow:** boot with `chrome.storage.sync = { debugMode: true }` → Playground tab rendered
* **expected:** Playground tab DOM element present
* **where it breaks:** flag check inverted
* **verification:** assert `tab-playground` testid present

### FX-S03: debug flag not in Zustand — survives session switch

* **flow:** set debugMode=true → switch session (new state key) → flag still true
* **subsystems:** chrome.storage.sync reader, session creation
* **expected:** flag value unchanged after session switch
* **where it breaks:** flag stored in per-session Zustand, lost on switch
* **verification:** read flag after session switch, assert still true
* **test size:** small — mock chrome.storage.sync, two store instances

### FX-S04: debug flag toggle from settings UI

* **flow:** open settings → toggle debug checkbox → chrome.storage.sync updated
* **expected:** `chrome.storage.sync.set({ debugMode: true })` called
* **where it breaks:** writes to Zustand instead of chrome.storage.sync
* **verification:** mock chrome.storage.sync.set, assert called with correct key

---

## Layer 2: Global tokens (small, vitest)

The critical seam: tokens move from per-session Zustand to chrome.storage.sync. Two things can go wrong — tokens not read on boot, or tokens not available to pipeline steps.

### FX-S10: tokens read from chrome.storage.sync on boot

* **flow:** `chrome.storage.sync = { githubToken: 'ghp_abc', gitlabToken: 'glpat-xyz' }` → boot → pipeline ctx receives tokens
* **subsystems:** boot token reader, pipeline ctx initialization
* **expected:** `ctx.githubToken` (or global ref) contains the stored values
* **where it breaks:** reads from Zustand (empty), ignores chrome.storage.sync
* **verification:** mock chrome.storage.sync, create pipeline ctx, assert token values present

### FX-S11: tokens survive PR switch (session recreation)

* **flow:** set tokens in chrome.storage.sync → create session A → destroy session A → create session B → tokens still available
* **subsystems:** chrome.storage.sync, session creation
* **expected:** session B's pipeline reads the same tokens
* **where it breaks:** tokens in per-session Zustand, gone on new session
* **verification:** mock chrome.storage.sync, two sessions, assert both read same tokens
* **note:** this is the bug being fixed (story FX2). The test proves the fix.

### FX-S12: clone step reads token from global ref, not store

* **flow:** set global token ref → run clone step → clone receives auth with that token
* **subsystems:** clone step, token reading
* **expected:** `cloneFn` called with auth object containing the global token
* **where it breaks:** clone step still reads `store.getState().githubToken` (removed field)
* **verification:** mock cloneFn, assert auth parameter matches global token

### FX-S13: fetch-diff step reads GitHub token from global ref

* **flow:** set global github token → run fetch-diff step → fetchDiffFn receives that token
* **subsystems:** fetch-diff step, token reading
* **expected:** `fetchDiffFn` called with the global github token
* **where it breaks:** step reads from store (removed field)
* **verification:** mock fetchDiffFn, assert pat parameter matches global token

### FX-S14: settings UI writes tokens to chrome.storage.sync

* **flow:** enter tokens in settings → save → chrome.storage.sync.set called
* **subsystems:** settings overlay, chrome.storage.sync
* **expected:** `chrome.storage.sync.set({ githubToken: 'ghp_new', gitlabToken: 'glpat-new' })` called
* **where it breaks:** writes to Zustand store (old behavior)
* **verification:** mock chrome.storage.sync.set, assert called with correct values

### FX-S15: tokens removed from Zustand store

* **flow:** create store → inspect state → no githubToken or gitlabToken fields
* **subsystems:** store.ts
* **expected:** `store.getState().githubToken` is undefined, not empty string
* **where it breaks:** fields left in store, dual source of truth
* **verification:** assert field absence on fresh store
* **note:** also verify PARTIALIZE doesn't include these fields

### FX-S16: tokens removed from PARTIALIZE

* **flow:** create persisted store → set some state → extract raw persisted data → no token keys
* **subsystems:** store.ts, PARTIALIZE
* **expected:** persisted JSON has no githubToken or gitlabToken keys
* **where it breaks:** fields left in PARTIALIZE, stale tokens persisted in IDB
* **verification:** use createMemoryStorage, write state, read raw JSON, assert no token keys

---

## Layer 3: Error classification (small vitest + one medium Playwright)

### FX-S20: clone step — statusCode 401 → "authentication failed"

* **flow:** mock cloneFn throws `{ statusCode: 401, message: '...' }` → clone step catches → returns correct error
* **subsystems:** clone step error classification
* **expected:** `{ ok: false, error: 'authentication failed', hint: 'enter your GitLab token in settings' }` (for GitLab provider)
* **where it breaks:** pattern matches message instead of statusCode, gets wrong category
* **verification:** assert error and hint strings exactly
* **note:** already tested in LP-S20 from round 1, but this verifies the FIX — that statusCode is checked first

### FX-S21: clone step — no statusCode, message contains "fetch" → network error

* **flow:** mock cloneFn throws `new TypeError('Failed to fetch')` — no statusCode property
* **expected:** `{ ok: false, error: "can't reach {hostname}", hint: 'check your network or VPN' }`
* **where it breaks:** TypeError without statusCode classified as auth failure
* **verification:** assert hint mentions "network", not "token"

### FX-S22: clone step — statusCode takes precedence over message

* **property:** if error has statusCode=401, the classification is "auth failed" regardless of what message says
* **flow:** throw `{ statusCode: 401, message: 'network error' }` — statusCode wins
* **expected:** classified as auth, not network
* **where it breaks:** message matching runs first, overrides statusCode
* **verification:** assert error is "authentication failed"

### FX-P20: real GitLab error capture (medium, Playwright)

* **flow:** Playwright test in real Chrome → clone from gitlab.grammarly.io without token → capture error object → log structure
* **subsystems:** isomorphic-git, real HTTP, real Chrome
* **expected:** error has `statusCode: 401` (or discover what it actually has)
* **where it breaks:** isomorphic-git wraps HTTP errors differently than assumed
* **verification:** console.log(JSON.stringify(error)) — capture and document the real structure
* **note:** this is the "observe before classifying" mandate from the spec. The fs-eng writes this test first, then builds classification logic based on what they see. Not a regression test — a discovery test.
* **needs:** `.env` with GITLAB_API_TOKEN

---

## Layer 4: Inline token form (small vitest + medium Playwright)

The new UI seam: when clone or fetch-diff fails with 401 and no token is set, the loading gate shows a PAT input right on the failed step instead of pointing to settings.

### FX-S30: step renderer dispatch — clone step gets CloneStepRenderer

* **flow:** loading gate receives pipeline state with clone step in error status + 401 + no token
* **subsystems:** LoadingGate, STEP_RENDERERS dispatch
* **expected:** CloneStepRenderer rendered (not default renderer)
* **where it breaks:** dispatch by step name fails, default renderer always used
* **verification:** render LoadingGate with mock pipeline, assert PAT input visible
* **test size:** small — React testing (vitest + jsdom or similar)

### FX-S31: step renderer dispatch — unknown step gets default

* **flow:** loading gate receives pipeline state with "setting up filesystem" step in error
* **expected:** default renderer (text + hint + retry), no PAT input
* **where it breaks:** custom renderer matches wrong step name
* **verification:** assert no PAT input, assert retry button present

### FX-S32: CloneStepRenderer shows correct provider label

* **flow:** GitLab provider config → form label says "GitLab PAT"
* **flow:** GitHub provider config → form label says "GitHub PAT"
* **subsystems:** CloneStepRenderer, provider detection from ctx.config
* **expected:** label matches provider
* **where it breaks:** hardcoded "GitHub" label, ignores provider
* **verification:** render with gitlab config, assert "GitLab PAT" text; render with github config, assert "GitHub PAT"

### FX-S33: CloneStepRenderer — token exists + 401 → no form, just message

* **flow:** clone 401 but token IS set (wrong token, not missing) → show "check your token" message, NOT the input form
* **subsystems:** CloneStepRenderer, token presence check
* **expected:** no PAT input visible, error message says "check your token"
* **where it breaks:** form always shown on 401, even when token exists (confusing UX — user already entered one)
* **verification:** render with token in global ref, assert no input field, assert "check" in error text

### FX-S34: save in form writes to chrome.storage.sync + updates global ref

* **flow:** user enters token in inline form → clicks save → chrome.storage.sync.set called, global ref updated
* **expected:** chrome.storage.sync updated with new token, global ref readable by retry
* **where it breaks:** writes to Zustand store (removed), or updates chrome.storage.sync but not the in-memory ref
* **verification:** mock chrome.storage.sync.set, simulate save, assert called; then check global ref value

### FX-S35: save + retry — auto-retries the step

* **flow:** user enters token → clicks "save & retry" → step re-runs with new token
* **subsystems:** CloneStepRenderer, pipeline.retry
* **expected:** pipeline.retry(cloneStepIndex) called after save
* **where it breaks:** save doesn't trigger retry, user must click retry separately
* **verification:** mock pipeline.retry, simulate save click, assert retry called

### FX-S36: FetchDiffStepRenderer always shows "GitHub PAT"

* **flow:** fetch-diff fails 401 → form label always "GitHub PAT" (code repo is always GitHub)
* **subsystems:** FetchDiffStepRenderer
* **expected:** label is "GitHub PAT" regardless of .nap repo provider
* **where it breaks:** inherits .nap repo provider (GitLab) instead of code repo provider (GitHub)
* **verification:** render with GitLab .nap config, assert label is "GitHub PAT"

### FX-P30: inline token form end-to-end (medium, Playwright)

* **fixture:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap` — private GitLab repo. Token from `.env` (`GITLAB_API_TOKEN`). VPN required.
* **URL:** `https://github.com/diunko/nap-test-main#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
* **flow:** fresh visit → no token in chrome.storage.sync → pipeline auto-runs → clone step hits GitLab 401 → inline form appears with "GitLab PAT" label → enter GITLAB_API_TOKEN → save & retry → clone succeeds → pipeline continues → loading gate unmounts
* **subsystems:** LoadingGate, CloneTokenForm, chrome.storage.sync, pipeline retry, real isomorphic-git clone
* **expected:**
  * DOM: `data-testid="inline-token-input"` visible on clone step
  * DOM: label says "GitLab PAT" (provider from config)
  * DOM: after save+retry, clone step shows spinner then checkmark
  * DOM: loading gate unmounts (`data-testid="loading-gate"` absent), header-bar visible
  * Store: `navSections.length > 0`
* **where it breaks:** form shown but `setGlobalToken` doesn't persist to chrome.storage.sync, or retry doesn't re-read `globalTokens` ref
* **verification:** full Playwright flow — pattern matches `gl-gitlab-support.test.ts` GL-M01 but enters token via inline form instead of `__napStore__` injection
* **skip:** `test.skip(!!process.env.CI, 'requires VPN')` + skip if no GITLAB_API_TOKEN in .env

### FX-P31: token persists across panel close/reopen (medium, Playwright)

* **fixture:** same GitLab repo + token
* **flow:** enter token via inline form → pipeline completes → close panel → reopen → clone step doesn't need token again (already in chrome.storage.sync) → pipeline flies through (scan finds IDB repo, clone skipped)
* **subsystems:** chrome.storage.sync persistence, panel boot, `initGlobalTokens()`
* **expected:**
  * second visit: no inline form shown, loading gate flies through in < 3s
  * `globalTokens.gitlabToken` populated from chrome.storage.sync on boot
  * no clone triggered (IDB has repo from first visit)
* **where it breaks:** `initGlobalTokens()` not called before pipeline starts, or token saved to memory-only ref (lost on panel close)
* **verification:** close panel, reopen, wait for pipeline completion without 401, assert nav populated
* **note:** this replaces `gl-gitlab-support.test.ts` GL-M03 which tested Zustand persistence — now tests chrome.storage.sync persistence

### FX-P32: inline form → enter token → save & retry → clone from GitLab succeeds (medium, Playwright)

* **fixture:** same GitLab repo
* **flow:** specifically tests the auto-retry behavior: enter token in inline input → press Enter (or click save & retry) → clone step transitions from error → running → done → pipeline continues
* **subsystems:** TokenInputAndRetry, `setGlobalToken`, pipeline `retry(cloneStepIndex)`
* **expected:**
  * DOM: after Enter key, clone step shows spinner (re-running)
  * DOM: after clone completes, step shows checkmark
  * `globalTokens.gitlabToken` updated to the entered value
  * chrome.storage.sync contains the token (survives panel close)
* **where it breaks:** Enter key handler doesn't fire `handleSaveAndRetry`, or `setGlobalToken` is async and retry fires before write completes
* **verification:** type token → press Enter → wait for pipeline overall=done

---

## Existing test impact

| Existing test | Action | Reason |
|---|---|---|
| `gitlab-support.test.ts` GL-S06 | **already updated** | Now tests `globalTokens` + `setGlobalToken` from `chrome-storage.ts`. Uses `_resetMemoryStore()`. |
| `pipeline.test.ts` LP-S20..S23 | **already working** | Clone step reads from `globalTokens` ref. `makeMockStore()` no longer needs token fields. |
| `gl-gitlab-support.test.ts` GL-M01 | **adapt** | Currently injects token via `__napStore__.getState().setGitlabToken()` — field removed. Inject via `setGlobalToken()` or chrome.storage.sync evaluation. |
| `gl-gitlab-support.test.ts` GL-M03 | **replace with FX-P31** | Tested Zustand persistence. Now tests chrome.storage.sync persistence. |
| `fx-error-capture.test.ts` FX-P20 | **keep** | Discovery test — captures raw isomorphic-git error. Already references `__napPipelineRawError__`. |
| `workflow-wiring.test.ts` WW-M02 | **update** | If any test reads `store.getState().githubToken`, remove — field gone from store. |
| `panel-boot.test.ts` PB-M01 | **keep** | Model-with-config tests don't touch tokens. |
| `session.test.ts` SS-03 | **keep** | Persistence tests unchanged — tokens removed from PARTIALIZE. |
| `LoadingGate.tsx` inline form | **already implemented** | `CloneTokenForm`, `FetchDiffTokenForm`, `TokenInputAndRetry` already in LoadingGate.tsx. Tests verify the behavior. |
| `index.tsx` settings overlay | **already updated** | Settings now uses `setGlobalToken()` and `globalTokens` ref. |

---

## Test execution plan

1. **FX-S15, FX-S16** (tokens removed from store) — first. These prove the old code is cleaned up.
2. **FX-S10..S14** (global tokens) — second. The new storage path works.
3. **FX-S20..S22** (error classification) — third. Correct categorization before building UI.
4. **FX-P20** (real GitLab error) — do this BEFORE writing final classification logic. Observe, then code.
5. **FX-S01..S04** (debug flag) — independent, can run in parallel with tokens.
6. **FX-S30..S36** (inline form) — after global tokens work, since the form writes to chrome.storage.sync.
7. **FX-P30, FX-P31** (Playwright) — last. Full integration with real extension.

---

## Chrome.storage.sync mock pattern for vitest

`chrome-storage.ts` already has the in-memory fallback and test helper:

```typescript
import { globalTokens, _resetMemoryStore, setGlobalToken, globalDebugMode } from '../chrome-storage';

beforeEach(() => {
  _resetMemoryStore(); // resets globalTokens, globalDebugMode, memoryStore
});
```

When `chrome.storage.sync` is absent (vitest/Node), all reads/writes go through the in-memory store. No mock needed — the fallback IS the mock.

For tests that need to verify chrome.storage.sync calls directly (FX-S14, FX-S34), install a mock:

```typescript
(globalThis as any).chrome = {
  storage: {
    sync: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn((items, cb) => cb?.()),
    },
  },
};
```

The Playwright tests use real chrome.storage.sync — the extension runs in a real Chrome context.

## Test fixtures for Playwright (GitLab)

* **Repo:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap` (private, requires PAT)
* **Token:** `GITLAB_API_TOKEN` from `.env` at repo root
* **URL hash:** `#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
* **GitHub URL:** `https://github.com/diunko/nap-test-main` + above hash
* **VPN:** required for gitlab.grammarly.io access
* **Skip guard:** `test.skip(!!process.env.CI, 'requires VPN')` + skip if no token in .env
* **Existing pattern:** see `gl-gitlab-support.test.ts` and `fx-error-capture.test.ts`
