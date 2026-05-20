# test-architect response — 0651-panel-boot

## What I produced

`0651-panel-boot.test.md` — 15 test cases across three layers:

- **2 small** (PB-S01, PB-S02): boot-gate decision logic, activeSurface default change
- **3 medium vitest** (PB-M01..M03): model-with-config, refresh-PR, content-script-trim
- **8 Playwright** (PB-P01..P08): three gate states, auto-clone, return visit, refresh PR, idle pane, content-script fallback

Plus: explicit list of what to DELETE, CHANGE, and KEEP from 0650's tests.

## Key design decisions

**Boot-gate is the structural test.** Three terminal states, three Playwright tests. If the gate works, everything downstream works. If it doesn't, nothing does.

**Model-with-config replaces the timing dance.** WW-M02 tested a three-way race (init/config/shell). 0651 reduces it to two-way (init/shell) — config is always present at construction. Simpler tests, fewer ordering permutations.

**Refresh PR is an in-place update, not a session switch.** This is the trickiest seam. PB-M02 and PB-P06 both verify that session key, model, and filesystem are untouched — only store config and diff ranges change.

**DOM, not just model.** Every Playwright test has explicit DOM assertions (visibility, text content, element presence/absence). The lesson from 0600: model state green + DOM broken = broken.

## Risks flagged

1. `chrome.tabs.query` may return stale URL (GitHub SPA strips hash)
2. `activeSurface` default change breaks 3 existing Playwright tests (IM-02-DOM, IM-07-DOM, IM-08)
3. Refresh PR could accidentally create new session if key derivation differs
4. Idle pane flash on return visit if persisted state has `activeSurface: 'terminal'`

## What I deleted

WW-M01 (content script messaging) — entirely. Tests for hash parsing in content script, SPA observer, `get-nap-config` handler — all test things that no longer exist.
