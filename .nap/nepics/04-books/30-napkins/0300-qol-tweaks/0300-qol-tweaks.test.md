# 0300 — test architecture

Seven areas. Each test case: flow, subsystems, expected behavior, where it breaks, size, verification.

Naming convention: `T-0300-XX-NN` where XX is the area code and NN is the case number.

---

## 1. Tab size (TS)

### T-0300-TS-01: Editor config sets tabSize 2

**Flow:** ContentPane creates Monaco editor → editor options include `tabSize: 2` and `insertSpaces: true`.

**Subsystems:** ContentPane.tsx → Monaco editor creation options.

**Expected:** `editor.getOptions().get(monaco.editor.EditorOption.tabSize)` returns 2. `insertSpaces` is true.

**Where it breaks:** Auto-detect overrides explicit setting. Monaco's `tabSize` default is 4; if a file has existing 4-space indentation, auto-detect could override the explicit 2. The seam is between explicit config and auto-detect — the config must win for new/empty files.

**Size:** Medium — needs Monaco runtime to read back resolved options.

**Verification:** Launch app, open empty file, query editor options via `__monaco__`. Assert tabSize=2, insertSpaces=true. Also type a Tab key and verify 2 spaces inserted.

---

## 2. Terminal link routing (TL)

### T-0300-TL-01: Terminal .nap/ link → left pane (openDoc)

**Flow:** Terminal outputs `/Users/dev/project/.nap/nepics/01/30/0100.nap.md` → user clicks → file-link-provider fires `onOpen` → onOpen calls routeLink → result is `openDoc` → store.openDoc dispatched → left pane shows file.

**Subsystems:** file-link-provider.ts `activate` callback → routeLink() in routing-rules.ts → store.openDoc().

**Expected:** After click, `store.activeFilePath` equals the .nap path. `store.rightPaneMode` unchanged (still terminal). Left pane tab created.

**Where it breaks:** The onOpen callback still calls `shell.openPath` instead of routing. Or routeLink receives a raw absolute path but was designed for hrefs (no protocol prefix). The seam is the callback swap — old callback was fire-and-forget to Electron, new one needs to classify and dispatch.

**Size:** Small — routeLink is pure. Test that `routeLink({ href: '/Users/dev/project/.nap/nepics/01/30/0100.nap.md', sourceFilePath: '' })` returns `openDoc`. The tricky part: routeLink uses `sourceFilePath` for relative resolution. Terminal links are absolute, so sourceFilePath is irrelevant — but the function must handle empty/missing sourceFilePath gracefully.

**Verification:** Call `routeLink` with absolute .nap path and empty sourceFilePath. Assert `action === 'openDoc'`.

### T-0300-TL-02: Terminal code link → right pane (openCode) with line number

**Flow:** Terminal outputs `src/renderer/store.ts:42` → file-link-provider extracts path + line → onOpen receives resolved absolute path → routeLink classifies as openCode → store.openCode with line 42.

**Subsystems:** file-link-provider extractPathAndLocation → onOpen callback → routeLink → store.openCode.

**Expected:** `store.rightPaneMode === 'code'`, `store.rightFilePath` ends with `store.ts`, `store.rightFileLine === 42`.

**Where it breaks:** extractPathAndLocation strips the `:42` from the path before passing to onOpen, but line info is lost if onOpen signature only takes `absolutePath: string`. The new callback must receive both path and line. This is the critical seam — the existing `onOpen(absolutePath)` signature doesn't carry line/col. Either the callback signature changes, or line info is re-parsed from the path.

**Size:** Small — test the integration between extractPathAndLocation and routeLink. Given `src/renderer/store.ts:42` as terminal match, verify the full chain produces `openCode` with line 42. The question: does the new onOpen receive the raw match (with `:42`) or the resolved path (without)?

**Verification:** Unit test: call extractPathAndLocation with `src/renderer/store.ts:42`, then routeLink with the path. Verify line=42 is preserved through the chain.

### T-0300-TL-03: Terminal link — URL-like paths not misrouted

**Flow:** Terminal outputs `https://github.com/user/repo/blob/main/file.ts` → file-link-provider's `isUrl` check → skipped, not treated as file link.

**Subsystems:** file-link-provider.ts `isUrl` function.

**Expected:** No file link created for URL-like terminal output.

