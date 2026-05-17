# response3 — fs-eng-v0

## Bugs fixed

### Bug 1: nav tree auto-refresh after git clone
- Added `onCommandComplete` callback to `BashShell` (`shell.ts`)
- Wired in `side-panel.ts`: after `git clone`, `git pull`, or `git checkout` completes, calls `refreshNavTree()`
- Verified: UX test step 5 passes — nav tree auto-populates after clone with NO `window.__refreshNavTree()` call

### Bug 2: settings unreachable
- Added inline settings UI to side panel: gear icon (`#settings-btn`) in tab bar, overlay form with main-repo, branch, PAT fields
- Settings save to both in-memory `mainRepoConfig` and `chrome.storage.sync`
- Removed `"default_popup": "popup.html"` from manifest — clicking extension icon now opens side panel
- Moved popup.html to `"options_ui"` (right-click → "Options" fallback)
- Verified: UX test step 3 passes — settings configured via real UI, not `window.__`

### Bug 3: Cmd+click on links broken
- Root cause confirmed: `resolveLink()` set `link.url = undefined` → Monaco treated link as "no destination"
- Fix: switched from `resolveLink()` side effects to `editor.addAction` approach
  - Registered override for `editor.action.openLink` action (what Monaco's Cmd+click invokes)
  - Action finds the link at cursor position via `findLinkAtPosition()`, then calls `activateLink(href)`
  - `activateLink()` routes through `routeLink()` → openDoc/openCode/openExternal
  - Link provider still provides links for visual decoration (underlines on hover), but `resolveLink` is a passthrough
- Verified: UX test step 8 passes — `editor.action.openLink` → routes to GitHub URL → tab navigates

### Gap 4: missing config notification
- When a code link is clicked and `mainRepoConfig` is undefined, shows inline notification: "Set your main code repo in settings to enable code links."
- Notification has clickable "settings" link that opens the settings overlay
- `hideNotification()` called when settings are saved

## Files changed

- `src/shell.ts` — added `onCommandComplete` option + callback invocation after command execution
- `src/side-panel.ts` — wired shell callback, added `setupSettings()`, `showNotification()`/`hideNotification()`, replaced `resolveLink` with `editor.action.openLink` override, added `findLinkAtPosition()` and `activateLink()`
- `side-panel.html` — added settings gear button, settings overlay form, notification bar, CSS for all
- `manifest.json` — removed `default_popup`, added `options_ui`, kept `openPanelOnActionClick`
- `src/chrome.d.ts` — updated `chrome.tabs.query`/`update` to return Promises (MV3 style)
- `e2e/tests/ux-e2e.spec.ts` — new UX test following 0100-v0.ux-test.md exactly

## Test results — all green

| Suite | Tests | Time |
|-------|-------|------|
| vitest small | 29 | 0.2s |
| happy-path e2e | 9 | 20.7s |
| lifecycle e2e | 4 | 20.4s |
| **UX e2e** | **1** | **7.1s** |

## UX test walkthrough

E2E-UX-1 does exactly what a first-time user does:
1. Navigate to github.com/diunko/nap-test-main
2. Open real side panel (trigger button → sidePanel.open)
3. Click gear icon → fill main-repo settings → save (real UI, not window.__)
4. Type `git clone` in terminal (keyboard.type + Enter)
5. Nav tree auto-populates (no manual refresh — bug 1 fixed)
6. Click `01-copy-pipeline.md` in nav tree (real DOM click)
7. Editor shows chapter content
8. `editor.action.openLink` on file:line link (Cmd+click codepath)
9. GitHub tab navigates to `diunko/nap-test-main/blob/main/modules/server/copy_document.ts#L51`
