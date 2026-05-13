# 0200 — test architecture

## 1. Link provider + routing (small tests)

`routeLink()` is a pure function: `(LinkContext) → LinkResult`. No infrastructure needed. The link provider regex matching can also be tested as pure logic.

### T-0200-L01: Code link — bare path with line number

- **Flow:** `routeLink({ href: 'src/main/model.ts:42', sourceFilePath: '.nap/nepics/01-v1/30-napkins/0100/0100.nap.md' })` → `{ action: 'openCode', path: '<projectRoot>/src/main/model.ts', line: 42 }`
- **Subsystems:** routing-rules.ts routeLink (standalone)
- **Expected:** Non-.md extension + `:line` → action openCode, path resolved relative to project root (parent of .nap/), line extracted
- **Likely to break:** Path resolution — bare `src/main/model.ts` has no leading `/`, but code links without `/` resolve relative to dirname(sourceFile) per spec. The spec says leading `/` → project root, no leading `/` → dirname(currentFile). For code links in .nap files referencing project code, this matters — the implementer might resolve relative to .nap/ instead of project root. *Spec clarification needed: bare paths like `src/main/model.ts` in napkin files probably need project-root resolution as a third rule or a convention that these are treated as project-relative.*
- **Size:** Small
- **Verification:** Call routeLink with bare code paths from various sourceFile locations. Assert resolved path, line, col.

### T-0200-L02: Code link — markdown link with #L anchor

- **Flow:** `routeLink({ href: '[copy_document.ts:51](/modules/server/frontend/private/actions/copy_document.ts#L51)', sourceFilePath: '...' })` → `{ action: 'openCode', path: '<projectRoot>/modules/server/.../copy_document.ts', line: 51 }`
- **Subsystems:** routing-rules.ts routeLink, regex parsing
- **Expected:** Markdown link syntax parsed — href extracted from `[text](url)`, `#L51` parsed as line 51, leading `/` → project root
- **Likely to break:** Regex must handle both `path:42` and `path#L42` syntax. The markdown link nesting `[text](url)` where url contains `/`, `:`, `#` is the hard parsing problem. If the link provider extracts just the href (the part inside parens), routeLink receives clean input. If the provider passes the whole `[text](url)` string, routeLink has to parse it.
- **Size:** Small
- **Verification:** Call with markdown-style hrefs containing `#L`, `#L42`, `:42:17`. Assert correct path and line extraction.

### T-0200-L03: Markdown link — .md extension routes to left pane

- **Flow:** `routeLink({ href: './02-id-universe.md', sourceFilePath: '.nap/nepics/01-v1/30-napkins/0100/0100.nap.md' })` → `{ action: 'openDoc', path: '.nap/nepics/01-v1/30-napkins/0100/02-id-universe.md' }`
- **Subsystems:** routing-rules.ts routeLink
- **Expected:** `.md` extension → action openDoc, path resolved relative to dirname(sourceFile)
- **Likely to break:** Classification is by extension, not pattern. A file like `changelog.md:15` has `.md` extension — should it route left (as a doc) or right (because it has `:15`)? The spec says classification is by extension. This edge case needs a decision.
- **Size:** Small
- **Verification:** Call with `./foo.md`, `../bar/baz.spec.md`, relative .md paths. Assert action is openDoc with resolved paths.

### T-0200-L04: External link — https routes to browser

- **Flow:** `routeLink({ href: 'https://coda.io/developers', sourceFilePath: '...' })` → `{ action: 'openExternal', url: 'https://coda.io/developers' }`
- **Subsystems:** routing-rules.ts routeLink
- **Expected:** https:// or http:// prefix → action openExternal, URL passed through unmodified
- **Likely to break:** URL detection matching a file path that contains `http` as a substring (unlikely but worth asserting the negative)
- **Size:** Small
- **Verification:** Call with `https://...`, `http://...`. Assert openExternal. Also call with `httpconfig.ts` — assert NOT openExternal.

### T-0200-L05: Path resolution — two-root system

- **Flow:** Test all path resolution cases:
  - Code link with leading `/` → project root + path
  - Code link without leading `/` → dirname(sourceFile) + path
  - .md link → always dirname(sourceFile) + path
