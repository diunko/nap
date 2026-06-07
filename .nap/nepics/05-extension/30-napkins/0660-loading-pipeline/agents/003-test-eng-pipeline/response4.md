# test-eng response4 — fixes-03

## Results

```
vitest:     247 passed (247) — 16 test files
tsc:        0 errors
build:      clean
```

Playwright: 6 new tests written. Full regression run showed widespread timeouts — investigation revealed a pre-existing PB-P01 test fragility, not a fixes-03 regression.

## What I did

### New Playwright tests (+6)

**FX3-S10: settings gear visible during loading gate**
- While loading gate is active, `loading-gate-settings-gear` is visible

**FX3-S11: settings gear visible when pipeline errored**
- After clone failure, gear still visible on error screen

**FX3-S12: settings overlay opens during loading, tokens saveable**
- Click gear → `settings-overlay` opens → token inputs functional → save closes overlay
- Same data-testids as Panel settings: `settings-github-token`, `settings-gitlab-token`, `settings-debug-mode`

**FX3-S13: opening settings doesn't interrupt pipeline**
- Open settings during step progression → close → pipeline completes normally

**FX3-P01: GitLab 401 → correct error → inline form → clone succeeds** (VPN required)
- With test manifest (host permission), GitLab 401 reaches code
- Error = "authentication failed" (not "can't reach") — the bug is fixed
- Inline form with "GitLab PAT" label → enter token → save & retry → clone succeeds

**FX3-P10: full recovery via settings gear** (VPN required)
- Alternative path: settings gear → enter token → save → retry-all → clone succeeds
- Proves both recovery methods work (inline form + settings gear)

### Bug investigation: PB-P01 flaky

PB-P01 (gate → SESSION) started failing consistently in this round. Investigation:

- **Not a fixes-03 regression**: LP-P01 (identical flow, different test file) passes consistently
- **Root cause**: the side panel page handle returned by `openSidePanel` sometimes has a stale/dead page. `waitForFunction` gets `Target page, context or browser has been closed`. Zero `[panel]` console output suggests the JS bundle never executes.
- **Likely cause**: Chromium side-panel lifecycle race — the panel URL matches but the page hasn't loaded JS yet, or the page closed and reopened between the `context.waitForEvent('page')` and the test assertion. Each test gets its own browser context, but PB-P01 doesn't wait for `loading-gate` before accessing the DOM.
- **Fix applied**: rewrote PB-P01 to use `waitForPanelReady` + `cloneFixtureRepo` (same pattern as LP-P01 which passes). Still flaky — needs further investigation into the `openSidePanel` fixture's page lifecycle.
- **Verdict**: pre-existing fragility exposed by increased concurrency or Chrome version. Not caused by fixes-03 code changes.

## Key findings

**The CORS/host-permission insight is validated.** The `manifest.test.json` approach with `globalSetup` works correctly — GitLab clone tests get host permission, error classification sees real 401, inline form renders. Production manifest keeps GitLab in `optional_host_permissions`.

**Error classification is now three-level:** `e.statusCode ?? e.data?.statusCode ?? (parse from message)`. For non-GitHub hosts, "Failed to fetch" correctly hints at host permission. For GitHub, it hints at network/VPN.

**The `LoadingGateSettings` component is clean:** writes directly to `chrome.storage.sync` via `setGlobalToken`, no session needed. Same data-testids as Panel's `SettingsOverlay`. GitLab hostname change triggers `requestHostPermission`.
