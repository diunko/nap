# panel boot — spec

## Read before building

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.nap.md`

## Boot sequence

Panel mount is a state machine with three terminal states:

```
mount → chrome.tabs.query({ active: true, currentWindow: true })
  → tab.url on github.com + has nap hash   → SESSION (auto-clone or IDB resume)
  → tab.url on github.com + no nap hash    → CONNECT MODAL
  → tab.url not github.com                 → NOT_GITHUB message
```

Nothing renders (no terminal, no sidebar, no editor) until one of the three states is reached. The gate component shows a loading indicator during the `chrome.tabs.query` call.

## Config derivation

Identical to 0650 — pure functions in `url-config.ts`:
- `parseNapHash(hash)` → `NapHashConfig | null`
- `parsePageUrl(pathname)` → `PageInfo`
- `deriveStateKey(page, hash)` → string
- `buildNapConfig(page, hash)` → `NapConfig`

One change: `mainBranch` defaults to `main`. The `.head-ref` DOM read is gone (panel can't access page DOM). Acceptable for v0 — `mainBranch` only affects blob URL construction, and `main` is correct for most cases.

## Session creation

Session is created AFTER config is known. The model receives config at construction time, not via a deferred `applyConfig` call.

```
config known → createSession(key) → model created with config → model.init()
  → scanExistingRepos → checkAutoClone (simplified: config always present)
```

`checkAutoClone` loses two guards: `if (!config) return` and the `initComplete` sequencing with `applyConfig`. Config is a constructor dependency, not a late-arriving message.

## Content script

Shrinks to:
- `chrome.runtime.onMessage` handler for `{ type: 'navigate', url }` → `window.location.href = url`
- Trigger button (`#nap-open-panel`) for Playwright tests
- `document.body.dataset.napLoaded = 'true'` marker

Everything else deleted: hash parsing, config messaging, SPA observer, `get-nap-config` handler.

## Connect modal

Shown when `parseNapHash` returns null on a github.com page.

Fields:
- Nap repo URL (required) — e.g. `https://github.com/org/nap-repo`
- Branch (optional, default `main`)
- Napkin path (optional) — e.g. `01-v1/0100-feature`

Auto-filled from tab URL:
- Main repo owner + name (from pathname)
- PR number (from `/pull/N` in pathname, or 0)

Submit builds `NapConfig` from form values → same flow as hash-derived config.

## Refresh PR

Header bar button. On click:
1. `chrome.tabs.query({ active: true })` → re-read tab URL
2. Re-parse hash (may have changed if user edited URL)
3. Update `store.mainRepoConfig` if changed
4. Update `store.prNum` if changed
5. Invalidate `store.prDiffRanges` → re-fetch from GitHub API

Does NOT:
- Switch session or remount
- Touch the .nap filesystem
- Trigger git operations

## Manifest changes

Add `"scripting"` to permissions — needed for content script injection on handshake failure.

Handshake: panel sends `nap-hello` to active tab → expects `nap-here` response. If no response (content script not injected), panel uses `chrome.scripting.executeScript` to inject `content.js`, then retries. This is only needed for the `navigate` handler — config is independent.

## What "done" looks like

- Open panel on PR with nap hash → session starts, clone, nav, links work. No blank screen.
- Open panel on PR with nap hash after extension reload → same. No page reload needed.
- Open panel on bare github.com → connect modal. Fill in repo → session starts.
- Open panel on google.com → "open on GitHub" message.
- Click [refresh PR] → diff ranges update. Click [fetch latest] → .nap repo updates.
- Two browser windows with different PRs → two independent sessions.