**Where it breaks:** Already tested in 0200, but worth re-verifying the isUrl guard still works after the onOpen callback swap. If the swap introduces a code path that bypasses isUrl, URLs could be misrouted.

**Size:** Small — existing test pattern. Assert `isUrl` still filters correctly.

**Verification:** Reuse existing test. Ensure the regex + isUrl guard is not broken by the callback change.

---

## 3. Theme system (TH)

### T-0300-TH-01: THEMES array structure validation

**Flow:** Import THEMES from themes.ts → validate each ThemeDef has required fields.

**Subsystems:** themes.ts.

**Expected:** Every theme has `name` (unique string), `monacoTheme` (IStandaloneThemeData with `base`, `inherit`, `rules`, `colors`), `shell` (object with `bg`, `bgSecondary`, `border`, `text`, `textMuted`, `accent`), `roleColors` (object with keys for all roles: `architect`, `user`, `fs-eng`, `test-arch`, `test-eng`).

**Where it breaks:** A theme is missing a shell property → CSS variable not set → element renders with inherited/default color (wrong). Or a theme is missing a role color → role comments fall back to some default color with bad contrast on that theme's background.

**Size:** Small — pure data validation, no runtime needed.

**Verification:** Import THEMES, iterate, assert structure. Check names are unique. Check at least 5 themes (4 light + 1 dark).

### T-0300-TH-02: cycleTheme rotates through THEMES array

**Flow:** Store state starts at THEMES[0] → cycleTheme() → state moves to THEMES[1] → ... → cycleTheme() from last → wraps to THEMES[0].

**Subsystems:** store.ts `cycleTheme` action → THEMES array.

**Expected:** After N calls to cycleTheme (where N = THEMES.length), currentThemeName returns to THEMES[0].name.

**Where it breaks:** Off-by-one in modulo. Or currentThemeName doesn't match any THEMES[i].name after rotation (lookup failure). The seam: cycleTheme stores a *name*, not an index. The name-to-index lookup on the next cycle must find the current theme.

**Size:** Small — store-only, no DOM.

**Verification:** Reset store, set initial theme, call cycleTheme N times, check currentThemeName after each call matches expected sequence.

### T-0300-TH-03: Theme persistence — save and restore

**Flow:** User cycles to "light-cream" → app saves `{ "theme": "light-cream" }` to ui-state.json → app restarts → loadPersistedUiState reads theme → store.currentThemeName = "light-cream".

**Subsystems:** store.ts persistence → ui-state.json → loadPersistedUiState.

**Expected:** After restart, currentThemeName matches what was saved.

**Where it breaks:** The persistence call writes the theme name, but loadPersistedUiState doesn't read it back. Or the field name in ui-state.json doesn't match between write and read ("theme" vs "themeName" vs "currentThemeName"). The seam is the serialization contract.

**Size:** Small — mock electronAPI.saveUiState and loadUiState. Verify round-trip.

**Verification:** Set theme via cycleTheme, assert saveUiState was called with correct shape. Mock loadUiState returning that shape, call loadPersistedUiState, assert store has correct theme.

### T-0300-TH-04: Theme fallback — saved theme not in THEMES array

**Flow:** ui-state.json has `{ "theme": "light-pink" }` but THEMES array doesn't include "light-pink" (was commented out) → loadPersistedUiState falls back to THEMES[0].name.

**Subsystems:** loadPersistedUiState → THEMES lookup.

**Expected:** currentThemeName === THEMES[0].name.

**Where it breaks:** No fallback logic — store blindly sets the saved name, then nothing matches, and the app renders with no theme applied. Or fallback logic throws instead of defaulting.

**Size:** Small — mock loadUiState returning unknown theme name.

**Verification:** Mock loadUiState with `{ "theme": "nonexistent" }`. Call loadPersistedUiState. Assert currentThemeName === THEMES[0].name.

### T-0300-TH-05: CSS variables applied to :root on theme switch

**Flow:** cycleTheme() → handler reads theme.shell → sets CSS custom properties on document.documentElement → all styled components pick up new colors.

**Subsystems:** store action or effect → document.documentElement.style.setProperty.

**Expected:** After theme switch, `getComputedStyle(document.documentElement).getPropertyValue('--nap-bg')` matches the new theme's `shell.bg`.

**Where it breaks:** setProperty calls use wrong variable names (e.g., `--bg` vs `--nap-bg`). Or the shell object keys don't map 1:1 to CSS variable names. Or the styled components still use hardcoded hex instead of var() references.

