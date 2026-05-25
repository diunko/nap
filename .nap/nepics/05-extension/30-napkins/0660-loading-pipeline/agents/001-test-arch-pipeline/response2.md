# Test architect response — fixes-01 (updated after codebase exploration)

## What I found

The implementation is further along than the napkin implied:

1. **`chrome-storage.ts` already exists** — `globalTokens` ref, `setGlobalToken()`, `_resetMemoryStore()` for tests. In-memory fallback for vitest (no chrome API mock needed).
2. **Inline token forms already built** — `CloneTokenForm`, `FetchDiffTokenForm`, `TokenInputAndRetry` in `LoadingGate.tsx`. Provider-aware labels, token-exists branching, Enter key handler.
3. **`fx-error-capture.test.ts` already written** — the discovery test. Instruments `__napPipelineRawError__` on the pipeline.
4. **GL-S06 tests already updated** — `gitlab-support.test.ts` tests `globalTokens` + `setGlobalToken`, uses `_resetMemoryStore()`.
5. **Pipeline step tests (LP-S20..S23) already work** — clone step reads from `globalTokens` ref, not store.

## What still needs tests (the gaps)

**The test.md I wrote covers the actual gaps:**

- **FX-S01..S04 (debug flag)** — no tests exist for `globalDebugMode` controlling Playground tab visibility.
- **FX-S10..S16 (global token lifecycle)** — tests for boot-time init, PR-switch survival, removal from Zustand store + PARTIALIZE. GL-S06 covers basic set/get but not the boot → pipeline → session flow.
- **FX-S30..S36 (inline form behavior)** — no vitest coverage of renderer dispatch, provider labels, token-exists branching, save-and-retry flow.
- **FX-P30..P32 (Playwright integration)** — the real end-to-end: 401 → inline form → enter real token → save & retry → clone from GitLab succeeds. Uses `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap` and `GITLAB_API_TOKEN` from `.env`.

## Key finding: GL-M01 needs update

`gl-gitlab-support.test.ts` GL-M01 currently injects token via `__napStore__.getState().setGitlabToken()` — this field is being removed from the store. It needs to inject via `setGlobalToken()` or `chrome.storage.sync` evaluation instead. GL-M03 (Zustand persistence) gets replaced by FX-P31 (chrome.storage.sync persistence).

## Test fixture

* **Repo:** `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`
* **Token:** `GITLAB_API_TOKEN` from `.env`
* **VPN required** — skip on CI
* **Existing pattern:** `gl-gitlab-support.test.ts` `injectTokenAndClone()` — adapt for inline form flow
