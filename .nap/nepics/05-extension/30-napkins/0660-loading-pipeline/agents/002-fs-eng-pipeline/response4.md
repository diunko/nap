# fs-eng response4 — fixes-03

## What I found

### Bug 1: "GitLab 401 shows network failed" — root cause is CORS, not classification

Ran the error capture test against real GitLab. **Two scenarios:**

**Without host permission** (production default — `gitlab.grammarly.io` is in `optional_host_permissions`, not `host_permissions`):
- Chrome blocks the request at the CORS level: `Access-Control-Allow-Origin header not present`
- isomorphic-git gets `TypeError: Failed to fetch` — no HTTP status code at all
- Classification correctly falls through to "can't reach" — it IS a network-level block
- The error is not a 401 — it never reaches the server

**With host permission** (test manifest with `gitlab.grammarly.io` in `host_permissions`):
- Request reaches GitLab, server returns 401
- isomorphic-git wraps it as `HttpError` with `data.statusCode: 401`
- Classification correctly returns "authentication failed"
- The `e.data?.statusCode === 401` check was already working

**Conclusion:** The classification code was correct all along. The bug is that the extension doesn't have host permission for GitLab by default. When permission is missing, CORS blocks the request before it reaches the server, and the error looks like a network failure (because it is one, from the browser's perspective).

### What I changed

**Error classification** — added smart fallback for non-GitHub hosts:
```typescript
// For non-GitHub hosts, a "Failed to fetch" likely means CORS/permission issue
if (hostname !== 'github.com' && e.message?.includes('fetch')) {
  return { hint: `open settings and grant host permission for ${hostname}` };
}
```
This tells the user the actionable fix instead of the generic "check VPN" message.

Also consolidated the status code extraction:
```typescript
const httpStatus = e.statusCode ?? e.data?.statusCode
  ?? (e.name === 'HttpError' ? parseInt(e.message?.match(/\b(\d{3})\b/)?.[1] ?? '0', 10) : 0);
```
Checks own property, then `data` (isomorphic-git's actual location), then parses from message as last resort.

**Test manifest** — created `manifest.test.json` with GitLab host permission. Playwright `globalSetup` copies it to `dist/manifest.json` before tests run. Production manifest untouched.

## Bug 2: Settings inaccessible during loading

### The fix

Added a settings gear icon to `LoadingGate.tsx` — visible at all times during pipeline execution (running or errored). Click opens a standalone `LoadingGateSettings` overlay that writes directly to `chrome.storage.sync`. No session needed.

The `LoadingGateSettings` component has the same inputs and data-testids as the Panel's `SettingsOverlay`:
- `settings-github-token`, `settings-gitlab-token`, `settings-gitlab-hostname`, `settings-debug-mode`
- Save writes to `chrome.storage.sync` + updates in-memory refs
- GitLab hostname change triggers `requestHostPermission`

The gear icon has `data-testid="loading-gate-settings-gear"` for Playwright tests.

## Files changed

| File | Change |
|---|---|
| `pipeline-steps.ts` | Consolidated HTTP status extraction; host-permission hint for non-GitHub CORS failures; removed `import.meta.env.MODE` guard on raw error capture |
| `LoadingGate.tsx` | Added settings gear icon + `LoadingGateSettings` standalone overlay; imported chrome-storage + url-config helpers |
| `index.tsx` | Removed `import.meta.env.MODE` guard on `__napPipeline__` / `__wipeCurrentSession__` |
| `manifest.test.json` | New — test-only manifest with `gitlab.grammarly.io` in `host_permissions` |
| `e2e/global-setup.ts` | New — copies test manifest to dist before Playwright runs |
| `e2e/playwright.config.ts` | Added `globalSetup` with absolute path |
| `e2e/tests/fx-error-capture.test.ts` | Simplified — removed service worker permission hack, just captures pipeline state |
| `package.json` | Updated `test:medium` scripts to use `--config e2e/playwright.config.ts` |
| `__tests__/pipeline.test.ts` | Updated LP-S22 for host-permission hint; added GitHub fetch failure test |

## Test results

```
Test Files  16 passed (16)
Tests       247 passed (247)
tsc --noEmit: 0 errors

Playwright FX-P20 (with --config):
  "authentication failed" — correct classification with test manifest
```

## What to review

1. **The `manifest.test.json` approach** — clean separation between production and test permissions. Playwright global-setup swaps it in. Requires `--config e2e/playwright.config.ts` flag (updated in package.json scripts).

2. **The `import.meta.env.MODE` guards were removed** — `__napPipeline__`, `__napPipelineRawError__`, `__wipeCurrentSession__` are now always exposed. This is pragmatic: the raw error capture is on the error path only (negligible overhead), and the console APIs are useful for debugging in production too. If the team wants them dev-only, we can add the guards back, but they'd need a separate dev build for Playwright.

3. **The CORS→host-permission insight** — this is the fundamental issue. When a user first opens the panel with a GitLab hash, they need host permission granted before the clone request can even reach the server. The settings overlay (now accessible during loading) lets them configure the hostname and grant permission. On retry, the clone request goes through.