**Size:** Medium — needs DOM. The CSS variable assertion needs a real document.

**Verification:** In Playwright: trigger cycleTheme, read computed style for `--nap-bg`, compare to theme definition. Also spot-check sidebar background-color is using the variable (not hardcoded).

### T-0300-TH-06: Both Monaco editors receive theme on switch

**Flow:** cycleTheme() → `monaco.editor.setTheme(theme.name)` → both left pane (ContentPane) and right pane (CodeEditor) editors render with new theme.

**Subsystems:** store effect or handler → monaco.editor.setTheme → both editor instances.

**Expected:** Both editors use the same Monaco theme name after switch.

**Where it breaks:** `monaco.editor.setTheme` is global (applies to all editors), so calling it once should work. But if themes are defined per-editor (via create options) and not globally registered, the call fails silently. The seam: each ThemeDef's monacoTheme must be registered via `monaco.editor.defineTheme` before `setTheme` can reference it.

**Size:** Medium — needs Monaco runtime. Verify themes are registered at startup.

**Verification:** In Playwright: check `monaco.editor.setTheme` doesn't throw for each theme name. Verify both editors' background color changes after toggle.

---

## 4. Terminal tab refactor (TT)

### T-0300-TT-01: Single terminal tab — no accumulation

**Flow:** setActiveTerminal("agent-1") → setActiveTerminal("agent-2") → setActiveTerminal("agent-3") → rightTabs still has exactly 1 terminal tab.

**Subsystems:** store.ts setActiveTerminal → rightTabs array.

**Expected:** `rightTabs.filter(t => t.type === 'terminal').length === 1` always, regardless of how many setActiveTerminal calls.

**Where it breaks:** The old code creates a new tab per setActiveTerminal call (via upsertTab with different paths). The refactored code must update the existing terminal slot instead of creating new ones. If upsertTab still matches by `path` and path changes (different agent id), it creates a new tab.

**Size:** Small — store-only.

**Verification:** Reset store, call setActiveTerminal 3 times with different IDs. Assert rightTabs has exactly 1 terminal tab after each call.

### T-0300-TT-02: Terminal tab always at position 0

**Flow:** Open a code file (creates file tab) → setActiveTerminal → terminal tab is at index 0, file tab at index 1.

**Subsystems:** store.ts tab ordering.

**Expected:** `rightTabs[0].type === 'terminal'` regardless of insertion order.

**Where it breaks:** If file tab is opened first, it gets index 0. Terminal tab created later gets appended. Without explicit ordering, the terminal tab ends up after file tabs.

**Size:** Small — store-only.

**Verification:** openCode first, then setActiveTerminal. Check rightTabs[0].type === 'terminal'.

### T-0300-TT-03: Terminal tab title shows agent name

**Flow:** setActiveTerminal("agent-uuid-1") with agent name "001-architect" → terminal tab title = "001-architect".

**Subsystems:** store.ts setActiveTerminal → terminal tab title property. Needs agent lookup to resolve UUID → name.

**Expected:** Terminal tab has a `title` or display-name field matching the agent's `name` (not UUID).

**Where it breaks:** The tab's `path` field stores the agent ID (UUID). Title rendering might show path (UUID) if there's no separate title field. The seam: the store needs access to agent data (from napkins/architects) during setActiveTerminal to look up the name.

**Size:** Small — store test with agents in state.

**Verification:** Set up store with architects containing known agents. Call setActiveTerminal with an agent's ID. Assert the terminal tab's displayed title is the agent name, not UUID.

### T-0300-TT-04: Terminal tab can't be closed

**Flow:** Terminal tab exists → closeTab('right', terminalTabId) → tab persists.

**Subsystems:** store.ts closeTab guard.

**Expected:** closeTab on the permanent terminal tab is a no-op. Tab remains.

**Where it breaks:** The old code only prevents closing terminal tabs for *running* agents. The refactored code must prevent closing the permanent terminal slot unconditionally (regardless of agent state).

**Size:** Small — store-only.

**Verification:** setActiveTerminal, get the terminal tab's ID, call closeTab. Assert rightTabs still has 1 terminal tab.

### T-0300-TT-05: File tabs unaffected by terminal switches

**Flow:** Open code file A → setActiveTerminal("agent-1") → setActiveTerminal("agent-2") → code tab for A still in rightTabs, unchanged.

