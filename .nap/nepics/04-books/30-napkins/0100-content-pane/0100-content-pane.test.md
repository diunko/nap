# 0100 — test architecture

## 1. Routing rules (small tests)

`routing-rules.ts` is a pure function: `(clickContext) → { pane, surface }`. No infrastructure needed.

### T-0100-R01: .nap file → left pane, Monaco

- **Flow:** Click on file with path inside `.nap/` → routing function returns `{ pane: 'left', surface: 'monaco' }`
- **Subsystems:** routing-rules.ts (standalone)
- **Expected:** Any path containing `.nap/` routes to left pane + monaco
- **Likely to break:** Path matching logic — relative vs absolute paths, `.nap` appearing in a filename vs directory
- **Size:** Small
- **Verification:** Call function with paths like `.nap/nepics/01-v1/30-napkins/0100-feature/0100-feature.nap.md`, `.nap/00-org/10-promise.nap.md`, `.nap/nepics/01-v1/20-architects/001-architect/scratch/draft-02.md`. All should return left/monaco.

### T-0100-R02: Agent click → right pane, terminal

- **Flow:** Click on agent (has id, started flag) → routing function returns `{ pane: 'right', surface: 'terminal' }`
- **Subsystems:** routing-rules.ts (standalone)
- **Expected:** Click context with agent identity routes to right pane + terminal
- **Likely to break:** Distinguishing agent clicks from file clicks — both come from sidebar
- **Size:** Small
- **Verification:** Call with `{ agent: { id: 'uuid-1', started: true } }`. Returns right/terminal.

### T-0100-R03: Fallback → right pane

- **Flow:** Click with no .nap path and no agent → routing function returns right pane
  * // something something something something
  * // something else
- **Subsystems:** routing-rules.ts (standalone)
- **Expected:** Unknown click contexts default to right pane
- **Likely to break:** Missing else clause, or new click types added later without updating rules
- **Size:** Small
- **Verification:** Call with `{ filePath: '/some/code/file.ts' }`. Returns right pane.

### T-0100-R04: Edge cases — paths that look like .nap but aren't

- **Flow:** File path contains `.nap` as substring but not as a directory (e.g., `snapshot.ts`, `my-nap-notes.md`)
- **Subsystems:** routing-rules.ts (standalone)
- **Expected:** Does NOT route to left pane — only `.nap/` as a path segment triggers left routing
- **Likely to break:** Naive string.includes('.nap') without checking path boundaries
- **Size:** Small
- **Verification:** Call with `snapshot.ts`, `/foo/.nappy/bar.md`, `/foo/kidnap/notes.md`. All return right pane.


## 2. Store changes (small tests)

`activeFilePath` and `activeTerminalId` must be independent. Test zustand store directly (same pattern as `nepic-terminal-switch.test.ts`).

### T-0100-S01: openFile sets activeFilePath

- **Flow:** Call `store.openFile(path)` → `activeFilePath` updates
- **Subsystems:** store.ts (renderer-only state)
- **Expected:** `activeFilePath` equals the path passed
- **Likely to break:** Action not wired, or state key misspelled
- **Size:** Small
- **Verification:** `useNapStore.getState().openFile('/some/file.md'); expect(getState().activeFilePath).toBe('/some/file.md')`

### T-0100-S02: openFile does NOT change activeTerminalId

- **Flow:** Set `activeTerminalId` to a value, then call `openFile(path)`
- **Subsystems:** store.ts
- **Expected:** `activeTerminalId` unchanged after `openFile`
- **Likely to break:** Accidental coupling — openFile resetting terminal state or vice versa
- **Size:** Small
- **Verification:** Set terminal to 'uuid-1', open file, assert terminal still 'uuid-1'.

### T-0100-S03: setActiveTerminal does NOT change activeFilePath

- **Flow:** Set `activeFilePath`, then call `setActiveTerminal(id)`
- **Subsystems:** store.ts
- **Expected:** `activeFilePath` unchanged
- **Likely to break:** Same coupling risk as S02 — mutual interference
- **Size:** Small
- **Verification:** Open file, set terminal, assert file path unchanged.

### T-0100-S04: Both panes track state simultaneously

- **Flow:** Open file, set terminal, verify both, change file, verify terminal unchanged
- **Subsystems:** store.ts
- **Expected:** Both state values coexist independently through multiple mutations
- **Likely to break:** State replacement pattern clobbering adjacent fields (e.g., `set({ activeFilePath })` accidentally clearing terminal)
- **Size:** Small
- **Verification:** Sequence of openFile/setActiveTerminal calls with interleaved assertions.

### T-0100-S05: openFile replaces previous file (ephemeral behavior)

