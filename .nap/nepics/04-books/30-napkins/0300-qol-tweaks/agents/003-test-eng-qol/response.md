# Test engineer response — 0300-qol-tweaks

## Results

**75 tests, 75 passing. 0 failures.**

- Small tests: 64 passing (5 files, vitest)
- Medium tests: 11 passing (4 files, Playwright + Electron)

All 22 test cases from `0300-qol-tweaks.test.md` implemented, plus 2 additional tests for terminal fit bug fix.

## Test files

| File | Size | Cases | Status |
|---|---|---|---|
| `tests/theme-system.test.ts` | small | TH-01, TH-02, TH-03, TH-04, TK-01 (14 tests) | ✓ |
| `tests/terminal-tab-refactor.test.ts` | small | TT-01 through TT-05 (14 tests) | ✓ |
| `tests/terminal-link-routing.test.ts` | small | TL-01, TL-02, TL-03 (12 tests) | ✓ |
| `tests/rendered-mode.test.ts` | small | RM-01, RM-02, RM-03, RM-04, RM-07 (21 tests) | ✓ |
| `tests/git-gutter-race.test.ts` | small | GG-04 (3 tests) | ✓ |
| `tests/git-gutter-refresh.spec.ts` | medium | GG-01, GG-02, GG-03, GG-05 (4 tests) | ✓ |
| `tests/rendered-mode.spec.ts` | medium | RM-05, RM-06, TS-01 (3 tests) | ✓ |
| `tests/theme-css.spec.ts` | medium | TH-05, TH-06 (2 tests) | ✓ |
| `tests/terminal-fit.spec.ts` | medium | terminal fit rAF deferral (2 tests) | ✓ |

## Findings

### 1. `<hr>` does not get `data-source-line` (RM-03)

The `source_line` plugin in `markdown-renderer.ts` only handles tokens with `nesting === 1` (opening tags). `<hr>` is self-closing (`nesting === 0`), so it gets no `data-source-line` attribute. This means Cmd+click near an `<hr>` will walk up to the nearest block parent's source line. Acceptable limitation — not a bug, just a gap in the design.

### 2. `electronAPI` is read-only (contextBridge)

`window.electronAPI` properties are exposed via Electron's `contextBridge.exposeInMainWorld`, making them read-only. Medium tests cannot monkey-patch individual API functions for instrumentation. For GG-05 (200ms delay verification), used an indirect approach: verify decorations appear after the delay rather than timing the IPC call directly.

### 3. Monaco `EditorOption` enum not directly accessible in Playwright evaluate

For TS-01, `editor.getOptions().get(monaco.editor.EditorOption.tabSize)` returned `undefined` in the Playwright evaluate context. Used `model.getOptions().tabSize` instead, which gives the resolved value directly.

### 4. Terminal fit bug — narrow wrapping on activation (FIXED)

Terminals often rendered with text wrapped at ~4-5 characters. Root cause: `fitAddon.fit()` in Terminal.tsx ran synchronously in `useEffect`, before the browser had completed layout of the container. This sent tiny cols to the PTY via `pty.resize()`, causing the agent's output to wrap at that width.

**Fix:** Deferred `fit()` + `pty.resize()` + `focus()` to `requestAnimationFrame()` in Terminal.tsx's `useEffect([activeTerminalId])`. rAF fires after the browser has completed layout, so fitAddon measures the real container dimensions.

**Also changed:** `index.tsx` — exposed `getTerminal` as `__getTerminal__` test hook (same pattern as `__napStore__`, `__monaco__`). Keybinding: `Cmd+Shift+H` → `Cmd+J` for rendered mode toggle (Cmd+H is intercepted by macOS/Electron "Hide" menu).

## Environment notes

- Small tests need `vi.mock('monaco-editor')` since store.ts now imports themes.ts which imports monaco. Tests that call `cycleTheme` or `toggleRenderMode` (which persist state) also need `vi.stubGlobal('window')` and `vi.stubGlobal('document')` since vitest runs in Node.
- Medium tests follow the existing `git-gutter.spec.ts` pattern exactly.
