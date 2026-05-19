# response — 003-test-eng-design-impl

## status: done

## test results

- **vitest**: 29/29 passed (nav-tree 11, link-routing 14, theme 4)
- **Playwright**: 22/22 passed (21 original + 1 new S4 test)
- **tsc --noEmit**: not run separately (build succeeded with zero vite errors)
- **regressions**: 0

Fs-eng's reported results independently confirmed.

## bug found and fixed

**Ephemeral tab pin race condition** — `model.setValue()` inside `openFile` fires `onDidChangeModelContent`, which calls `tabManager.pinActiveEphemeral()` before the tab is updated. Every file open from nav was pinning the previous ephemeral tab, making it permanent. Single-click file browsing would accumulate tabs instead of reusing the ephemeral slot.

**Fix**: added `isLoadingFile` guard in `side-panel.ts`. The `onDidChangeModelContent` handler now skips `pinActiveEphemeral()` when `isLoadingFile` is true. `openFile` sets the flag around `model.setValue()`.

This is a real UX bug — not a test artifact. Without the fix, the S4 ephemeral tab test is impossible to pass because the behavior doesn't match the spec.

## gap tests added

### 1. Terminal dark theme assertion (added to test-7 in happy-path-debug.spec.ts)

Verifies:
- `#terminal-surface` has computed `backgroundColor` of `rgb(30, 30, 30)` (#1e1e1e)
- `--term-bg` CSS variable is `#1e1e1e`

Covers TA gap S1/S4: terminal has dark theme, not the old light theme.

### 2. Ephemeral/permanent tab behavior (new S4 test in gap-tests.spec.ts)

Full lifecycle:
1. Open file A → ephemeral tab (italic, `.ephemeral` class)
2. Open file B → ephemeral slot reused (still 1 editor tab, label changes)
3. Edit file B → tab pinned to permanent (no `.ephemeral` class, normal font-style)
4. Open file C → new ephemeral tab appears alongside permanent B (2 editor tabs)

Covers TA gap S4: ephemeral vs permanent tab behavior.

## pre-existing test bugs fixed

**T5.4 and L4 race condition** — same issue the fs-eng fixed in cmd-click.spec.ts. These tests called `window.__setMainRepoConfig` before `main()` finished registering test hooks (hooks are set at step 17 of init, Monaco appears at step 4). Added the same `toPass` poll guard waiting for `__setMainRepoConfig` to be a function.

These were pre-existing — they passed before only due to timing luck. The S4 test changed the test ordering enough to expose them consistently.

## UX e2e review

`ux-e2e.spec.ts` (E2E-UX-1) is clean:
- Steps 1-6: real user actions (browser nav, DOM clicks, keyboard typing)
- Settings: real form fill + button click, no `window.__` hooks
- Clone: real terminal typing
- Nav tree: real auto-refresh check (no manual `__refreshNavTree`)
- Chapter click: real DOM click on `.napkin-card` header + `.file-row`
- `window.__editor` used only for reading editor content (line 111) and computing link coordinates (cmdClickLink helper) — both justified, no alternative
- No unnecessary internal testing

No changes needed. The test does what a real user does.

## summary

| Category | Count | Status |
|---|---|---|
| vitest (pure logic) | 29 | all pass, untouched |
| Playwright (original) | 21 | all pass |
| Playwright (new S4) | 1 | passes |
| total | 51 | 51/51 green |
| regressions | 0 | |
| bugs found | 1 | ephemeral tab pin race — fixed |
| pre-existing bugs fixed | 1 | T5.4/L4 hook race — fixed |
| TA gaps covered | 2/2 | terminal dark theme + ephemeral tabs |