- **Flow:** Open file A, then open file B → only file B is active
- **Subsystems:** store.ts
- **Expected:** `activeFilePath` is B, no trace of A in state
- **Likely to break:** If someone adds tab state or history later — this test proves ephemeral behavior is the contract
- **Size:** Small
- **Verification:** Open A, open B, assert activeFilePath === B.

### T-0100-S06: Nepic switch behavior for activeFilePath

- **Flow:** Open file in nepic A, switch to nepic B, switch back to nepic A
- **Subsystems:** store.ts applySnapshot, per-nepic memory
- **Expected:** Decide: should activeFilePath be remembered per-nepic (like terminal) or cleared on switch? Test whichever behavior is chosen.
- **Likely to break:** Missing the activeFilePath from nepic save/restore, or forgetting to clear it
- **Size:** Small
- **Verification:** Same pattern as nepic-terminal-switch tests — save state before switch, verify restore or clear.

### T-0100-S07: applySnapshot preserves activeFilePath

- **Flow:** Open a file, apply same-nepic snapshot (model update from watcher)
- **Subsystems:** store.ts applySnapshot
- **Expected:** `activeFilePath` not clobbered by snapshot (it's renderer-only state, not in AppSnapshot)
- **Likely to break:** applySnapshot accidentally resetting renderer-only state
- **Size:** Small
- **Verification:** Open file, apply snapshot, assert activeFilePath unchanged.


## 3. Monaco / tokenizer (medium tests)

Monaco needs a real browser environment (DOM, Canvas, web workers). Can't be faked reliably.

### T-0100-M01: Monarch tokenizer registers as napkin-markdown language

- **Flow:** Register tokenizer → Monaco recognizes `napkin-markdown` as a language
- **Subsystems:** Monaco API, tokenizer definition
- **Expected:** `monaco.languages.getLanguages()` includes `napkin-markdown`
- **Likely to break:** Registration order — must register before creating editor model
- **Size:** Medium (needs Monaco runtime)
- **Verification:** Playwright test: check language registration after renderer loads.

### T-0100-M02: Heading token styling

- **Flow:** Create model with `# heading text` → tokenize → heading tokens produced
- **Subsystems:** Monarch tokenizer rules, theme token colors
- **Expected:** `#` and heading text get token type `heading`
- **Likely to break:** Regex not matching `#` at line start, or not capturing rest of line
- **Size:** Medium
- **Verification:** Use Monaco's `tokenize()` API or `editor.tokenizeLineByLine()` on a model. Assert token types.

### T-0100-M03: Role-prefixed comment tokens

- **Flow:** Tokenize lines: `//A: architect`, `//DU: user`, `//FS: engineer`, `//TA: test-arch`, `//TE: test-eng`
- **Subsystems:** Monarch tokenizer rules
- **Expected:** Each prefix produces its role-specific token (`comment.architect`, `comment.user`, `comment.fs-eng`, `comment.test-arch`, `comment.test-eng`)
- **Likely to break:** Regex order — `//A:` must match before generic `//`. If generic `//` rule is first, it swallows all comments before role-specific rules fire.
- **Size:** Medium
- **Verification:** Tokenize each line, assert token type for the prefix and the rest of line.

### T-0100-M04: Generic comment fallback

- **Flow:** Tokenize `// just a comment` (no role prefix)
- **Subsystems:** Monarch tokenizer rules
- **Expected:** Gets generic `comment` token (muted gray-blue), not a role-specific one
- **Likely to break:** If role-specific rules don't have anchored matches, `//` inside `//FS:` might double-match
- **Size:** Medium
- **Verification:** Tokenize, assert `comment` not `comment.*`.

### T-0100-M05: Mixed content document

- **Flow:** Tokenize a realistic napkin: heading, bullets, bold, inline code, role comments, nested
- **Subsystems:** Monarch tokenizer (all rules interacting)
- **Expected:** Each construct gets correct token types simultaneously. No rule state leaks across lines.
- **Likely to break:** Monarch state machine not resetting between lines — e.g., bold state carrying over to next line
- **Size:** Medium
- **Verification:** Tokenize multi-line document, spot-check tokens on specific lines.

### T-0100-M06: Editor config applied

- **Flow:** Create Monaco editor instance with content pane config
- **Subsystems:** Monaco editor options
- **Expected:** wordWrap on, minimap off, lineNumbers off, quickSuggestions off, correct font/theme
- **Likely to break:** Config key names (Monaco API changes between versions), or config not applied at creation time
- **Size:** Medium
- **Verification:** Read editor options after creation: `editor.getOption(...)` for each config value.


## 4. File watching for content (small + medium)

Two distinct seams: (a) detecting external change, (b) updating Monaco model from that change.

### T-0100-W01: External file change triggers content update IPC

- **Flow:** File on disk changes (agent writes to it) → main process detects change → sends IPC to renderer with new content
- **Subsystems:** Main process file watcher → IPC channel → renderer
- **Expected:** Renderer receives updated file content within debounce window
- **Likely to break:** Content-level watching is NEW — the existing watcher watches directories for structural changes (new agents, status). Per-file content watching may not exist yet. The seam between "directory structure changed" and "file content changed" is where bugs hide.
- **Size:** Small (main process side with MemoryFileSystem) + Medium (full round-trip)
- **Verification:**
  - Small: MemoryFileSystem.simulateChange on an open file path → bridge receives content update event
  - Medium: Playwright — modify file via Electron's main process API, verify Monaco model text changes

### T-0100-W02: Write-echo suppression for auto-save

- **Flow:** User edits in Monaco → auto-save writes to disk → file watcher fires → must NOT trigger re-read that overwrites the user's in-progress edits
- **Subsystems:** Auto-save → main process write → file watcher → suppression logic
- **Expected:** The write-echo is suppressed — Monaco content stays as user typed it, no flash of stale content
- **Likely to break:** The existing `hasPendingWrite` flag in the model is for directory structure writes. Content writes from the left pane need their own suppression mechanism (different channel, different debounce).
- **Size:** Small (test suppression flag logic) + Medium (full round-trip)
- **Verification:**
  - Small: Simulate write-then-watch-event, assert no re-read callback fires
  - Medium: Type in Monaco, wait for auto-save, verify content hasn't reverted

### T-0100-W03: Rapid external changes debounce correctly

- **Flow:** Agent makes 5 rapid writes to the same file within 200ms
- **Subsystems:** File watcher debounce → single content update
- **Expected:** Monaco model updates once with final content, not 5 times
- **Likely to break:** Debounce timer not resetting on subsequent changes, or debounce too short causing intermediate states
- **Size:** Small
- **Verification:** MemoryFileSystem: simulateChange 5 times rapidly, assert model re-read called once after debounce settles.

### T-0100-W04: Scroll position preserved after external update

- **Flow:** User is reading line 50 of a napkin. Agent adds `//A:` lines at line 10. Content updates.
- **Subsystems:** Monaco model update → scroll position management
- **Expected:** User's viewport stays approximately at the same content (or at least doesn't jump to top)
- **Likely to break:** Naive model.setValue() resets scroll to top. Need model.applyEdits() or save/restore scroll position around update.
- **Size:** Medium
- **Verification:** Playwright: scroll to a position, trigger content update, verify scrollTop is close to original.