- **Subsystems:** routing-rules.ts routeLink, path resolution logic
- **Expected:** Each case resolves to the correct absolute path
- **Likely to break:** The two-root distinction. A path like `../src/model.ts` from inside `.nap/nepics/.../` should resolve by walking up from the source file, which may land in `.nap/` or escape to project root — both are valid depending on path depth. The implementer needs to normalize and verify the path doesn't escape the project.
- **Size:** Small
- **Verification:** Matrix test: 3 source locations x 4 href patterns (absolute code, relative code, relative .md, external). Assert 12 resolved paths.

### T-0200-L06: Link provider regex — FILE_PATH_REGEX reuse

- **Flow:** Apply link detection regex to realistic napkin content containing mixed link types
- **Subsystems:** Link provider regex patterns
- **Expected:** Correctly identifies and classifies: `src/model.ts:42`, `[text](path#L51)`, `https://example.com`, `./next-chapter.md`, bare `config.json`
- **Likely to break:** The existing `FILE_PATH_REGEX` from file-link-provider.ts was designed for terminal output, not for Monaco content with markdown syntax. Markdown links `[text](url)` need a separate regex. The `isUrl()` helper walks backwards to check for `http://` prefix — this won't work in Monaco content where link text appears before the URL.
- **Size:** Small
- **Verification:** Feed sample napkin lines through the regex. Assert matches with correct start/end positions and no false positives on URLs inside markdown link text.

### T-0200-L07: Edge case — path that doesn't exist

- **Flow:** `routeLink({ href: 'nonexistent/file.ts:10', ... })` — file doesn't exist on disk
- **Subsystems:** routing-rules.ts routeLink
- **Expected:** routeLink returns the resolved path anyway — existence checking is the consumer's problem (the right pane shows "file not found" or similar). routeLink is a classifier, not a validator.
- **Likely to break:** If routeLink tries to stat the file, it becomes async and needs filesystem access — violating its pure-function contract.
- **Size:** Small
- **Verification:** Call with nonexistent paths. Assert it still returns an action (not null/throw).


## 2. Right pane mixed surface (small + medium tests)

TerminalPane becomes a mixed surface. The store state drives which surface renders.

### T-0200-P01: Store — rightPaneMode defaults to 'terminal'

- **Flow:** Fresh store → `rightPaneMode` is 'terminal'
- **Subsystems:** store.ts
- **Expected:** Default mode is terminal (backwards compatible with 0100)
- **Likely to break:** Missing default, or defaulting to 'code' which breaks existing agent-only flows
- **Size:** Small
- **Verification:** `useNapStore.getState().rightPaneMode === 'terminal'`

### T-0200-P02: Store — openCode sets rightPaneMode + rightFilePath + rightFileLine

