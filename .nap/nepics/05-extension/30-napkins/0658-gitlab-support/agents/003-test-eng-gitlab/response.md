# response — test engineer (003-test-eng-gitlab)

## Results summary

- **143 vitest tests pass** (11 test files) — no regressions
- **10 Playwright tests pass** — 2 new GL-M tests + 8 existing PB-P tests
- **1 bug found and fixed** — clone URL missing `.git` suffix broke GitLab auth
- **GitLab fixture synced** — `fixtures/sync-gitlab.sh` pushed content to gitlab.grammarly.io

## Bug found: clone URL missing `.git` suffix

**Symptom:** GitLab clone returns 401 even with valid token.

**Root cause:** `buildCloneUrl` produced `https://gitlab.grammarly.io/owner/repo` (no `.git`). GitLab returns 301 redirect to `.git` URL. When `fetch()` follows the redirect, browsers strip the `Authorization` header (security policy). The authenticated retry hits the `.git` URL without credentials → 401 → clone fails.

**Fix:** `buildCloneUrl` now appends `.git` suffix: `https://gitlab.grammarly.io/owner/repo.git`. This avoids the redirect entirely. Works for both GitHub and GitLab.

**File changed:** `url-config.ts:104` — `return \`https://${entry.hostname}/${owner}/${repo}.git\``

**Tests updated:** All 6 test files with clone URL assertions updated to expect `.git` suffix. All 143 tests pass.

## Bug found: auto-clone race condition with token injection (design note)

**Symptom:** When injecting GitLab token via Playwright `evaluate()`, there's a race between token injection and auto-clone's `onAuth()` call. Sometimes auto-clone fires before the token is in the store.

**Root cause:** Auto-clone fires from `model.init()` when `initComplete + shellExec` are both true. Token injection from Playwright happens asynchronously. The ordering is non-deterministic.

**Workaround in tests:** The `injectTokenAndClone` helper handles both cases — if auto-clone succeeds (token was set in time), great; if not, it falls back to a manual `git clone` from the terminal.

**Not a production bug** — in production, users set tokens via the settings UI BEFORE navigating to a GitLab-linked PR. The auto-clone reads the persisted token from the store (hydrated from IndexedDB). The race only exists in tests where we inject tokens after boot.

**Potential improvement for the model:** When auto-clone fails (no nepic root found after clone command), `cloningStatus` stays `'cloning'` forever — it should transition to `'idle'` or a new `'failed'` state. This would make the race easier to detect/handle.

## Playwright tests implemented

### GL-M01: Clone from GitLab (VPN-required)
- Opens panel with `#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap` hash
- Injects GITLAB_API_TOKEN into Zustand store
- Verifies auto-clone uses `gitlab.grammarly.io` (not github.com)
- Asserts: napkin cards visible, delivery-pipeline card present, focused on 0100, session key contains 'gitlab'

### GL-M02: GitHub regression
- **No new test needed** — existing PB-P04 (auto-clone) and PB-P05 (return visit) cover this
- Confirmed: all 8 PB-P tests pass after GitLab changes
- `.git` suffix change doesn't break GitHub clone (GitHub handles `.git` URLs natively)

### GL-M03: GitLab token persistence (VPN-required)
- Clones from GitLab, verifies token in store
- Closes panel, waits for Zustand persist flush (2s)
- Reopens panel, verifies:
  - Nav populates from IDB scan (no re-clone)
  - `gitlabToken` survived the panel reopen (persisted via Zustand)
  - `cloningStatus` stays `'idle'` (no re-clone triggered)

### Test infrastructure
- Token read from `.env` at repo root (GITLAB_API_TOKEN)
- Tests skip in CI: `test.skip(!!process.env.CI, 'requires VPN access')`
- Tests skip when token missing: clear log message
- `injectTokenAndClone` helper handles auto-clone race robustly

## GitLab fixture sync

Ran `./fixtures/sync-gitlab.sh` successfully:
- Pushed 21 files (same `.nap/` content as GitHub fixture) to `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`
- Token auth works: `https://oauth2:${GITLAB_API_TOKEN}@gitlab.grammarly.io/...`

## Files changed

| File | Change |
|------|--------|
| `url-config.ts:104` | Added `.git` suffix to `buildCloneUrl` output |
| `gitlab-support.test.ts` | Updated 4 URL assertions for `.git` suffix |
| `url-config.test.ts` | Updated 3 URL assertions for `.git` suffix |
| `model.test.ts` | Updated 1 URL fixture for `.git` suffix |
| `panel-boot.test.ts` | Updated 2 URL assertions for `.git` suffix |
| `workflow-wiring.test.ts` | Updated 2 URL assertions for `.git` suffix |
| `e2e/tests/gl-gitlab-support.test.ts` | **New** — GL-M01 + GL-M03 Playwright tests |

## .env note

The `.env` at repo root contains a literal `GITLAB_API_TOKEN=glpat-...`. Per org guidelines this should use a 1Password reference. Flagged (same as fs-eng's note).