**Subsystems:** store.ts setActiveTerminal, openCode.

**Expected:** File tab path, ephemeral status, and position unchanged after terminal switches.

**Where it breaks:** If setActiveTerminal clears rightTabs or replaces all tabs with the terminal slot.

**Size:** Small — store-only.

**Verification:** openCode for file A, pin it. setActiveTerminal twice. Assert file tab still present with same properties.

---

## 5. Git gutter bug fixes (GG)

### T-0300-GG-01: Git diff requested on file open

**Flow:** User opens file → ContentPane loads content → model set → refreshGitGutter called → `electronAPI.fileGitDiff(filePath)` invoked → decorations applied.

**Subsystems:** ContentPane.tsx file-open effect → refreshGitGutter → electronAPI.fileGitDiff IPC → applyGitGutter.

**Expected:** fileGitDiff is called once per file open, and decorations appear without any save.

**Where it breaks:** The diff request fires before the model is ready (model is null when async response arrives). Or the diff request fires but the response arrives after a tab switch (model was swapped to a different file).

**Size:** Medium — needs Electron + Monaco + git repo. Existing pattern from git-gutter.spec.ts.

**Verification:** Launch app with git fixture (tracked file with modifications). Open the file. Assert git-gutter-added decorations appear without typing or saving. This is essentially T-0200-G06 but specifically verifying it works on first open (the bug case).

### T-0300-GG-02: Git diff requested on external file change

**Flow:** File is open in editor → external process modifies file → file watcher fires → ContentPane's onFileChanged callback updates model → refreshGitGutter called → new decorations applied.

**Subsystems:** Main process file watcher → bridge → renderer onFileChanged → model.setValue → refreshGitGutter.

**Expected:** After external edit, git gutter updates within ~1 second to reflect the new diff.

**Where it breaks:** The onFileChanged handler updates the model content but doesn't trigger a git diff re-request. The old code only re-requested diff on auto-save. The fix adds refreshGitGutter to the onFileChanged path.

**Size:** Medium — needs real file I/O and Electron.

**Verification:** Launch app, open tracked file, externally write new content to it. Wait for watcher + debounce + diff. Assert decorations updated to reflect new changes.

### T-0300-GG-03: Git diff requested on editor focus

**Flow:** User has two tabs open → switches to tab B → switches back to tab A → onDidFocusEditorText fires → refreshGitGutter called (debounced).

**Subsystems:** Monaco editor.onDidFocusEditorText → refreshGitGutter (debounced).

**Expected:** On focus return, git gutter refreshes — catches stale decorations from background file changes.

**Where it breaks:** The focus handler fires too frequently (every cursor click) without debounce, causing IPC spam. Or the debounce is too aggressive and the user doesn't see the update when returning to a tab.

**Size:** Medium — needs Monaco focus events.

**Verification:** Open two files in the app. Switch between tabs. Externally modify the first file while viewing the second. Switch back to first. Assert decorations update.

### T-0300-GG-04: Race fix — decorations applied to current model only

**Flow:** Open file A → diff request fires → user quickly switches to file B → diff response for A arrives → decorations must NOT apply to B's model.

**Subsystems:** refreshGitGutter → model identity check.

**Expected:** Decorations are discarded if the current model has changed since the request was issued.

**Where it breaks:** The async callback captures `editorRef.current` but doesn't check if the model is still the same. The decoration call succeeds but targets a disposed or wrong model.

**Size:** Small — can test the guard logic in isolation. Given a mock editor where getModel() returns model-B, and the response was for model-A, verify decorations are not applied.

**Verification:** Test the identity check: create a wrapper around applyGitGutter that accepts a model reference to compare. Assert it skips application when model reference doesn't match.

### T-0300-GG-05: 200ms delay between model update and diff request

**Flow:** Model content updates (from external change or file open) → 200ms delay → then fileGitDiff fires.

**Subsystems:** ContentPane.tsx → setTimeout 200ms → refreshGitGutter.

**Expected:** The delay gives git time to see the new file content on disk before we ask for a diff.

**Where it breaks:** No delay → git reads old content → diff shows stale result. Or delay is on the wrong path (only on save, not on external change).

**Size:** Medium — timing-sensitive. Verify the IPC call happens after 200ms, not immediately.

**Verification:** In medium test: mock fileGitDiff with a timestamp tracker. Trigger external file change. Assert fileGitDiff was called >= 200ms after the model update.

