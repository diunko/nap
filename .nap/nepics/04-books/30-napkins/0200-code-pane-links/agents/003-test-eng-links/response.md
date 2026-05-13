# 003-test-eng-links — response

## Results

**90 tests, all passing.** 79 small (vitest) + 11 medium (Playwright). Full suites green — no regressions (415 vitest, 77/78 Playwright — the 1 failure is pre-existing `smoke.spec.ts` BUG 2 from 0100).

## Test files created

### Small tests (vitest — 79 tests)

| File | Cases | Area |
|---|---|---|
| `tests/link-routing.test.ts` | 26 | L01-L07: routeLink, parseLinkHref, extractProjectRoot, path resolution |
| `tests/right-pane-store.test.ts` | 5 | P01-P04: rightPaneMode, openCode, setActiveTerminal state |
| `tests/tabs-store.test.ts` | 14 | T01-T06, T08: ephemeral/pinned tabs, close, terminal tabs, per-nepic memory |
| `tests/git-diff-parser.test.ts` | 13 | G01-G05: parseGitDiff — add/modify/delete hunks, binary, empty, edge cases |
| `tests/shift-enter.test.ts` | 16 | SE01-SE05: detectLinePattern — indent+bullet+prefix, break-out |
| `tests/code-watching.test.ts` | 5 | W01-W04, W06: ContentWatcher — change, atomic write, stop, debounce, independence |

### Medium tests (Playwright — 11 tests)

| File | Cases | Area |
|---|---|---|
| `tests/right-pane.spec.ts` | 3 | P05-P07: mode switching, line highlight, code display read-only + language detection |
| `tests/tabs.spec.ts` | 3 | T07, T09-T10: model disposal on close, edit pins ephemeral, middle-click close |
| `tests/git-gutter.spec.ts` | 2 | G06-G07: decoration rendering on modified file, gutter update after auto-save |
| `tests/shift-enter.spec.ts` | 2 | SE06-SE07: Monaco keybinding integration, break-out in Monaco |
| `tests/code-watching.spec.ts` | 1 | W05: scroll preservation on external file update |

## Bug found and fixed

### BUG: `detectLinePattern` regex uses lazy `\s*?` — never parses indent

**File:** `src/renderer/napkin-markdown.ts:34`

**What:** The regex `/^(\s*?)(\* )?(\/\/\w+: )?(.*?)$/` uses lazy `\s*?` for the indent group. Since all subsequent groups are optional and `(.*?)$` can match everything, the regex engine never extends the indent match. Result: every input returns `indent=""` and `content="<entire line>"`.

**Impact:** Shift-enter continuation never detects indent, bullet, or prefix. It always inserts a plain newline with no continuation pattern. The feature is completely broken without this fix.

**Verification:**
```
"  * //DU: some thought" with \s*? → indent="", content="  * //DU: some thought"
"  * //DU: some thought" with \s*  → indent="  ", bullet="* ", prefix="//DU: ", content="some thought"
```

**Fix applied:** Changed `\s*?` to `\s*` (greedy). One character change. All 16 small tests and 2 medium tests pass.

## Medium test findings

### P05: Terminal state preserved across mode switches
The mixed surface correctly keeps both xterm and Monaco alive. Terminal hidden via `display: none` when code is active — not disposed. Switching back shows the same terminal state. No bug.

### P06: Line highlight timing works
The 1.5s CSS animation + 1.6s cleanup timer work correctly. Decoration appears immediately on navigation, fades out, and is removed. Tested with `deltaDecorations` inspection on line 10 of a code file.

### P07: Language detection + read-only
TypeScript detected correctly from `.ts` extension. Read-only flag prevents all edits — verified by typing via Monaco and checking content unchanged.

### T07: Model disposal on tab close
When the code tab is closed, `rightPaneMode` reverts to `terminal` and the code editor component unmounts. Note: a terminal tab from the agent boot persists — the test correctly checks for zero *file* tabs, not zero total tabs.

### T09: Edit pins ephemeral — works
Monaco `onDidChangeModelContent` fires on the first keystroke, which triggers `pinActiveEphemeral('left')`. Tab transitions from `ephemeral: true` to `ephemeral: false`. Verified via `editor.trigger('test', 'type', { text: 'x' })`.

### T10: Middle-click close on non-active tab
Middle-click (`button: 'middle'`) correctly closes the targeted tab without activating it first. Active tab (B) remains active after closing non-active tab (A).

### G06: Git gutter decorations
Tested on a file with 2 lines added after the initial commit. `git-gutter-added` decorations appear on the correct lines via `linesDecorationsClassName`. Verified via `model.getAllDecorations()`.

### G07: Gutter updates after auto-save
After typing new content, the 1s auto-save debounce fires, writes the file, then `refreshGitGutter` re-runs `file:git-diff`. Decoration count increases. Tested with 3s wait to accommodate debounce + IPC + decoration application.

### SE06: Shift-enter keybinding integration
Monaco keybinding `Shift+Enter` registered via `editor.addAction`. On a line with `* //A: first thought`, pressing Shift+Enter inserts a new line with `* //A: ` continuation. Line count increases by 1, cursor positioned after prefix.

### SE07: Break-out in Monaco
On a line with `  * //TE: ` (empty content after prefix), Shift+Enter breaks out — new line has no prefix, and the empty prefix line is cleared to just indent. Verified both the current line mutation and the new line content.

### W05: Scroll preservation on external update
Code file with 200 lines opened at line 100. After external write (appending a line), `model.setValue()` preserves scroll via `getScrollTop()` / `setScrollTop()` around the update. Scroll position within 50px tolerance.

## Pre-existing issue

### smoke.spec.ts timeout (not my bug)
The `smoke.spec.ts` test fails with `firstWindow()` timeout. This is BUG 2 from the 0100 test engineer response — the smoke test doesn't use the `launchApp` helper, so it inherits `NAP_SOCKET` from the running dev instance and hits socket conflicts. All other 77 Playwright tests pass.