## 5. Layout (medium tests)

Three-column layout with resize handles. Real DOM needed for layout calculations.

### T-0100-L01: Three panes render on launch

- **Flow:** App launches → DOM contains nav, left content pane, right content pane
- **Subsystems:** index.tsx layout, CSS flexbox
- **Expected:** Three containers visible, each with non-zero width
- **Likely to break:** New layout structure not rendering (import error, missing component, CSS issue)
- **Size:** Medium
- **Verification:** Playwright: `page.locator('[data-testid="sidebar"]')`, `[data-testid="content-pane"]`, `[data-testid="terminal-pane"]` all visible with positive width.

### T-0100-L02: Empty state placeholders

- **Flow:** No file opened, no agent selected → both content panes show placeholder text
- **Subsystems:** ContentPane (empty state), TerminalPane (empty state)
- **Expected:** Left: "no file open" or similar. Right: "no agent selected" or existing "v3" text.
- **Likely to break:** Conditional rendering — showing editor when activeFilePath is null, or terminal when activeTerminalId is null
- **Size:** Medium
- **Verification:** Playwright: check placeholder text visible in both panes on fresh launch.

### T-0100-L03: Resize handle between left and right

- **Flow:** Drag resize handle → left pane width changes, right pane width adjusts
- **Subsystems:** Drag handler, CSS flexbox, ResizeObserver
- **Expected:** Widths change proportionally, both panes remain visible
- **Likely to break:** Drag handler not wired, or flex layout not responding to explicit width changes
- **Size:** Medium
- **Verification:** Playwright: mousedown on handle, mousemove, mouseup. Measure widths before and after.

### T-0100-L04: Min widths prevent collapse

- **Flow:** Drag resize handle far to one side → pane hits min width and stops shrinking
- **Subsystems:** Drag handler min/max constraints
- **Expected:** Neither pane width goes below minimum. Handle stops responding past limit.
- **Likely to break:** Missing Math.max in drag calculation
- **Size:** Medium
- **Verification:** Drag handle to extreme position, verify pane width >= min threshold.

### T-0100-L05: Resize triggers Monaco reflow

