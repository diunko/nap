# gitlab support — test architecture

## Seams

Five seams, ranked by where bugs will actually hide:

1. **Provider registry → clone URL** — pure mapping. Wrong hostname = clone fails silently against wrong server.
2. **Provider key → token selection** — the auth callback must pick the right token. Wrong token = 401 from GitLab, confusing for user.
3. **Auth flow wiring** — config.provider flows through session → model → TerminalPane → createGitCommand → onAuth. Many handoff points, currently unwired (getAuth prop not passed to TerminalPane in Panel).
4. **Settings persistence** — two independent tokens in chrome.storage.sync. Change one, other stays. Survive panel close/reopen.
5. **Host permissions** — manifest must list gitlab.grammarly.io (not gitlab.com). Wrong host = silent CORS failure.

## Test plan

### GL-S01: Provider registry mapping (small, vitest)

* **What:** `PROVIDERS` registry resolves key → hostname correctly
* **Subsystems:** url-config.ts (or new providers.ts)
* **Cases:**
  * `github` → `github.com`
  * `gitlab` → `gitlab.grammarly.io`
  * unknown key → throws (not silent fallback)
* **Where it breaks:** Someone adds a provider with a typo in hostname. Unknown provider silently falls back to github.com instead of erroring.
* **Verification:** Direct assertion on return value.
* **Note:** The current `buildCloneUrl` returns `gitlab.com` for gitlab — the spec says `gitlab.grammarly.io`. This test codifies the spec. The existing WW-S03 test (`url-config.test.ts:117-132`) needs updating to match.

### GL-S02: Clone URL construction with registry (small, vitest)

* **What:** `buildCloneUrl` uses the provider registry to construct the full HTTPS URL
* **Subsystems:** url-config.ts
* **Cases:**
  * `buildCloneUrl('github', 'diunko', 'nap-test-nap')` → `https://github.com/diunko/nap-test-nap`
  * `buildCloneUrl('gitlab', 'dmitry.unkovsky', 'nap-test-nap')` → `https://gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap`
  * `buildCloneUrl('unknown', 'org', 'repo')` → error
* **Where it breaks:** The if/else gets replaced by registry lookup but the registry object is malformed.
* **Verification:** Assert exact URL string.

### GL-S03: Token selection by provider (small, vitest)

* **What:** Given a provider key and a token map `{ githubToken, gitlabToken }`, the correct token is returned
* **Subsystems:** Wherever the token selection logic lives (git-command.ts onAuth, or a helper)
* **Cases:**
  * provider `github`, both tokens set → returns githubToken
  * provider `gitlab`, both tokens set → returns gitlabToken
  * provider `gitlab`, only githubToken set → returns undefined (not the wrong token)
  * provider `github`, no tokens → returns undefined
* **Where it breaks:** Someone refactors and the fallback returns the other provider's token. Or a new provider key gets no token mapping → silent auth failure.
* **Verification:** Assert the returned `{ username, password }` object.
* **Design hint:** Extract the selection logic as a pure function so this test doesn't need browser context.

### GL-S04: State-key isolation across providers (small, vitest)

* **What:** Same owner/repo on GitHub vs GitLab produces different state keys → different sessions
* **Subsystems:** url-config.ts `deriveStateKey`
* **Cases:**
  * `nap-repo=github/org/repo` vs `nap-repo=gitlab/org/repo` → different keys
  * (existing WW-S02 tests already cover same-PR-different-repo — this adds same-repo-different-provider)
* **Where it breaks:** State key doesn't include provider → GitLab session overwrites GitHub session in IDB.
* **Verification:** Assert key strings are different.
* **Note:** This is already partly tested. One explicit case for provider difference is enough.

### GL-S05: buildNapConfig with GitLab provider (small, vitest)

* **What:** `buildNapConfig` with a gitlab hash produces a config with the correct clone URL (using registry hostname)
* **Subsystems:** url-config.ts
* **Cases:**
  * `parseNapHash('#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap')` → config.cloneUrl contains `gitlab.grammarly.io`
  * config.provider available for downstream token selection
* **Where it breaks:** The config object loses the provider info, or the cloneUrl uses the wrong hostname.
* **Verification:** Assert config fields.
* **Design hint:** `NapConfig` or `NapHashConfig` should carry `provider` so the auth flow can use it. Currently `NapConfig` doesn't have a `provider` field — the fullstack engineer needs to add it.

### GL-S06: Settings — two tokens, independent persistence (small, vitest)

* **What:** Store holds githubToken and gitlabToken independently. Changing one doesn't affect the other. Both survive persist round-trip.
* **Subsystems:** store.ts, persistence via Zustand middleware
* **Cases:**
  * Set githubToken → gitlabToken stays null
  * Set gitlabToken → githubToken unchanged
  * Persist → rehydrate → both tokens intact
  * Clear githubToken → gitlabToken still there
* **Where it breaks:** Single `pat` field gets replaced by two fields but migration logic breaks old saved state.
* **Verification:** Store state assertions after actions + rehydration.
* **Note:** Follows the existing `persistence.test.ts` pattern with `createMemoryStorage()`.

### GL-M01: GitLab clone — full pipeline (medium, Playwright)