---

## 6. Rendered mode (RM)

### T-0300-RM-01: toggleRenderMode store action

**Flow:** leftPaneRenderMode starts as 'edit' → toggleRenderMode() → 'rendered' → toggleRenderMode() → 'edit'.

**Subsystems:** store.ts.

**Expected:** Toggles between 'edit' and 'rendered'. Initial value is 'edit'.

**Where it breaks:** Initial state undefined (not 'edit'), or toggle sets to some other value.

**Size:** Small — store-only.

**Verification:** Assert initial state. Toggle. Assert 'rendered'. Toggle. Assert 'edit'.

### T-0300-RM-02: Render mode is global — tab switch preserves mode

**Flow:** Toggle to rendered → switch tab → new tab still in rendered mode. Switch back → still rendered.

**Subsystems:** store.ts leftPaneRenderMode + tab switching (openDoc).

**Expected:** leftPaneRenderMode is independent of which tab is active. Switching tabs doesn't reset it.

**Where it breaks:** openDoc resets leftPaneRenderMode to 'edit' as a side effect. Or the ContentPane component resets mode in a useEffect triggered by activeFilePath change.

**Size:** Small — store-only.

**Verification:** Toggle to 'rendered'. openDoc to a different file. Assert leftPaneRenderMode still 'rendered'.

### T-0300-RM-03: markdown-it source line mapping

**Flow:** Parse markdown text with markdown-it → HTML output → block-level elements have `data-source-line` attributes matching token map.

**Subsystems:** markdown-it parse → custom renderer/plugin → HTML string.

**Expected:** `<p data-source-line="1">`, `<h1 data-source-line="5">`, `<li data-source-line="8">`, `<table>` rows with source lines, `<hr data-source-line="12">`.

**Where it breaks:** The `map` property on markdown-it tokens is not enabled (need to check configuration). Or the custom renderer only handles some block types (paragraphs but not list items). Or the line numbers are 0-indexed (markdown-it) but Monaco expects 1-indexed.

**Size:** Small — pure function. Pass markdown string to parse function, inspect HTML output for data-source-line attributes.

**Verification:** Parse a markdown string containing heading, paragraph, list, table, and HR. Assert each block element in output HTML has correct `data-source-line` value. Verify line numbers are 1-indexed (matching Monaco convention).

### T-0300-RM-04: Role comments render as colored blocks

**Flow:** Markdown containing `//A: architecture thought` → markdown-it plugin detects pattern → wraps in `<span class="role-comment role-architect">`.

**Subsystems:** Custom markdown-it plugin or regex post-process.

**Expected:** Each role prefix (//A:, //DU:, //FS:, //TA:, //TE:) gets a corresponding CSS class.

**Where it breaks:** The regex doesn't match `//A:` at the start of a list item (it's inside `<li>` content). Or the plugin runs on core rules but misses inline content inside block elements. The seam: role comments appear inside list items and paragraphs, not as standalone blocks.

**Size:** Small — parse markdown with role comments in bullets, inspect HTML for class names.

**Verification:** Parse `* //A: thought` and `* //DU: user note`. Assert output contains elements with `role-architect` and `role-user` classes respectively. Test with nested list items.

### T-0300-RM-05: Cmd+click in rendered view → edit mode at source line

**Flow:** User Cmd+clicks a paragraph in rendered view → handler walks DOM to nearest `[data-source-line]` → reads line number N → sets leftPaneRenderMode to 'edit' → calls editor.setPosition({ lineNumber: N, column: 1 }) → editor.focus().

**Subsystems:** ContentPane click handler → DOM traversal → store.toggleRenderMode → Monaco editor.setPosition.

**Expected:** After Cmd+click, mode is 'edit', cursor is on the correct source line, editor has focus.

**Where it breaks:** DOM walk doesn't find `data-source-line` (click target is deeply nested inside a span with no attribute). Or the line number is 0-indexed from markdown-it but setPosition expects 1-indexed. Or the editor ref is null when switching from rendered to edit mode (editor was unmounted in rendered mode).

**Size:** Medium — needs DOM + Monaco.

**Verification:** In Playwright: toggle to rendered mode. Cmd+click on a specific paragraph. Assert mode switches to 'edit'. Assert cursor lineNumber matches the source line. Assert editor has focus.

### T-0300-RM-06: Links in rendered view route through routeLink