- **Flow:** Resize left pane → Monaco editor adapts (word wrap adjusts to new width)
- **Subsystems:** ResizeObserver on left pane → `editor.layout()` call
- **Expected:** Monaco re-measures and re-wraps text
- **Likely to break:** Missing ResizeObserver on content pane container, or not calling `editor.layout()` on resize
- **Size:** Medium
- **Verification:** Open a file with long lines, resize pane, verify Monaco viewport width changed (or line wrap count changed).

### T-0100-L06: Resize triggers xterm refit

- **Flow:** Resize right pane → xterm refits (cols/rows update, pty gets resize signal)
- **Subsystems:** Existing ResizeObserver on terminal container → fitAddon.fit() → pty.resize()
- **Expected:** Same behavior as today, just in a narrower default width
- **Likely to break:** ResizeObserver not firing because the terminal container is now inside a different parent
- **Size:** Medium
- **Verification:** Existing terminal resize tests should still pass. New: verify refit fires after layout resize.


## 6. Nav routing integration (medium tests)

The seam where sidebar click handlers switch from shell.openPath to routing-rules.

### T-0100-N01: FileRow click opens file in left pane (not OS editor)

- **Flow:** Click a .nap file in sidebar → left pane loads file in Monaco
- **Subsystems:** FileRow onClick → routing-rules.ts → store.openFile() → ContentPane
- **Expected:** `window.electronAPI.openFilePath` NOT called. `store.activeFilePath` set. Monaco shows file content.
- **Likely to break:** The critical migration — replacing `openFilePath` with the new routing. Miss one call site and files open externally again.
- **Size:** Medium
- **Verification:** Playwright: click file entry, verify Monaco editor shows content AND openFilePath was NOT called (spy on IPC).

### T-0100-N02: AgentDot click opens terminal in right pane

- **Flow:** Click agent dot → right pane shows terminal
- **Subsystems:** AgentDot onClick → routing-rules.ts → store.setActiveTerminal() → Terminal component
- **Expected:** Functionally same as today (dot click → terminal switches), but going through routing-rules
- **Likely to break:** If routing adds a level of indirection that breaks existing `setActiveTerminal` behavior
- **Size:** Medium
- **Verification:** Playwright: click agent dot, verify terminal switches (breadcrumb updates to agent name).

### T-0100-N03: File click then agent click — both panes update independently

- **Flow:** Click file → left pane shows file. Click agent → right pane shows terminal. Left pane unchanged.
- **Subsystems:** Routing → store → both pane components
- **Expected:** Story 2 in stories.md — two panes are independent
- **Likely to break:** A single `activeId` state trying to serve both panes, or click handler setting both states
- **Size:** Medium
- **Verification:** Playwright: click file, verify left pane. Click agent, verify right pane. Verify left pane unchanged.

### T-0100-N04: File click replaces previous file (ephemeral)

- **Flow:** Click file A → left pane shows A. Click file B → left pane shows B. No tab bar, no A remnant.
- **Subsystems:** store.openFile → ContentPane
- **Expected:** Story 1 — "No tab accumulates. Just the new file."
- **Likely to break:** Monaco model not being replaced (old model still active), or editor showing stale content
- **Size:** Medium
- **Verification:** Playwright: click file A, verify content. Click file B, verify content changed. Check no tab UI exists.

### T-0100-N05: Copy and open-external controls bypass routing

- **Flow:** Click copy icon on file entry → clipboard gets path. Click open-external icon → shell.openPath fires.
- **Subsystems:** FileRow hover controls
- **Expected:** These controls are NOT affected by routing changes — they still do direct clipboard/OS actions
- **Likely to break:** Accidentally replacing ALL click handlers in FileRow, including the controls
- **Size:** Medium
- **Verification:** Playwright: hover file entry, click copy icon, verify clipboard. Click open-external icon, verify openFilePath IPC called.

### T-0100-N06: [terminal] entry in extended view still switches terminal

- **Flow:** Extended view shows `[terminal]` entry under an agent. Click it → right pane switches to that terminal.
- **Subsystems:** Extended view template → setActiveTerminal
- **Expected:** `[terminal]` click behavior unchanged
- **Likely to break:** Accidentally routing `[terminal]` clicks through routing-rules when they should go directly to setActiveTerminal
- **Size:** Medium
- **Verification:** Playwright: extend a card, click [terminal], verify terminal switches.


## Priority ordering

If implementation time is limited, test in this order:

1. **Routing rules (R01-R04)** — pure function, fast to write, catches the most common bugs early
2. **Store independence (S01-S07)** — small tests, catch state coupling bugs before any UI exists
3. **Nav routing (N01, N03)** — proves the core story works end-to-end
4. **File watching (W01-W02)** — the hardest seam, most likely to have subtle bugs
5. **Layout (L01-L02, L06)** — proves the three-pane structure renders
6. **Tokenizer (M03, M05)** — comment role colors are the novel tokenizer behavior
7. Everything else