* **What:** Auto-clone from gitlab.grammarly.io with a valid PAT. Nav populates, chapters load.
* **Subsystems:** boot-gate → session → model → TerminalPane → createGitCommand(getAuth) → isomorphic-git → gitlab.grammarly.io
* **Flow:**
  1. Navigate to `github.com/diunko/nap-test-main/pull/1#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
  2. Open side panel
  3. Inject GitLab token via `page.evaluate(() => chrome.storage.sync.set({ gitlabToken: '...' }))`
     * Alternative: inject directly into store via `__napStore__.getState().setGitlabToken(token)` — depends on implementation
  4. Wait for auto-clone (navSections.length > 0)
  5. Assert: napkin cards visible, chapter content loads, cloningStatus === 'done'
* **Where it breaks:** Auth callback doesn't receive the token. CORS blocked because manifest has wrong hostname. Provider key not passed through the session chain.
* **Verification:** DOM assertions (napkin cards visible, editor content) + store assertions (navSections, cloningStatus).
* **Token source:** `process.env.GITLAB_API_TOKEN` (from `.env` at repo root).

### GL-M02: GitHub clone still works (regression) (medium, Playwright)

* **What:** Existing GitHub clone flow unbroken after adding GitLab support.
* **Subsystems:** Same as GL-M01 but with `nap-repo=github/...`
* **Flow:** Same as IM-01 / PB-P04. Just run the existing tests.
* **Where it breaks:** Provider registry refactor breaks the default github path. Token selection returns undefined for github when it used to work without auth (public repo).
* **Verification:** Existing IM-01, PB-P04, PB-P05 tests pass.
* **Note:** No new test needed — this is a "run existing tests" checkpoint. If they pass, the regression is clear.

### GL-M03: GitLab token persistence across panel reopen (medium, Playwright)

* **What:** Enter GitLab PAT → close panel → reopen → clone works without re-entering token.
* **Subsystems:** settings UI → chrome.storage.sync → panel reopen → hydration → getAuth
* **Flow:**
  1. Open panel on GitLab-linked PR
  2. Inject GitLab token
  3. Clone succeeds
  4. Close panel
  5. Reopen panel on same URL
  6. Assert: nav populates from IDB (return visit, no re-clone needed)
  7. If re-clone needed (IDB wiped): clone still works because token is in chrome.storage.sync
* **Where it breaks:** Token saved in Zustand (per-session) but not in chrome.storage.sync → lost on session change. Or token in chrome.storage.sync but getAuth reads from Zustand → not hydrated yet when clone fires.
* **Verification:** DOM assertions on second panel open.

## VPN-gated tests

GL-M01 and GL-M03 require network access to `gitlab.grammarly.io`, which is behind the Grammarly VPN.

**Flagging strategy:**
* Tag these tests: `test.describe('GL-M: GitLab clone (VPN-required)', ...)`
* Skip in CI: `test.skip(!!process.env.CI, 'requires VPN access to gitlab.grammarly.io')`
* Run locally: developer connects to VPN, sets `GITLAB_API_TOKEN` in `.env`, runs `npx playwright test --grep "GL-M"`
* The test file should log clearly when skipping: "Skipping GitLab clone tests — CI environment or no GITLAB_API_TOKEN"

## Token injection for Playwright

Two strategies, depending on how the fullstack engineer implements token storage:

**Option A: chrome.storage.sync** (preferred, matches spec)
```typescript
await panel.evaluate((token) => {
  chrome.storage.sync.set({ gitlabToken: token });
}, process.env.GITLAB_API_TOKEN);
// Wait for storage listener to propagate to store
await panel.waitForTimeout(500);
```

**Option B: Direct store injection** (simpler for tests, but couples to implementation)
```typescript
await panel.evaluate((token) => {
  (window as any).__napStore__.getState().setGitlabToken(token);
}, process.env.GITLAB_API_TOKEN);
```

Option A tests more of the real flow. Option B is faster and more reliable. The test engineer should try A first and fall back to B if timing issues arise.

## Fixture prerequisite

GL-M01 and GL-M03 depend on the GitLab fixture repo being populated:
* `gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap` must have the same content as `github.com/diunko/nap-test-nap`
* `fixtures/sync-gitlab.sh` does this — run once before running GitLab Playwright tests
* The script needs `GITLAB_API_TOKEN` from `.env`

## Current code gaps (for fullstack engineer)

Observations from reading the code — things the fullstack engineer needs to wire up:

1. **`buildCloneUrl`** (`url-config.ts:93`) uses `gitlab.com` — spec says `gitlab.grammarly.io`. Introduce the provider registry here.
2. **`manifest.json:14`** has `gitlab.com/*` — needs `gitlab.grammarly.io/*`.
3. **`NapConfig`** has no `provider` field — downstream auth needs it. Add `provider: string` to `NapConfig` and populate in `buildNapConfig`.
4. **`TerminalPane`** receives `getAuth` prop but **Panel doesn't pass it** (`index.tsx:359-364`). The auth callback needs to be wired from settings/store through Panel into TerminalPane.
5. **Settings overlay** (`index.tsx:200-264`) has a PAT input but `handleSave` doesn't store it. Need: two fields, actual storage (chrome.storage.sync or store), read-on-mount.
6. **Unknown provider** — `buildCloneUrl` silently falls back to github.com. Should throw.

## Summary table

| ID | Test | Size | Runner | VPN? | What it catches |
|----|------|------|--------|------|-----------------|
| GL-S01 | Provider registry mapping | small | vitest | no | Wrong hostname, silent fallback |
| GL-S02 | Clone URL with registry | small | vitest | no | Malformed URL construction |
| GL-S03 | Token selection by provider | small | vitest | no | Wrong token returned, cross-provider leak |
| GL-S04 | State-key provider isolation | small | vitest | no | Session cross-contamination |
| GL-S05 | buildNapConfig with GitLab | small | vitest | no | Missing provider in config |
| GL-S06 | Two tokens, independent persist | small | vitest | no | Token migration, overwrite |
| GL-M01 | GitLab clone full pipeline | medium | Playwright | yes | Auth wiring, CORS, host permissions |
| GL-M02 | GitHub regression | medium | Playwright | no | Existing tests — no new test |
| GL-M03 | GitLab token persistence | medium | Playwright | yes | Token storage, rehydration timing |
