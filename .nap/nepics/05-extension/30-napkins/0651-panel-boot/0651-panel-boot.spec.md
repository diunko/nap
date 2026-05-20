# panel boot — spec

## Read before building

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/0650-workflow-wiring.nap.md`

## Boot state machine

```
mount → chrome.tabs.query({ active: true, currentWindow: true })
  → github.com + nap hash   → SESSION
  → github.com + no hash    → MESSAGE ("ask author for review link")
  → not github.com          → MESSAGE ("open on a GitHub page")
```

Nothing renders until a state is reached. Gate component shows loading during the `chrome.tabs.query` call.

## Config derivation

Same pure functions as 0650 (`url-config.ts`). One change: `mainBranch` defaults to `main` — no `.head-ref` DOM read (panel can't access page DOM).

## Session creation

Session created AFTER config known. Model receives config at construction, not via deferred `applyConfig`.

```
config → createSession(key) → model(config) → init() → scan → autoClone
```

`checkAutoClone` simplifies: config always present, no timing dance.

## Content script

~20 lines. Keeps:
- `navigate` handler (`window.location.href = url`)
- trigger button (Playwright)
- `napLoaded` marker

Deletes: hash parsing, config messaging, SPA observer, `get-nap-config`.

If content script missing (ext reload), link clicks fall back to `chrome.tabs.update(tabId, { url })`.

## Refresh PR

Header bar button. On click:
1. `chrome.tabs.query({ active: true })` → re-read tab URL
2. Re-parse hash, update `mainRepoConfig` + `prNum` if changed
3. Invalidate `prDiffRanges` → re-fetch from GitHub API

Does NOT switch session, remount, or touch .nap filesystem.

## Idle pane

Default surface is editor (not terminal). No file open → shows repo name, branch, calm bg. Terminal hidden until user clicks Terminal tab.

## What "done" looks like

- Open panel on PR with nap hash → session starts, no blank screen. Works after ext reload.
- Open panel on bare github.com → message. No terminal, no sidebar.
- Open panel on google.com → message.
- [refresh PR] → diff ranges update. [fetch latest] → .nap repo updates.
- Two windows, two PRs → two independent sessions.
- No file selected → idle pane with repo context. Terminal on demand.
