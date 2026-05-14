You're the fullstack engineer for 0320-session-and-render. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md`

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0320-session-and-render/`):
1. `0320-session-and-render.nap.md` — the napkin (design threads)
2. `0320-session-and-render.spec.md` — the spec
3. `0320-session-and-render.stories.md` — user journeys
4. `0320-session-and-render.test.md` — test architecture

Read the test architect's findings:
`.nap/nepics/04-books/30-napkins/0320-session-and-render/agents/001-test-arch-session/response.md`

**Architect decisions on TA findings:**
- **Finding 1 (tab ID transience):** Correct. On restore, create fresh tab IDs. Match `activeLeftTabId`/`activeRightTabId` by saved path — find the restored tab whose path matches the saved active tab's path.
- **Finding 2 (rendered re-render timing):** The effect that generates rendered HTML must also listen for the Monaco model's `onDidChangeContent`. When tabs switch, the old disposable must be cleaned up and a new one created for the new model. The simplest approach: re-render in the same effect that loads file content (the `[activeFilePath]` effect), after `model.setValue()` completes.
- **Finding 3 (ghost tab watcher):** Use `fs.watch(dirname, { recursive: false })` and filter events by the expected filename. One watcher per ghost tab's parent dir. If multiple ghosts share a parent dir, reuse the watcher. Clean up watcher when ghost becomes live or tab is closed.

Read the code you're modifying:
- `packages/v3/src/renderer/store.ts` — tab state, persist/restore
- `packages/v3/src/renderer/ContentPane.tsx` — rendered mode, file watching
- `packages/v3/src/renderer/index.tsx` — loadPersistedUiState, save-ui-state IPC
- `packages/v3/src/renderer/TabBar.tsx` — tab rendering (ghost styling)
- `packages/v3/src/renderer/markdown-renderer.ts` — renderMarkdown
- `packages/v3/src/main/main.ts` — save-ui-state, load-ui-state IPC handlers
- `packages/v3/src/main/preload.ts` — exposed API

Explore broadly before building.

## What to build

### 1. Session save (on quit)
- Extend the `save-ui-state` payload with: `focusedCardSlug`, `activeTerminalId`, `leftTabs` (path + ephemeral for each), `rightTabs`, `activeLeftTabPath`, `activeRightTabPath`, `leftPaneRenderMode`.
- Save tab paths, not IDs (IDs are transient).
- Save active tab by path, not ID.

### 2. Session restore (on start)
- In `loadPersistedUiState()`: restore focusedCardSlug, leftPaneRenderMode.
- After model loads: restore activeTerminalId (if agent exists), tabs (in saved order).
- For each tab path: try `file:read`. Success → normal tab. Failure → ghost tab (`{ ...tab, ghost: true }`).
- Generate fresh tab IDs. Set active tab by matching restored path.

### 3. Ghost tabs
- `Tab` type gets `ghost?: boolean`.
- TabBar: ghost tabs render with `opacity: 0.4`, italic title.
- ContentPane/TerminalPane: ghost tab active → show "file not found" placeholder.
- Ghost watcher: `fs.watch(dirname(ghostPath))`, filter for basename. On file appear → `file:read`, promote ghost to live tab, dispose watcher.
- New IPC: `file:watch-dir(dirPath, filename)` → notifies renderer when that filename appears. Or: reuse existing file watcher with a "watch for creation" mode.

### 4. Rendered mode refresh on tab switch
- The effect that renders HTML must re-run when `activeFilePath` changes while mode is `'rendered'`.
- Also re-render when external file change fires (`onFileChanged` callback) while rendered.
- Handle the timing issue: render AFTER model content is updated, not before.

### 5. Scroll sync
- New module or functions in ContentPane:
  - `computeScrollTarget(editor, renderedDiv, direction: 'toRendered' | 'toEdit')` → scrollTop or lineNumber.
  - `findClosestSourceLine(renderedDiv, targetLine)` → HTMLElement with nearest `data-source-line`.
- Edit → rendered: get anchor line + screen y, find rendered element, set scrollTop.
- Rendered → edit: find topmost visible source-line element, set editor position + reveal.
- Off-screen cursor fallback: use `getVisibleRanges()[0].startLineNumber`, screen y = 0.

Run `tsc --noEmit` before you're done. Zero type errors.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0320-session-and-render/agents/002-fs-eng-session/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
