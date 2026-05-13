# 002-fs-eng-content — response

## What I built

### 1. Routing rules (`src/renderer/routing-rules.ts`)
- Pure function `route(ctx)` → `{ pane, surface }`
- Path matching uses `split('/')` + segment equality check for `.nap` — no `includes('.nap')` substring trap
- Three rules: agent → right/terminal, `.nap/` file → left/monaco, fallback → right/terminal

### 2. Store changes (`src/renderer/store.ts`)
- Added `activeFilePath: string | null` (renderer-only state)
- Added `openFile(path: string)` action — sets `activeFilePath`, independent from `activeTerminalId`
- Per-nepic memory: `nepicFilePathMemory` saves/restores `activeFilePath` on nepic switch
- `applySnapshot` preserves `activeFilePath` on same-nepic snapshots (it's not in AppSnapshot)

### 3. Three-column layout (`src/renderer/index.tsx`)
- Replaced `<Terminal />` fallback with `<ContentPane /> + <ResizeHandle /> + <TerminalPane />`
- `ResizeHandle` — drag between left and right panes, min width 200px each, highlights on hover
- Uses `flex` percentages for proportional sizing

### 4. ContentPane (`src/renderer/ContentPane.tsx`)
- Monaco editor with `napkin-markdown` language and `napkin-dark` theme
- Ephemeral: one file at a time, no tabs
- Editor config: wordWrap on, minimap off, lineNumbers off, quickSuggestions off, matching font
- Auto-save on change (1s debounce → `file:write` IPC)
- File watching: `file:watch` IPC tells main which file to watch, `file:changed` IPC pushes updates back
- Write-echo suppression: saves suppress external update processing for 500ms
- ResizeObserver → `editor.layout()` on container resize
- Empty state placeholder when no file open
- Breadcrumb showing last two path segments

### 5. Monarch tokenizer (`src/renderer/napkin-markdown.ts`)
- Registered language `napkin-markdown` with Monaco
- Token rules: headings, bullets, bold (with `@bold` state), inline code, comments
- Role-prefixed `//X:` rules come BEFORE generic `//` — catches `//A:`, `//DU:`, `//FS:`, `//TA:`, `//TE:`
- Role colors from ROLE_COLORS (dot-style.ts values)
- `napkin-dark` theme extending `vs-dark`

### 6. TerminalPane (`src/renderer/TerminalPane.tsx`)
- Wrapper around existing `Terminal` component
- Empty state placeholder when no agent selected
- Terminal.tsx unchanged — just reparented into this wrapper

### 7. File content IPC
- `file:read` — renderer reads file content (invoke)
- `file:write` — renderer saves file content (invoke), with echo suppression via `pendingContentWrites` set
- `file:watch` — renderer tells main which file to watch (send)
- `file:changed` — main notifies renderer of external changes (send)
- Added to preload.ts and electronAPI type declaration

### 8. Nav changes (Sidebar.tsx)
- FileRow click: routes through `route({ filePath })` → `openFile()` for `.nap/` files, `openFilePath()` for others
- AgentDot click: routes through `route({ agent })` → `setActiveTerminal()` (same behavior, now through routing)
- Copy and open-external controls: unchanged (bypass routing, direct clipboard/OS actions)
- `[terminal]` entry: unchanged (direct `setActiveTerminal`)

## Decisions made

1. **Monaco workers**: Used ESM `import.meta.url` approach with `self.MonacoEnvironment.getWorker` — no vite plugin needed, works with electron-vite out of the box.

2. **File watching**: New per-file watcher in main process (separate from model's directory watcher). Renderer controls which file to watch via `file:watch` IPC. This keeps the two watching concerns (model structure vs file content) completely separate.

3. **Echo suppression**: Two layers — `pendingContentWrites` set in main (300ms clear), `suppressExternalRef` in renderer (500ms after save). Prevents write→watch→re-read loop.

4. **Resize handle**: Percentage-based flex sizing with 200px minimums. Single handle between content and terminal panes. Sidebar already has its own resize handle.

5. **Per-nepic file memory**: `activeFilePath` is saved/restored per nepic, same pattern as `activeTerminalId`. On switch to a nepic with no remembered file, it clears to null.

## TypeScript

`tsc --noEmit` — zero errors.

## Files created/modified

**Created:**
- `src/renderer/routing-rules.ts`
- `src/renderer/napkin-markdown.ts`
- `src/renderer/ContentPane.tsx`
- `src/renderer/TerminalPane.tsx`

**Modified:**
- `src/renderer/index.tsx` — three-column layout + ResizeHandle
- `src/renderer/store.ts` — activeFilePath + openFile + per-nepic memory
- `src/renderer/Sidebar.tsx` — FileRow/AgentDot click routing
- `src/main/main.ts` — file content IPC handlers + watcher
- `src/main/preload.ts` — file content API exposure
- `package.json` — monaco-editor dependency