**Flow:** User clicks `<a href="./sibling.md">` in rendered view → click handler extracts href → routeLink classifies → dispatches to openDoc or openCode.

**Subsystems:** ContentPane rendered view click handler → routeLink → store dispatch.

**Expected:** Regular click (no Cmd) on a link in rendered HTML triggers routing, same as in edit mode. `<a>` tags with code paths open in right pane, `.md` paths open in left pane, external URLs open in browser.

**Where it breaks:** The click handler uses `e.preventDefault()` but the browser's default `<a>` navigation fires first. Or Cmd+click (which is supposed to trigger edit-at-line) intercepts link clicks. Need to distinguish: plain click on `<a>` → route link; Cmd+click anywhere → edit at source line.

**Size:** Small for routing logic (reuses routeLink tests). Medium for the click handler discrimination.

**Verification:** Small: verify routeLink handles rendered-view links the same as edit-mode links. Medium: in Playwright, click a link in rendered view, assert correct store state. Cmd+click the same link, assert edit mode triggered instead of routing.

### T-0300-RM-07: Rendered mode persistence in ui-state.json

**Flow:** Toggle to rendered → app saves `{ "leftPaneRenderMode": "rendered" }` → restart → mode restored.

**Subsystems:** store persistence → ui-state.json → loadPersistedUiState.

**Expected:** Render mode survives app restart.

**Where it breaks:** Not persisted at all. Or persisted but not restored in loadPersistedUiState.

**Size:** Small — mock round-trip, same pattern as theme persistence.

**Verification:** Toggle mode, assert saveUiState called with correct field. Mock loadUiState returning it, assert store restored.

---

## 7. Tokenizer tweak (TK)

### T-0300-TK-01: Generic // comment color matches //DU: color

**Flow:** Theme definitions in themes.ts → token rules: `comment` foreground must equal `comment.user` foreground.

**Subsystems:** themes.ts (all theme definitions) or napkin-markdown.ts theme rules.

**Expected:** For every theme in THEMES, the `comment` token rule foreground is the same as the `comment.user` token rule foreground.

**Where it breaks:** Only updated in one theme (e.g., dark) but not in the new light themes. Or the theme definition has `comment` and `comment.user` but the tokenizer's generic `//` rule doesn't match the `comment` token (it matches something else like `source`).

**Size:** Small — import theme data, compare rule foregrounds.

**Verification:** For each theme in THEMES, find the rule for token `comment` and the rule for token `comment.user`. Assert foreground values are identical.

---

## Test implementation notes

### Small test patterns (vitest, no infra)

All small tests follow the existing vitest pattern: `import { describe, it, expect } from 'vitest'`. Mock `monaco-editor` when testing modules that import it but don't need its runtime (like shift-enter.test.ts pattern). Store tests use `useNapStore.setState()` for setup and `useNapStore.getState()` for assertion.

### Medium test patterns (Playwright + Electron)

Medium tests follow the git-gutter.spec.ts pattern: create fixture in tmpDir, launch app, wait for `__napStore__` or `__monaco__` availability, interact via page.evaluate, assert via page.evaluate queries. Clean up with `cleanupApp`.

### What NOT to test

- Visual appearance of themes (manual testing — subjective, not automatable)
- Monaco editor layout/rendering details (internal to Monaco, not our logic)
- markdown-it's built-in parsing correctness (third-party library, trust it)
- Happy-path editor typing (Monaco handles this)
- CSS variable naming conventions (enforce via code review, not tests)

### Files the test-eng will create

| File | Size | Covers |
|---|---|---|
| `tests/theme-system.test.ts` | small | TH-01, TH-02, TH-03, TH-04, TK-01 |
| `tests/terminal-tab-refactor.test.ts` | small | TT-01 through TT-05 |
| `tests/terminal-link-routing.test.ts` | small | TL-01, TL-02, TL-03 |
| `tests/rendered-mode.test.ts` | small | RM-01, RM-02, RM-03, RM-04, RM-07 |
| `tests/git-gutter-race.test.ts` | small | GG-04 |
| `tests/git-gutter-refresh.spec.ts` | medium | GG-01, GG-02, GG-03, GG-05 |
| `tests/rendered-mode.spec.ts` | medium | RM-05, RM-06, TS-01 |
| `tests/theme-css.spec.ts` | medium | TH-05, TH-06 |
