# 001-test-arch-v0 — response3

## The problem

47 tests pass. The extension doesn't work when a human uses it. Every test bypasses user interaction via `window.__` hooks.

## What I produced

`0100-v0.ux-test.md` — one end-to-end UX test (E2E-UX-1) that does exactly what a first-time user does. 9 steps, no `window.__` hooks except `editor.action.openLink` (justified — Cmd+hover+click can't be reliably simulated in Playwright, but the action exercises the same resolveLink chain).

## The 3 reported bugs traced to root cause

### Bug 1: nav tree doesn't auto-refresh
`git-command.ts` clone completes at line 64, returns `{ stdout: "done." }` — no callback, no event. `refreshNavTree()` exists but is only called via `window.__refreshNavTree()` test hook. Shell has no `onCommandComplete` mechanism.

**Fix needed:** shell callback after git commands → triggers `refreshNavTree()`.

### Bug 2: settings unreachable
`manifest.json` line 29: `"default_popup": "popup.html"`. But `background.ts` line 5: `setPanelBehavior({ openPanelOnActionClick: true })`. These conflict. Extension icon click opens side panel, not popup. Settings form exists in popup.html but user can't reach it.

**Fix needed:** move settings INTO the side panel. Remove `default_popup` from manifest. Register popup.html as `options_ui` for right-click → "Options" fallback.

### Bug 3: Cmd+click on links doesn't work
Link provider is registered (`side-panel.ts:514`). `provideLinks` returns links with `url: href`. But `resolveLink` at lines 562/566 sets `link.url = undefined` for openDoc and openCode actions before calling the side-effect function. Monaco sees `url = undefined` after resolve → treats link as "no destination" → click does nothing.

**Fix needed:** either (a) set `link.url` to the actual target URL and let Monaco handle the open, or (b) switch to `editor.onMouseDown` with Cmd detection and manual link finding — more reliable than fighting Monaco's link provider semantics.

## 7 UX gaps identified

| # | Gap | Severity |
|---|-----|----------|
| 1 | Settings unreachable (popup vs side panel conflict) | Blocking |
| 2 | Nav tree doesn't auto-refresh after clone | Blocking |
| 3 | Cmd+click on links broken (resolveLink nulls the url) | Blocking |
| 4 | No feedback when main-repo config missing (links go to OWNER/REPO 404) | High |
| 5 | No auto-save indicator (user doesn't know if edits saved) | Medium |
| 6 | Manifest popup/sidePanel conflict is fragile | Medium |
| 7 | Nav tree sections collapsed by default (needs clicks to expand) | Low (expected behavior) |

## What's acceptable to fake

- Opening the side panel via trigger button (can't click browser chrome)
- Reading editor content via `getModel().getValue()` (no other way to assert)
- Activating links via `setPosition` + `editor.action.openLink` (Cmd+hover+click unreliable in Playwright; the action exercises the same resolveLink → route → navigate chain)

## What MUST be real user interaction

- Typing git clone in terminal (keyboard.type + Enter)
- Nav tree auto-populating after clone (NO `window.__refreshNavTree()`)
- Clicking a file in the nav tree (real DOM click on `.nav-file`)
- Settings configuration (real UI in the side panel)
- GitHub tab URL after link click (real browser state)