- **Flow:** `store.openCode({ path: '/abs/file.ts', line: 42 })` → rightPaneMode = 'code', rightFilePath = '/abs/file.ts', rightFileLine = 42
- **Subsystems:** store.ts
- **Expected:** All three fields update atomically
- **Likely to break:** Partial update (mode changes but file/line don't), or wrong field names
- **Size:** Small
- **Verification:** Call openCode, assert all three state fields.

### T-0200-P03: Store — setActiveTerminal resets rightPaneMode to 'terminal'

- **Flow:** openCode(file), then setActiveTerminal(id) → rightPaneMode = 'terminal'
- **Subsystems:** store.ts
- **Expected:** Clicking an agent dot clears code mode, shows terminal
- **Likely to break:** setActiveTerminal not resetting rightPaneMode — terminal shows but store thinks it's still in code mode
- **Size:** Small
- **Verification:** openCode, setActiveTerminal, assert rightPaneMode === 'terminal'.

### T-0200-P04: Store — openCode does NOT change activeTerminalId

- **Flow:** setActiveTerminal('uuid-1'), then openCode(file) → activeTerminalId still 'uuid-1'
- **Subsystems:** store.ts
- **Expected:** Opening code doesn't lose track of which terminal was selected — switching back to terminal should show the same agent
- **Likely to break:** openCode resetting activeTerminalId to null
- **Size:** Small
- **Verification:** Set terminal, open code, assert activeTerminalId unchanged.

### T-0200-P05: Mode switch — terminal to code and back (medium)

- **Flow:** Right pane shows terminal. Click file:line link → right pane shows Monaco with code. Click agent dot → right pane shows terminal again.
- **Subsystems:** TerminalPane (mixed surface), store, Terminal component, Monaco instance
- **Expected:** Correct component renders for each mode. Terminal state (scrollback, pty) preserved across switches.
- **Likely to break:** Terminal xterm instance getting disposed when switching to code mode. Monaco instance not being created/re-attached on switch back. The mixed surface needs to keep both instances alive but show only one.
- **Size:** Medium
- **Verification:** Playwright: verify terminal visible, trigger code link, verify Monaco visible, click agent dot, verify terminal visible with preserved scrollback.

### T-0200-P06: Line highlight on navigation (medium)

- **Flow:** Click file:line link → code opens at line 42 → yellow highlight flashes and fades
- **Subsystems:** Monaco editor in right pane, revealLineInCenter, deltaDecorations, CSS transition
- **Expected:** Line 42 is visible (scrolled to center). Decoration with highlight class exists briefly. After ~1.5s, decoration is removed.
- **Likely to break:** Decoration not appearing (wrong decoration range), not fading (CSS transition not applied to Monaco decorations — Monaco uses inline styles, not CSS classes for some decoration types), not being removed (timer not set or fires before animation).
- **Size:** Medium
- **Verification:** Playwright: open code file at line 42, verify line is in viewport. Check decoration exists immediately after open. Wait 2s, verify decoration removed.

### T-0200-P07: Code display — read-only, language detection

- **Flow:** Open a `.ts` file → Monaco shows TypeScript highlighting, read-only. Open a `.py` file → Python highlighting.
- **Subsystems:** Right pane Monaco instance, language detection
- **Expected:** Language auto-detected from extension. Editor is read-only (typing does nothing).
- **Likely to break:** Language not set (defaulting to plaintext), or read-only flag not set so user can edit the code file.
- **Size:** Medium
- **Verification:** Playwright: open .ts file, check editor language is typescript. Try typing — content doesn't change.


## 3. Tabs (small + medium tests)

Most complex state change in 0200. The tab model is pure state — testable as small tests. Tab bar rendering and interactions need medium tests.

### T-0200-T01: Single-click creates ephemeral tab

- **Flow:** No tabs. Single-click .md link → one ephemeral tab in left pane.
- **Subsystems:** store.ts tab state management
- **Expected:** `leftTabs` has one entry with `ephemeral: true`. `activeLeftTabId` matches.
- **Likely to break:** First tab not being created, or created as pinned instead of ephemeral
- **Size:** Small
- **Verification:** Call store action for single-click nav. Assert tab array length and ephemeral flag.

### T-0200-T02: Ephemeral tab reuse — second single-click replaces

- **Flow:** Single-click file A → ephemeral tab. Single-click file B → same ephemeral slot, now showing B.
- **Subsystems:** store.ts tab state management
- **Expected:** Still one tab. Tab path changed from A to B. Same tab id (reused, not closed+created).
- **Likely to break:** Creating a second tab instead of reusing. Or replacing the tab id, which would cause React to unmount/remount the Monaco model unnecessarily.
- **Size:** Small
- **Verification:** Two single-click actions. Assert leftTabs.length === 1, tab.path === B.

### T-0200-T03: Double-click pins an ephemeral tab

- **Flow:** Single-click file A (ephemeral). Double-click → tab.ephemeral becomes false.
- **Subsystems:** store.ts tab state
- **Expected:** Tab survives next single-click. Tab title no longer italic (visual, medium test).
- **Likely to break:** Double-click handler not finding the ephemeral tab, or pin action not flipping the flag
- **Size:** Small
- **Verification:** Single-click A, double-click, assert ephemeral === false. Single-click B, assert two tabs (A pinned + B ephemeral).

### T-0200-T04: Pinned + ephemeral coexist

- **Flow:** Pin tab A. Single-click B → ephemeral B appears. Single-click C → ephemeral slot reuses to C. Pin tab C. Single-click D → new ephemeral.
- **Subsystems:** store.ts tab state
- **Expected:** Three tabs: A (pinned), C (pinned), D (ephemeral). Ephemeral is always rightmost.
- **Likely to break:** Ephemeral slot insertion position — should be rightmost. After pinning, the next single-click must create a NEW ephemeral, not try to reuse a pinned tab.
- **Size:** Small
- **Verification:** Sequence of clicks and pins. Assert tab array order and ephemeral flags at each step.

### T-0200-T05: Terminal tab — always pinned, can't close while agent running

- **Flow:** Agent starts → terminal tab appears in right pane (pinned, special type). Try to close it → denied.
- **Subsystems:** store.ts tab state, tab close logic
- **Expected:** Terminal tab has `type: 'terminal'`, `ephemeral: false`. Close action returns false or no-ops when agent is running.
- **Likely to break:** Terminal tab being closeable, or not being created when agent starts
- **Size:** Small
- **Verification:** Create terminal tab for running agent. Call close action. Assert tab still exists.

### T-0200-T06: Cmd-W closes active tab

- **Flow:** Two pinned tabs: A (active), B. Cmd-W → A closes, B becomes active. Cmd-W → B closes, placeholder shows.
- **Subsystems:** store.ts tab management, active tab selection on close
- **Expected:** Correct tab removed. Next tab activated. Last close → activeTabId null.
- **Likely to break:** Active tab selection after close — should go to the adjacent tab (left neighbor, or right if leftmost). Edge case: closing the only tab.
- **Size:** Small
- **Verification:** Assert tab count and activeTabId after each Cmd-W.

### T-0200-T07: Tab close disposes Monaco model

- **Flow:** Open file in tab → Monaco model created. Close tab → model disposed.
- **Subsystems:** store.ts tab close → Monaco model lifecycle
- **Expected:** `monaco.editor.getModels()` count decreases by 1 after tab close. No leaked models.
- **Likely to break:** Disposal not happening — the model stays alive, consuming memory. This is the classic leak in tab-based editors.
- **Size:** Medium (needs Monaco runtime to verify model count)
- **Verification:** Playwright: open file, check model count. Close tab, check model count decreased.

### T-0200-T08: Per-nepic tab memory — save and restore

- **Flow:** Open tabs A, B (pinned) in nepic 1. Switch to nepic 2. Switch back to nepic 1.
- **Subsystems:** store.ts applySnapshot, per-nepic tab save/restore
- **Expected:** Tabs A, B restored with correct active tab, scroll positions, ephemeral flags.
- **Likely to break:** Tab state not being included in nepic memory. Or restoring tab paths that point to files from the wrong nepic. Or scroll/cursor positions lost.
- **Size:** Small
- **Verification:** Save/restore cycle. Assert tab arrays match after restore.

### T-0200-T09: Editing in ephemeral tab auto-pins it (medium)

- **Flow:** Single-click file A (ephemeral tab in left pane). Start typing in Monaco.
- **Subsystems:** ContentPane onChange → store tab pin action
- **Expected:** Tab becomes pinned (ephemeral flips to false) on first edit. Title goes from italic to normal.
- **Likely to break:** The edit event not triggering the pin. Or pinning on every keystroke instead of just the first one.
- **Size:** Medium
- **Verification:** Playwright: single-click file, verify italic tab title. Type a character. Verify tab title is no longer italic.

### T-0200-T10: Middle-click closes tab (medium)

- **Flow:** Multiple tabs open. Middle-click on a non-active tab → that tab closes without switching to it first.
- **Subsystems:** Tab bar mouse handler
- **Expected:** Clicked tab removed. Active tab unchanged (unless the closed tab was active).
- **Likely to break:** Middle-click handler not wired, or closing the wrong tab, or unnecessarily activating the tab before closing.
- **Size:** Medium
- **Verification:** Playwright: multiple tabs, middle-click non-active tab, assert it's gone, active tab unchanged.


## 4. Git gutter (small + medium tests)

The diff parser is pure logic — perfect small tests. Decoration application needs Monaco.

### T-0200-G01: Hunk header parsing — added lines

- **Flow:** Parse `@@ -10,0 +11,3 @@` → `{ type: 'add', startLine: 11, endLine: 13 }`
- **Subsystems:** Git diff parser (standalone pure function)
- **Expected:** `-a,0` (zero old lines) means pure addition. Lines 11-13 are new.
- **Likely to break:** Off-by-one on endLine calculation. `@@ -a,b +c,d @@` where d is the count of new lines: endLine = c + d - 1. If d=0, that's a deletion, not an addition.
- **Size:** Small
- **Verification:** Call parser with diff output. Assert hunk list.

### T-0200-G02: Hunk header parsing — modified lines

- **Flow:** Parse `@@ -5,2 +5,2 @@` → `{ type: 'modify', startLine: 5, endLine: 6 }`
- **Subsystems:** Git diff parser
- **Expected:** Both sides non-zero and same position → modification
- **Likely to break:** Classification logic — what makes a hunk "modify" vs "add+delete"? Spec says: if old and new sides both have lines at the same position, it's modify. But git diff doesn't distinguish — a hunk with `-5,2 +5,3` has 2 deleted + 3 added. The implementer must decide: is this "modify 2 + add 1" or "modify all 3"? Either interpretation needs testing.
- **Size:** Small
- **Verification:** Call with modification hunks. Assert type and line ranges.

### T-0200-G03: Hunk header parsing — deleted lines

- **Flow:** Parse `@@ -15,2 +14,0 @@` → `{ type: 'delete', startLine: 14, endLine: 14 }`
- **Subsystems:** Git diff parser
- **Expected:** `+c,0` (zero new lines) → deletion. The decoration goes between lines 14 and 15 (red triangle).
- **Likely to break:** Delete decoration position — it's not ON a line, it's BETWEEN lines. The line number in the result should indicate where the triangle goes.
- **Size:** Small
- **Verification:** Assert delete hunks have the correct anchor line.

### T-0200-G04: Untracked file — all lines are "added"

- **Flow:** File not tracked by git → git diff returns nothing, but file is untracked → all lines are additions
- **Subsystems:** Git diff handler in main process
- **Expected:** IPC returns add hunks covering the entire file
- **Likely to break:** The main process needs to check `git status` or `git ls-files` to detect untracked files, not just run `git diff`. If the file is untracked, `git diff` produces no output — the handler must detect this and return all-added.
- **Size:** Small
- **Verification:** Mock git commands. Assert all-added response for untracked file.

### T-0200-G05: Edge cases — binary file, empty file, new file (no HEAD)

- **Flow:** Binary file → skip (no decorations). Empty file → no decorations. New repo (no commits) → all lines added.
- **Subsystems:** Git diff parser, main process handler
- **Expected:** Each edge case handled without crash. Binary files produce `Binary files differ` in diff output — parser must skip these.
- **Likely to break:** Binary file line in diff output parsed as a hunk header. Empty file producing an error in git diff.
- **Size:** Small
- **Verification:** Feed edge case diff outputs through parser. Assert no crash, correct (possibly empty) results.

### T-0200-G06: Decorations applied to Monaco gutter (medium)

- **Flow:** Open file with known diff → green/blue/red decorations appear in gutter
- **Subsystems:** ContentPane → file:git-diff IPC → deltaDecorations
- **Expected:** Visible gutter marks at correct line positions
- **Likely to break:** deltaDecorations API call with wrong range or className. Decoration not visible because CSS class not defined or wrong gutter margin settings.
- **Size:** Medium
- **Verification:** Playwright: open modified file, inspect Monaco decorations via `editor.getLineDecorations(line)`. Assert decoration classNames contain expected gutter markers.

### T-0200-G07: Re-run diff after auto-save (medium)

- **Flow:** Type new line → auto-save fires (1s debounce) → diff re-runs → new green bar appears
- **Subsystems:** ContentPane onChange → auto-save → file:git-diff → deltaDecorations
- **Expected:** After save + re-diff, the new line gets a gutter decoration
- **Likely to break:** Timing — diff requested before save completes, showing stale decorations. Or diff not re-requested at all after save.
- **Size:** Medium
- **Verification:** Playwright: type text, wait for save + refresh, verify new decoration appears.


## 5. Shift-enter continuation (small + medium tests)

The detection logic is pure string manipulation. The Monaco keybinding integration needs a runtime.

### T-0200-SE01: Detect indent + bullet + prefix

- **Flow:** Parse line `  * //DU: some thought` → `{ indent: '  ', bullet: '* ', prefix: '//DU: ' }`
- **Subsystems:** Shift-enter detection function (standalone)
- **Expected:** Each component extracted correctly. Cursor position is after the full pattern.
- **Likely to break:** Regex for prefix detection — must handle `//A: `, `//DU: `, `//FS: `, `//TA: `, `//TE: ` and any `//XX: ` pattern. Must NOT match `// just a comment` (no colon-space after tag).
- **Size:** Small
- **Verification:** Feed sample lines through detector. Assert indent, bullet, prefix fields.

### T-0200-SE02: Line with bullet, no prefix

- **Flow:** Parse `    * some text` → `{ indent: '    ', bullet: '* ', prefix: '' }`
- **Subsystems:** Shift-enter detection
- **Expected:** Bullet detected, no prefix. New line gets `    * ` only.
- **Likely to break:** Prefix regex matching the word after the bullet as a false prefix
- **Size:** Small
- **Verification:** Assert extracted components.

### T-0200-SE03: Line with indent only, no bullet

- **Flow:** Parse `    some text` → `{ indent: '    ', bullet: '', prefix: '' }`
- **Subsystems:** Shift-enter detection
- **Expected:** Only indent preserved. New line gets `    ` (just whitespace).
- **Likely to break:** Function assuming bullet is always present
- **Size:** Small
- **Verification:** Assert only indent extracted.

### T-0200-SE04: Break-out — empty line after prefix

- **Flow:** Line is `  * //DU: ` (trailing space, no content after prefix) → shift-enter produces a plain newline, NOT `  * //DU: `
- **Subsystems:** Shift-enter break-out logic
- **Expected:** Detects that there's nothing after the prefix → inserts plain newline (or newline with just indent, no bullet/prefix). Also clears the empty prefix line.
- **Likely to break:** "Nothing after prefix" detection — trailing whitespace might count as content. The check should be: after stripping indent+bullet+prefix, is the remainder empty or whitespace-only?
- **Size:** Small
- **Verification:** Feed empty-after-prefix lines. Assert break-out flag is true.

### T-0200-SE05: Break-out — empty bullet without prefix

- **Flow:** Line is `  * ` (just bullet, no content) → shift-enter breaks out
- **Subsystems:** Shift-enter break-out logic
- **Expected:** Same break-out behavior as SE04 but for the bullet-only case
- **Likely to break:** Break-out only checking for prefix pattern, not bullet-only pattern
- **Size:** Small
- **Verification:** Assert break-out on bullet-only lines.

### T-0200-SE06: Monaco keybinding integration (medium)

- **Flow:** Cursor on `  * //A: first thought`. Press Shift+Enter. New line appears with `  * //A: `.
- **Subsystems:** Monaco keybinding → shift-enter handler → editor.executeEdits
- **Expected:** New line inserted at correct position with correct prefix. Cursor after prefix.
- **Likely to break:** Keybinding not registered (Shift+Enter is also used by Monaco for other things — need to check for conflicts). The `executeEdits` call not positioning the cursor correctly.
- **Size:** Medium
- **Verification:** Playwright: position cursor, press Shift+Enter, read new line content and cursor position.

### T-0200-SE07: Break-out in Monaco (medium)

- **Flow:** Cursor on `  * //DU: ` (empty prefix). Press Shift+Enter. Plain newline — no prefix continuation.
- **Subsystems:** Monaco keybinding → shift-enter handler → break-out branch
- **Expected:** New line has only indent (or nothing), not the prefix.
- **Likely to break:** Break-out detection working in unit test but not in Monaco because the line content retrieval API returns different whitespace.
- **Size:** Medium
- **Verification:** Playwright: position cursor on empty-prefix line, press Shift+Enter, verify new line doesn't have prefix.


## 6. Code file watching (small + medium tests)

ContentFileWatcher is being extracted as a module. This creates a clean seam for small tests.

### T-0200-W01: ContentFileWatcher — file change triggers callback

- **Flow:** Watch file A. External process writes to A. Callback fires with new content.
- **Subsystems:** ContentFileWatcher module with injectable fs
- **Expected:** Callback called once with updated content after debounce
- **Likely to break:** Watcher not starting (missing fs.watch call), or callback not wired, or debounce preventing notification
- **Size:** Small (injectable fs — use MemoryFileSystem or mock)
- **Verification:** Create watcher with mock fs. Simulate change event. Assert callback called with content.

### T-0200-W02: ContentFileWatcher — atomic writes detected

- **Flow:** External process writes via temp file + rename (Claude Code pattern). Watcher fires.
- **Subsystems:** ContentFileWatcher, fs event handling
- **Expected:** Rename events trigger content re-read (BUG 3 lesson — don't filter eventType)
- **Likely to break:** Regression of BUG 3 — filtering to `eventType === 'change'` only, missing rename events
- **Size:** Small
- **Verification:** Simulate rename event. Assert callback fires.

### T-0200-W03: ContentFileWatcher — stop watching on file close

- **Flow:** Watch file A. Switch to different file (or close tab). Watcher for A stops.
- **Subsystems:** ContentFileWatcher lifecycle
- **Expected:** `fs.watch` handle closed. No more callbacks for A. New watcher started for new file.
- **Likely to break:** Watcher leak — old watcher not closed when switching files. Leads to accumulating handles over time.
- **Size:** Small
- **Verification:** Start watcher, call stop/switch. Simulate change on old file. Assert callback NOT called.

### T-0200-W04: ContentFileWatcher — debounce rapid changes

- **Flow:** 5 rapid file changes within 200ms → single callback with final content
- **Subsystems:** ContentFileWatcher debounce logic
- **Expected:** Callback fires once after debounce settles
- **Likely to break:** Debounce not resetting on subsequent events, causing intermediate reads
- **Size:** Small
- **Verification:** Simulate 5 rapid events. Assert callback called once.

### T-0200-W05: Right pane preserves scroll on external update (medium)

- **Flow:** Right pane shows code file scrolled to line 100. External write occurs. Content updates, scroll stays near line 100.
- **Subsystems:** ContentFileWatcher → IPC → right pane Monaco model update → scroll preservation
- **Expected:** ScrollTop approximately preserved (content may shift lines, but viewport shouldn't jump to top)
- **Likely to break:** Naive `model.setValue()` resetting scroll. Need save/restore scroll around update.
- **Size:** Medium
- **Verification:** Playwright: open code file, scroll to position, trigger external write, verify scrollTop is close to original.

### T-0200-W06: Left and right pane watchers share ContentFileWatcher module

- **Flow:** Left pane watches .nap file (read-write, with echo suppression). Right pane watches code file (read-only, no echo suppression). Both use ContentFileWatcher.
- **Subsystems:** ContentFileWatcher module, ContentPane, TerminalPane (code branch)
- **Expected:** Both watchers function correctly through the same module. Left pane's echo suppression doesn't affect right pane's watcher.
- **Likely to break:** Shared state in the module (e.g., a single `suppressExternalRef` flag that leaks across watchers). The module must be instantiated per-use, not singleton.
- **Size:** Small
- **Verification:** Create two watcher instances. Trigger changes on both files. Assert both callbacks fire independently. Set suppress on one — the other still fires.


## Priority ordering

If implementation time is limited, test in this order:

1. **routeLink classification (L01-L04)** — pure function, fast to write, defines the contract that everything else depends on
2. **Store state for right pane (P01-P04)** — small tests, catch state coupling before UI exists
3. **Tab state model (T01-T06)** — the most complex state, most opportunities for bugs, all testable as small tests
4. **Shift-enter detection (SE01-SE05)** — pure string logic, fast to verify
5. **Git diff parsing (G01-G05)** — pure function, isolated, high value for correctness
6. **ContentFileWatcher (W01-W04)** — extracted module with clean seam, catches watcher regressions
7. **Right pane mode switching (P05-P07)** — medium tests, proves the mixed surface works
8. **Tab rendering + interactions (T07-T10)** — medium tests for disposal and interaction
9. **Git gutter rendering (G06-G07)** — medium, visual verification
10. **Shift-enter in Monaco (SE06-SE07)** — medium, keybinding integration
11. **Path resolution matrix (L05-L07)** — important but less likely to catch novel bugs than the above
12. **Code file watching full round-trip (W05-W06)** — medium, verifies the extraction works end-to-end
