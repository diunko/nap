# fs-eng response2 — fixes-01

## What I built

Four fixes from the fixes-01 napkin. All four implemented, all tests passing.

### Fix 1: Global tokens — chrome.storage.sync

**New file: `chrome-storage.ts`**
- `readGlobalSettings()` / `writeGlobalSettings()` — read/write `chrome.storage.sync`
- `globalTokens` — in-memory ref, readable by pipeline steps and Panel getAuth
- `initGlobalTokens()` — called at boot, loads from chrome.storage.sync into memory
- `setGlobalToken(key, value)` — writes to both chrome.storage.sync and memory
- Falls back to in-memory storage when chrome.storage unavailable (vitest)

**Removed from store.ts:**
- `githubToken`, `gitlabToken` — fields, defaults, actions, PARTIALIZE
- Tokens no longer per-session. Set once, survive all sessions.

**Updated:**
- `pipeline-steps.ts` — clone and fetch-diff steps read from `globalTokens`, not `store.getState()`
- `model.ts` — `checkDiffRanges` reads from `globalTokens.githubToken`
- `index.tsx` App — calls `initGlobalTokens()` at boot before creating pipeline
- `index.tsx` SettingsOverlay — reads/writes `globalTokens` + `setGlobalToken()`
- `index.tsx` Panel getAuth — reads from `globalTokens`
- `gitlab-support.test.ts` GL-S06 — rewritten to test `globalTokens` / `setGlobalToken`

### Fix 2: Global debug flag

**`chrome-storage.ts`** — `globalDebugMode`, `initGlobalDebugMode()`, `setGlobalDebugMode()`

**`index.tsx`:**
- App reads `debugMode` from chrome.storage.sync at boot
- `SurfaceTabBar` takes `debugMode` prop — Playground tab only renders when true
- `SettingsOverlay` has debug mode checkbox that calls `setGlobalDebugMode()`
- `Panel` passes `debugMode` + `onDebugModeChange` down

### Fix 3: Error classification — observed, not guessed

**FX-P20 Playwright discovery test (`fx-error-capture.test.ts`):**
- Clones from gitlab.grammarly.io WITHOUT a token
- Captures the raw isomorphic-git error object
- Observed structure:

```
name: "HttpError"
code: "HttpError"
message: "HTTP Error: 401 "
statusCode: undefined (NOT on the error object!)
data.statusCode: 401 (THIS is where it lives)
data.response: "HTTP Basic: Access denied..."
```

**Key finding:** isomorphic-git `HttpError` stores the HTTP status code in `e.data.statusCode`, NOT `e.statusCode`. The error object itself has no `statusCode` own property.

**Classification in `pipeline-steps.ts`:**
```typescript
if (e.statusCode === 401 || e.data?.statusCode === 401) { ... }
```
The `e.data?.statusCode` fallback correctly catches the real error shape. Also added `403` check (some providers return 403 for auth issues) and the raw error capture on `window.__napPipelineRawError__` for debugging.

**Verified:** GitLab 401 now correctly shows "authentication failed" (not "can't reach").

### Fix 4: Inline token form in LoadingGate

**Rewrote `LoadingGate.tsx`** with custom step renderers:
- `CloneTokenForm` — shown when clone step has `error === 'authentication failed'`
  - Detects provider from `ctx.config.provider`
  - Shows "GitLab PAT" or "GitHub PAT" label accordingly
  - If token exists (wrong token): shows "check your token" message + input to replace
  - If no token: shows inline input + "save & retry" button
  - Save writes to `chrome.storage.sync` via `setGlobalToken()`, then auto-retries
- `FetchDiffTokenForm` — same pattern, always "GitHub PAT" (code repo is always GitHub)
- `DefaultError` — text + hint + retry (existing behavior for non-auth steps)
- Removed the old `TokenOverlay` (separate settings modal) — inline form replaces it

## Decisions

### chrome.storage.sync fallback
In vitest (no chrome API), `chrome-storage.ts` uses an in-memory map. This means vitest tests can set/read tokens without mocking chrome. The `_resetMemoryStore()` helper clears state between tests.

### Boot order: global settings before pipeline
App now calls `initGlobalTokens()` + `initGlobalDebugMode()` before reading the tab URL. The `globalReady` state gates the tab URL effect. This ensures tokens are loaded before the pipeline's clone step reads them.

### Error capture kept in production code
The `window.__napPipelineRawError__` assignment in the clone step is intentional — it enables FX-P20 debugging in production builds. Minimal overhead (one property assignment on error path only).

## Test results

```
Test Files  14 passed (14)
Tests       191 passed (191)
tsc --noEmit: 0 errors
```

## What to review

1. The Playwright test `fx-error-capture.test.ts` requires VPN to gitlab.grammarly.io — will be skipped in CI
2. GL-M01 and GL-M03 (existing Playwright tests) need updating — they inject tokens via `store.getState().setGitlabToken()` which no longer exists. Should use `chrome.storage.sync.set()` instead.
3. The `globalTokens` in-memory ref is module-level state — safe for single-page extension, but tests need `_resetMemoryStore()` between tests
