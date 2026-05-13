You're the fullstack engineer for the 0100-content-pane feature. Read your role in `.nap/00-org/40-roles/fullstack-eng.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md` — understand how the app, model, renderer, and pty system work. This is essential for this feature.

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0100-content-pane/`):
1. `0100-content-pane.nap.md` — the napkin
2. `0100-content-pane.spec.md` — the spec (your primary reference)
3. `0100-content-pane.stories.md` — user journeys
4. `0100-content-pane.test.md` — test architecture (shape your code so these tests are possible)

## Codebase reading — do this before writing any code

Explore `packages/v3/src/` thoroughly. You need to understand:

- **`src/renderer/index.tsx`** — current layout (two columns: sidebar + terminal). You're changing this to three columns.
- **`src/renderer/store.ts`** — zustand store. You're adding `activeFilePath` and `openFile()`.
- **`src/renderer/Sidebar.tsx`** — FileRow click handler (currently `window.electronAPI.openFilePath`). You're replacing this with routing.
- **`src/renderer/Terminal.tsx`** — terminal component. This moves into the right pane. Understand how it manages xterm reparenting and ResizeObserver.
- **`src/renderer/terminal-registry.ts`** — xterm instance management.
- **`src/shared/dot-style.ts`** — ROLE_COLORS. Use these for tokenizer role colors.
- **`src/main/main.ts`** — IPC wiring. You may need new IPC channels for file content.
- **`src/main/filesystem.ts`** — FileSystem interface. Used by model for reads/writes.
- **`src/main/preload.ts`** — exposed API. You may need to add file content IPC.

Also read the existing test infrastructure:
- `packages/v3/tests/` — look at patterns for small and medium tests
- `src/main/pty-spawner.ts` — FakePtySpawner pattern

## What to build

### 1. Routing rules (`src/renderer/routing-rules.ts`)
- Pure function, no imports from store or React
- Takes click context, returns `{ pane: 'left' | 'right', surface: 'monaco' | 'terminal' }`
- See spec for rules. Path matching must use path segments, not `includes('.nap')`.

### 2. Three-column layout (`src/renderer/index.tsx`)
- Replace current `<Sidebar /> + <Terminal />` with `<Sidebar /> + <ContentPane /> + <TerminalPane />`
- Resize handles between the three columns
- Both content panes always visible, placeholder when empty

### 3. Left content pane (`src/renderer/ContentPane.tsx`)
- New component. Monaco editor showing the active file.
- Uses `activeFilePath` from store.
- Registers `napkin-markdown` monarch tokenizer + theme.
- Read-write. Auto-save on change (1s debounce → write to disk via IPC).
- File watching: updates from external changes (agent edits).
- ResizeObserver → `editor.layout()` on container resize.
- Empty state: placeholder when no file open.

### 4. Monarch tokenizer (`src/renderer/napkin-markdown.ts`)
- Register language `napkin-markdown` with Monaco.
- Token rules per spec: headings, bullets, bold, inline code, // comments, role-prefixed comments.
- Role colors from dot-style.ts ROLE_COLORS.
- IMPORTANT: role-specific `//X:` rules must come BEFORE generic `//` in the tokenizer.

### 5. Right pane — terminal relocation
- Move terminal rendering into a right pane container.
- The Terminal.tsx component is largely unchanged — just reparented.
- Ensure ResizeObserver still fires in new container.
- TerminalPane wrapper with breadcrumb + empty state.

### 6. Store changes (`src/renderer/store.ts`)
- Add `activeFilePath: string | null`
- Add `openFile(path: string)` action
- `activeFilePath` and `activeTerminalId` are independent — never cross-affect.
- `applySnapshot` must preserve `activeFilePath` (it's renderer-only state).

### 7. File content IPC
- Renderer needs to read file content (for Monaco) and write (auto-save).
- Main process needs to notify renderer when a watched file changes.
- Add IPC channels: `file:read`, `file:write`, `file:changed`.
- Add to preload.ts electronAPI.

### 8. Nav changes (Sidebar.tsx)
- FileRow click: route through routing-rules → `store.openFile(path)` instead of `openFilePath`.
- AgentDot click: route through routing-rules → `store.setActiveTerminal(id)`.
- Copy/open-external controls: unchanged (bypass routing).
- [terminal] entry in extended view: unchanged.

## Build order suggestion

1. Routing rules (standalone, testable immediately)
2. Store changes (add state, test independence)
3. Three-column layout (structural change to index.tsx)
4. ContentPane + tokenizer (the new component)
5. File content IPC (main + preload + renderer wiring)
6. Nav changes (sidebar click handler migration)
7. Terminal relocation (move into right pane)

Run `tsc --noEmit` in `packages/v3/` before you're done. Zero type errors.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0100-content-pane/agents/002-fs-eng-content/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
