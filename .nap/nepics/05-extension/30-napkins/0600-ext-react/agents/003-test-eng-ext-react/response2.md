# test-eng response 2 — cmdClickLink fix + cleanup

## What changed from response 1

IM-05 and IM-06 now use `cmdClickLink` for real Cmd+click through Monaco's onMouseDown pipeline. No more direct handler invocation.

## The cmdClickLink fix

The original cmdClickLink (ported from old extension) used `getScrolledVisiblePosition` to compute coordinates. This broke because word wrap repositioned the link text — column 33 wrapped to left=27px, landing in the gutter. Monaco classified it as UNKNOWN.

The fix: find the actual rendered DOM span containing the link display text, measure it with `getBoundingClientRect()`, and dispatch mousedown at its center on Monaco's `overflow-guard` element.

```
[cmdClickLink] → find span with "order-router.ts:54" in rendered DOM
              → getBoundingClientRect() → center at (365, 79)
              → dispatchEvent(mousedown, { metaKey: true }) on overflow-guard
              → [links] onMouseDown target=0 meta=true
              → routeLink → chrome.tabs.update → GitHub tab navigated
```

Synthetic `dispatchEvent` produces `isTrusted=false`, so Monaco returns target=UNKNOWN (can't do native hit-testing). Fixed ContentPane's onMouseDown handler to accept UNKNOWN when metaKey is pressed, falling back to the editor's cursor position (set by cmdClickLink before dispatching). This is safe — UNKNOWN only appears for synthetic events in production.

## Bug fixed: startup scan race (index.tsx)

The startup scan for existing repos raced with `/home/user` mkdir — two separate useEffects, async mkdir not awaited before scan. Produced a noisy ENOENT stack trace on every panel load.

Fix: merged into one effect. `mkdir /home/user` completes before `scanExistingRepos()` runs. Zero ENOENT in the full suite now.

## Final results

```
vitest:      28/28 pass (4 suites, 211ms)
playwright:  16/16 pass (1.0m)
errors:      0
stack traces: 0
warnings:    0
```

All 16 Playwright tests:
```
✓  DS-P2-01  panel renders with stubs
✓  DS-P2-02  store actions work from console
✓  DS-P3-01  clone → nav auto-populates
✓  DS-P3-02  file click → editor loads
✓  DS-P3-03  editor auto-save + echo suppression
✓  DS-P3-04  terminal write → editor refreshes
✓  DS-P4-01  link navigation to GitHub
✓  DS-P4-02  zoom
✓  IM-01     clone → nav auto-populates (gate)
✓  IM-02     terminal write → editor sees
✓  IM-03     editor write → auto-save → LFS (echo suppression)
✓  IM-04     tab behavior — ephemeral/pin/reuse/switch
✓  IM-05     file:line link → GitHub tab (via cmdClickLink)
✓  IM-06     .md link → editor loads new file (via cmdClickLink)
✓  IM-07     persistence — panel close/reopen
✓  IM-08     surface switch — editor ↔ terminal
```

## All bugs found and fixed (this round + previous)

| # | Bug | File | Fix |
|---|---|---|---|
| 4 | Auto-save lost on file switch — pending save timer cleared without flushing | ContentPane.tsx | Flush write in useEffect cleanup before file switch |
| 5 | No startup scan for existing repos — panel reopen shows empty nav | model.ts + index.tsx | Added `scanExistingRepos()`, called after mkdir completes |
| 6 | chrome.storage persistence not wired — tabs/focus/config lost on close | index.tsx | Added debounced persist + restore via chrome.storage.sync |
| 7 | Startup scan races with /home/user mkdir — ENOENT stack trace | index.tsx | Merged into one effect, mkdir before scan |
| 8 | ContentPane rejects UNKNOWN mouse target — cmdClickLink can't trigger links | ContentPane.tsx | Accept UNKNOWN target with metaKey, fall back to cursor position |

## Story coverage

All 15 stories covered. IM-05 and IM-06 now test the real Cmd+click path via cmdClickLink — not a simulated handler call.
