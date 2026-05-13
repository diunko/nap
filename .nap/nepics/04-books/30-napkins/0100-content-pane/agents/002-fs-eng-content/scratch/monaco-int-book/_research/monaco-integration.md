# Monaco Integration Research — Complete Findings

Research date: 2026-05-13
Researcher: Chapter researcher agent

All line numbers verified by direct file reads. Every code snippet is pasted from actual source.

---

## 1. Monaco Setup and Worker Configuration

### 1.1 MonacoEnvironment Worker Config [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 16-24
**What it does:** Configures Monaco to spawn web workers for syntax highlighting and other background tasks using the ESM approach.
**Why it's shaped this way:** Monaco needs web workers for performance. The traditional approach uses `monaco-editor-webpack-plugin`, but since this project uses electron-vite (Vite-based), the ESM approach with `new URL(..., import.meta.url)` is used instead. This lets Vite discover and bundle the worker file as a separate chunk automatically -- no plugin needed.
**Key detail:** The `self.MonacoEnvironment` is set at module scope (outside any component), so it executes once when ContentPane.tsx is first imported. The `{ type: 'module' }` option means the worker is loaded as an ES module.
**Used by:** Monaco internally -- whenever the editor needs a worker (e.g., for diff computation, syntax validation).

```typescript
// Configure Monaco workers (ESM approach — no external plugin needed)
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    );
  },
};
```

**Surprising finding:** The function ignores `_label` entirely -- it always returns the same generic editor worker. Monaco can have specialized workers for different languages (e.g., `css.worker.js`, `ts.worker.js`, `json.worker.js`), but napkin-markdown only needs the base editor worker since Monarch tokenization runs synchronously in the main thread.

### 1.2 The `ensureRegistered()` Pattern [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 7-14
**What it does:** Gates Monaco language/theme registration so it only happens once, even if the ContentPane component mounts/unmounts multiple times.
**Why it's shaped this way:** Monaco `register()` and `defineTheme()` calls are global and idempotent-ish, but calling `setMonarchTokensProvider` twice for the same language ID would be wasteful and potentially buggy. The module-level boolean `registered` persists across React renders/remounts.
**Key detail:** This also sets up the `window.__monaco__` test exposure.

```typescript
// Register language + theme once
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
  // Expose Monaco for medium tests (same pattern as window.__napStore__)
  (window as any).__monaco__ = monaco;
}
```

**Called from:** The `useEffect(() => { ... }, [])` that creates the editor (line 37).

### 1.3 The `__monaco__` Test Exposure [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Line:** 13
**What it does:** Exposes the Monaco module to the global `window` object so Playwright tests can call `monaco.editor.tokenize()`, `monaco.editor.getEditors()`, etc.
**Why it's shaped this way:** Same pattern as `window.__napStore__` (set at packages/v3/src/renderer/index.tsx line 45). Medium tests need to introspect Monaco state (verify tokenization, check editor config, confirm model content), and there's no other way to reach the Monaco API from Playwright's `page.evaluate()`.
**Used by:** Every content-monaco.spec.ts test, plus content-layout.spec.ts, content-nav.spec.ts, and content-watching.spec.ts.

Example usage in test (content-monaco.spec.ts lines 99-108):
```typescript
await page.waitForFunction(
  () => {
    const m = (window as any).__monaco__;
    if (!m) return false;
    const editors = m.editor.getEditors();
    if (!editors || editors.length === 0) return false;
    const model = editors[0].getModel();
    return model && model.getValue().includes('Heading');
  },
  { timeout: 15000 },
);
```

### 1.4 electron-vite Configuration [VERIFIED]

**File:** packages/v3/electron.vite.config.ts
**Lines:** 1-31
**What it does:** Configures electron-vite's three build targets: main process, preload script, and renderer.
**Why it's shaped this way:** electron-vite expects a three-part config. The main and preload use `externalizeDepsPlugin()` (so node modules like `fs`, `node-pty` are not bundled). The renderer uses the React plugin and has its own root at `src/renderer`.
**Key detail for Monaco:** There's NO special Monaco plugin or configuration. This works because Vite natively handles the `new URL(..., import.meta.url)` pattern -- Vite sees the URL constructor and emits the worker file as a separate asset. The renderer build config has no custom rollup config for Monaco -- it just works.

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
```

### 1.5 Monaco Package Version [VERIFIED]

**File:** packages/v3/package.json
**Line:** 26
**Version:** `"monaco-editor": "^0.55.1"`

This is a direct dependency (not dev), confirming Monaco is bundled into the renderer output.

### 1.6 Content Security Policy [VERIFIED]

**File:** packages/v3/src/renderer/index.html
**Lines:** 5-6
**What it does:** Sets CSP for the renderer process.
**Key detail:** `script-src 'self' 'unsafe-inline'` is needed because Monaco generates inline scripts for some features. Without `'unsafe-inline'`, Monaco's worker bootstrapping would fail. The `connect-src 'self' ws:` allows WebSocket connections (used by electron-vite's dev server HMR).

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws:">
```

---

## 2. The Monarch Tokenizer (`napkin-markdown.ts`)

### 2.1 Language Registration [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 19-20
**What it does:** Registers the custom language ID `napkin-markdown` with Monaco.
**Why it's shaped this way:** Every custom language needs an explicit `register()` call before a tokenizer can be attached.

```typescript
export function registerNapkinMarkdown(): void {
  monaco.languages.register({ id: 'napkin-markdown' });
```

### 2.2 Root Tokenizer Rules [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 22-57
**What it does:** Defines the complete Monarch tokenizer state machine with two states: `root` and `bold`.
**Why it's shaped this way:** Monarch is Monaco's built-in tokenizer engine. It uses regex-based rules evaluated top-to-bottom within a state. Order matters critically for overlapping patterns.

```typescript
  monaco.languages.setMonarchTokensProvider('napkin-markdown', {
    tokenizer: {
      root: [
        // Headings: # at line start
        [/^#{1,6}\s.*$/, 'heading'],

        // Role-prefixed comments — MUST come before generic //
        [/\/\/A:.*$/, 'comment.architect'],
        [/\/\/DU:.*$/, 'comment.user'],
        [/\/\/FS:.*$/, 'comment.fs-eng'],
        [/\/\/TA:.*$/, 'comment.test-arch'],
        [/\/\/TE:.*$/, 'comment.test-eng'],

        // Generic comment
        [/\/\/.*$/, 'comment'],

        // Bold: **text** — tokenize markers and content
        [/\*\*/, 'bold.marker', '@bold'],

        // Inline code: `text`
        [/`[^`]+`/, 'inline-code'],

        // Bullet marker: * at line start (with optional leading whitespace)
        [/^(\s*\*)(\s)/, ['bullet.marker', 'white']],

        // Everything else
        [/./, 'source'],
      ],

      bold: [
        [/\*\*/, 'bold.marker', '@pop'],
        [/[^*]+/, 'bold'],
        [/\*/, 'bold'],
      ],
    },
  });
```

### 2.3 Role-Prefixed Comments -- Why Order Matters [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 4, 28-36
**What it does:** Five specific role-prefix rules match before the generic `//` comment rule.
**Why it's shaped this way:** Monarch evaluates rules top-to-bottom. If `//.*$` came first, it would match ALL comments (including `//A:`, `//DU:`, etc.) and role-specific rules would never fire. The comment at line 4 explicitly documents this: "Role-prefixed comment rules (//A:, //DU:, etc.) MUST come before generic //."
**Key design decision:** Each role gets its own token type (`comment.architect`, `comment.user`, etc.), which maps to a unique color in the theme. This means agent annotations in napkin files are visually distinguishable by role.

The five role prefixes and their abbreviations:
- `//A:` = architect
- `//DU:` = user (DU = "Dima/User" based on the comment at line 10)
- `//FS:` = fullstack engineer
- `//TA:` = test architect
- `//TE:` = test engineer

### 2.4 The `@bold` State Machine [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 39, 51-55
**What it does:** Implements bold text highlighting as a two-state construct. When `**` is encountered in the root state, it transitions to the `bold` state. Inside `bold`, text gets the `bold` token, and a closing `**` pops back to root.
**Why it's shaped this way:** Monarch can't match across multiple tokens in a single rule (no lookback). The state machine approach lets it handle the opening `**`, arbitrary bold content, and closing `**` as separate token events while maintaining correct state.

**Opening transition (line 39):**
```typescript
[/\*\*/, 'bold.marker', '@bold'],
```

**Bold state (lines 51-55):**
```typescript
bold: [
  [/\*\*/, 'bold.marker', '@pop'],
  [/[^*]+/, 'bold'],
  [/\*/, 'bold'],
],
```

**Subtle detail:** The third rule `[/\*/, 'bold']` handles a single `*` inside bold text (not a closing `**`). Without it, a single asterisk would be unmatched and potentially cause tokenizer errors.

### 2.5 ROLE_COLORS and Theme Definition [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 8-17, 59-79
**What it does:** Defines the color mapping for all token types in the `napkin-dark` theme.
**Why it's shaped this way:** The colors are duplicated from `dot-style.ts` ROLE_COLORS (not imported -- see below). The theme extends VS Code's `vs-dark` base.

**ROLE_COLORS in napkin-markdown.ts (lines 9-15):**
```typescript
const ROLE_COLORS = {
  architect: '#3b82f6',   // blue
  user: '#22c55e',        // green (DU = "Dima/User")
  'fs-eng': '#22c55e',    // green
  'test-arch': '#f59e0b', // orange
  'test-eng': '#6b7280',  // gray
};
```

**ROLE_COLORS in dot-style.ts (lines 16-22):**
```typescript
const ROLE_COLORS: Record<string, string> = {
  'test-arch': '#f59e0b',   // orange
  'fs-eng': '#22c55e',      // green
  'test-eng': '#6b7280',    // gray
  'architect': '#3b82f6',   // blue
  'guardian': '#a855f7',    // purple
};
```

**Surprising finding:** The colors are duplicated, not shared. The napkin-markdown.ts version has `user: '#22c55e'` which doesn't exist in dot-style.ts, and dot-style.ts has `guardian: '#a855f7'` which doesn't exist in napkin-markdown.ts. The comment at line 8 says "Role colors from dot-style.ts ROLE_COLORS" -- but it's a manual copy, not an import. This is a potential maintenance hazard if colors change.

**Theme definition (lines 59-79):**
```typescript
  monaco.editor.defineTheme('napkin-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'heading', foreground: 'e5e5e5', fontStyle: 'bold' },
      { token: 'bullet.marker', foreground: '6b7280' },
      { token: 'bold', fontStyle: 'bold' },
      { token: 'bold.marker', foreground: '6b7280' },
      { token: 'inline-code', foreground: 'ce9178', background: '2d2d2d' },
      { token: 'comment', foreground: COMMENT_COLOR.slice(1) },
      { token: 'comment.architect', foreground: ROLE_COLORS.architect.slice(1) },
      { token: 'comment.user', foreground: ROLE_COLORS.user.slice(1) },
      { token: 'comment.fs-eng', foreground: ROLE_COLORS['fs-eng'].slice(1) },
      { token: 'comment.test-arch', foreground: ROLE_COLORS['test-arch'].slice(1) },
      { token: 'comment.test-eng', foreground: ROLE_COLORS['test-eng'].slice(1) },
      { token: 'source', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
    },
  });
```

**Key detail:** `.slice(1)` strips the leading `#` from hex colors because Monaco's `foreground` field expects bare hex without the hash prefix. `COMMENT_COLOR` is `'#6A9955'` (muted gray-green, VS Code's default comment color).

### 2.6 ROLE_COLORS in dot-style.ts [VERIFIED]

**File:** packages/v3/src/shared/dot-style.ts
**Lines:** 16-24
**What it does:** Canonical source of role colors used by the sidebar dot visualization.
**Why it's shaped this way:** Separates color data from Monaco-specific code. Used by `Sidebar.tsx` via `roleColor()` and `dotStyle()`.

```typescript
const ROLE_COLORS: Record<string, string> = {
  'test-arch': '#f59e0b',   // orange
  'fs-eng': '#22c55e',      // green
  'test-eng': '#6b7280',    // gray
  'architect': '#3b82f6',   // blue
  'guardian': '#a855f7',    // purple
};

const DEFAULT_COLOR = '#3b82f6';  // blue for unknown roles
const EXITED_COLOR = '#6b7280';   // gray overrides role color when exited
```

---

## 3. ContentPane Component Lifecycle

### 3.1 Editor Creation (useEffect with empty deps) [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 35-89
**What it does:** Creates the Monaco editor instance once, when the component first mounts.
**Why it's shaped this way:** The editor is a heavyweight DOM element -- creating/destroying it on every render would be prohibitively expensive. The empty dependency array `[]` means this effect runs once. The editor instance is stored in `editorRef` and reused for all file switches.

```typescript
  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    ensureRegistered();

    const editor = monaco.editor.create(containerRef.current, {
      language: 'napkin-markdown',
      theme: 'napkin-dark',
      wordWrap: 'on',
      minimap: { enabled: false },
      lineNumbers: 'off',
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      fontSize: 14,
      fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      folding: false,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      padding: { top: 12, bottom: 12 },
    });

    editorRef.current = editor;
```

**Editor config philosophy:** Many defaults are disabled (`minimap`, `lineNumbers`, `quickSuggestions`, `folding`, `glyphMargin`, `renderLineHighlight`). This creates a clean, minimal writing surface -- more like a prose editor than a code editor. The padding of 12px top/bottom gives breathing room without wasting space.

### 3.2 Auto-Save Pipeline [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 62-75
**What it does:** Whenever the editor content changes, debounces for 1 second then writes to disk via IPC.
**Why it's shaped this way:** Continuous auto-save without a debounce would flood the filesystem. 1 second is a good balance -- fast enough that users don't lose work, slow enough not to cause excessive disk I/O.

```typescript
    // Auto-save on change (1s debounce)
    editor.onDidChangeModelContent(() => {
      clearTimeout(saveTimerRef.current);
      const filePath = useNapStore.getState().activeFilePath;
      if (!filePath) return;

      suppressExternalRef.current = true;
      saveTimerRef.current = setTimeout(async () => {
        const content = editor.getValue();
        await window.electronAPI?.fileWrite(filePath, content);
        // Keep suppress active briefly for watcher echo
        setTimeout(() => { suppressExternalRef.current = false; }, 500);
      }, 1000);
    });
```

**Key detail:** `suppressExternalRef.current = true` is set IMMEDIATELY on any content change (before the debounce fires), not after the write completes. This is important: if an external file change arrives while the user is still typing (between keystrokes), it would be ignored. The suppress flag stays true until 500ms after the write completes. This prevents the classic "overwrite while typing" race condition.

**Data flow:**
1. User types in editor
2. `onDidChangeModelContent` fires
3. `suppressExternalRef.current = true` (immediately)
4. Previous debounce timer cleared
5. New 1000ms timer set
6. Timer fires: `editor.getValue()` -> `fileWrite(filePath, content)` via IPC
7. 500ms after write: `suppressExternalRef.current = false`

### 3.3 Model Creation/Disposal on File Switch [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 91-128
**What it does:** When `activeFilePath` changes, reads the new file, disposes the old Monaco model, creates a new one, and starts watching the new file.
**Why it's shaped this way:** Monaco models are separate from the editor -- the editor is a view, the model is the data. Switching files means switching models. Old models must be disposed to prevent memory leaks.

```typescript
  // Load file when activeFilePath changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!activeFilePath) {
      // No file — clear model
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      editor.setModel(null);
      // Tell main to stop watching
      window.electronAPI?.fileWatch(null);
      return;
    }

    // Load file content
    (async () => {
      const content = await window.electronAPI?.fileRead(activeFilePath);
      if (content === null || content === undefined) return;

      // Dispose old model, create new
      if (modelRef.current) {
        modelRef.current.dispose();
      }
      const model = monaco.editor.createModel(content, 'napkin-markdown');
      modelRef.current = model;
      editor.setModel(model);

      // Start watching this file
      window.electronAPI?.fileWatch(activeFilePath);
    })();

    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, [activeFilePath]);
```

**Key details:**
- When `activeFilePath` becomes null, the editor is set to `null` model (blank state) and watching is stopped.
- The cleanup function clears the save timer -- important to prevent a save firing for the OLD file after switching to a new one.
- `fileWatch(activeFilePath)` starts a per-file fs.watch in main -- this is SEPARATE from the model's directory watcher.

### 3.4 External File Change Handling [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 131-158
**What it does:** Listens for `file:changed` IPC events from main process. When the active file changes externally (e.g., an agent writes to it), updates the Monaco model while preserving cursor position and scroll offset.
**Why it's shaped this way:** Files in this system are actively written by AI agents. The user might be viewing a file while an agent modifies it. Without this, the editor would show stale content.

```typescript
  // Listen for external file changes
  useEffect(() => {
    if (!window.electronAPI?.onFileChanged) return;

    const unsub = window.electronAPI.onFileChanged((filePath, content) => {
      if (suppressExternalRef.current) return;
      if (filePath !== useNapStore.getState().activeFilePath) return;

      const model = modelRef.current;
      if (!model) return;

      // Preserve cursor/scroll position
      const editor = editorRef.current;
      const position = editor?.getPosition();
      const scrollTop = editor?.getScrollTop();

      // Use applyEdits to preserve undo stack
      model.setValue(content);

      if (editor && position) {
        editor.setPosition(position);
      }
      if (editor && scrollTop !== undefined) {
        editor.setScrollTop(scrollTop);
      }
    });

    return unsub;
  }, []);
```

**Surprising finding (comment vs. code mismatch):** The comment at line 146 says "Use applyEdits to preserve undo stack" but the code actually uses `model.setValue(content)` which REPLACES the entire undo stack. This is either a TODO that wasn't completed, or the developer changed their mind. `model.applyEdits()` would truly preserve undo history, but is more complex to implement (you'd need to compute a diff).

**Guard logic:**
1. `if (suppressExternalRef.current) return;` -- Ignores changes caused by the editor's own auto-save
2. `if (filePath !== useNapStore.getState().activeFilePath) return;` -- Ignores changes to files other than the one being viewed (shouldn't happen since only one file is watched, but defensive)

### 3.5 ResizeObserver -> editor.layout() [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 77-81
**What it does:** Watches the editor container for size changes and calls `editor.layout()` to recalculate Monaco's internal layout.
**Why it's shaped this way:** Monaco doesn't automatically resize when its container changes size. Without this, resizing the pane (via the ResizeHandle drag) would leave Monaco rendering at its old dimensions with clipped content.

```typescript
    // ResizeObserver → editor.layout()
    const observer = new ResizeObserver(() => {
      editor.layout();
    });
    observer.observe(containerRef.current);
```

**Used by:** The ResizeHandle in index.tsx (which changes flex percentages), window resize, and sidebar toggle (which changes available width).

### 3.6 Empty State and Breadcrumb Rendering [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 160-217
**What it does:** Conditionally renders either "no file open" placeholder or breadcrumb + editor container.
**Why it's shaped this way:** The editor container (`<div ref={containerRef}>`) is ALWAYS mounted (never conditionally rendered) because the useEffect that creates the editor depends on finding it in the DOM. The `display: none` hides it when no file is open instead of removing it.

```typescript
      {/* Placeholder — visible when no file open */}
      {!activeFilePath && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 14,
          }}
        >
          no file open
        </div>
      )}
      {/* Breadcrumb — visible when file open */}
      {activeFilePath && (
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid #3c3c3c',
            background: '#252526',
            flexShrink: 0,
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 13,
            color: '#6b7280',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {activeFilePath.split('/').slice(-2).join('/')}
        </div>
      )}
      {/* Editor container — always mounted so useEffect can attach Monaco */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: activeFilePath ? 'block' : 'none',
        }}
      />
```

**Breadcrumb detail:** `activeFilePath.split('/').slice(-2).join('/')` shows only the last two path segments, e.g., `0100-explore/0100-explore.nap.md`. This keeps the breadcrumb compact while still giving directory context.

### 3.7 The `suppressExternalRef` Echo Suppression Pattern [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 32, 68, 73, 135
**What it does:** A ref-based flag that prevents the editor from re-ingesting its own writes. When the editor saves, external file change events are suppressed until the write has settled.
**Why it's shaped this way:** This is one half of a two-layer echo suppression system. The other half is `pendingContentWrites` in main.ts. Both are needed because the timing is unpredictable:
  - Renderer layer (`suppressExternalRef`): Catches changes that arrive at the renderer while the save is in flight or shortly after
  - Main layer (`pendingContentWrites`): Prevents the fs.watch callback from even reading the file and sending the IPC event

**Timeline:**
```
User types → suppressExternalRef = true (immediate)
            → ... 1000ms debounce ...
            → fileWrite IPC → main adds to pendingContentWrites
                            → main writes file
                            → main: setTimeout 300ms → remove from pendingContentWrites
            → renderer: setTimeout 500ms → suppressExternalRef = false
```

---

## 4. File Content IPC Pipeline

### 4.1 Preload API Surface [VERIFIED]

**File:** packages/v3/src/main/preload.ts
**Lines:** 69-78
**What it does:** Exposes four file content APIs through the context bridge: `fileRead`, `fileWrite`, `onFileChanged`, `fileWatch`.

```typescript
  // ── File content (0100 — content pane) ──
  fileRead: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  fileWrite: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
  onFileChanged: (cb: (filePath: string, content: string) => void) => {
    const handler = (_event: IpcRendererEvent, filePath: string, content: string) =>
      cb(filePath, content);
    ipcRenderer.on('file:changed', handler);
    return () => ipcRenderer.removeListener('file:changed', handler);
  },
  fileWatch: (filePath: string | null) => ipcRenderer.send('file:watch', filePath),
```

**Key details:**
- `fileRead` and `fileWrite` use `invoke` (request-response, returns a Promise)
- `onFileChanged` uses `on` (event listener, returns an unsubscribe function)
- `fileWatch` uses `send` (fire-and-forget, no response)
- `onFileChanged` returns a cleanup function (pattern consistent with `pty.onData`, `pty.onExit`)

### 4.2 Main Process: file:read [VERIFIED]

**File:** packages/v3/src/main/main.ts
**Lines:** 199-205
**What it does:** Reads a file's UTF-8 content. Returns null on error (file not found, permission denied, etc.).

```typescript
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      return await nodeFsPromises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  });
```

**Key detail:** Uses `nodeFsPromises` (Node's `fs/promises`) directly -- NOT the `NodeFileSystem` abstraction. This is notable because the model's file operations DO go through the `FileSystem` interface, but the content pane reads/writes are raw.

### 4.3 Main Process: file:write with Echo Suppression [VERIFIED]

**File:** packages/v3/src/main/main.ts
**Lines:** 207-220
**What it does:** Writes file content to disk, with echo suppression via `pendingContentWrites`.

```typescript
  // Track pending writes for echo suppression
  const pendingContentWrites = new Set<string>();

  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
      pendingContentWrites.add(filePath);
      await nodeFsPromises.writeFile(filePath, content);
      // Clear after debounce window so watcher doesn't echo
      setTimeout(() => pendingContentWrites.delete(filePath), 300);
      return { ok: true };
    } catch (err) {
      return { error: true, message: String(err) };
    }
  });
```

**Why 300ms:** The fs.watch event for the write arrives asynchronously. On macOS, kqueue typically delivers the event within 50-100ms. 300ms provides a safe margin.

### 4.4 Main Process: Per-File Content Watcher [VERIFIED]

**File:** packages/v3/src/main/main.ts
**Lines:** 222-259
**What it does:** Manages a single file watcher that tracks the currently open file. When the renderer switches files, the old watcher is torn down and a new one is created.

```typescript
  // Per-file content watcher: renderer tells us which file to watch
  let contentWatcher: (() => void) | null = null;
  let watchedFilePath: string | null = null;
  let contentDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  ipcMain.on('file:watch', (_event, filePath: string | null) => {
    // Clean up previous watcher
    if (contentWatcher) {
      contentWatcher();
      contentWatcher = null;
    }
    clearTimeout(contentDebounceTimer);
    watchedFilePath = filePath;

    if (!filePath) return;

    try {
      const watcher = nodeFs.watch(filePath, (eventType) => {
        if (eventType !== 'change') return;
        if (pendingContentWrites.has(filePath)) return; // echo suppression

        clearTimeout(contentDebounceTimer);
        contentDebounceTimer = setTimeout(async () => {
          try {
            const content = await nodeFsPromises.readFile(filePath, 'utf-8');
            if (!win.isDestroyed()) {
              win.webContents.send('file:changed', filePath, content);
            }
          } catch {
            // File may have been deleted
          }
        }, 200);
      });
      contentWatcher = () => watcher.close();
    } catch {
      // File may not exist yet
    }
  });
```

**Key design decisions:**
1. **Single watcher:** Only one file is watched at a time. This is efficient -- no leaked watchers for previously viewed files.
2. **Separate from model watcher:** The model watches the nepic DIRECTORY (recursive) for structural changes (new agents, napkin status). This watches a SINGLE FILE for content changes. Different concerns, different mechanisms.
3. **Only `'change'` events:** Ignores `'rename'` -- if the file is deleted/moved, the watcher silently becomes a no-op.
4. **200ms debounce:** External writes (from AI agents) might come as multiple rapid operations. The debounce ensures only the final state is sent to the renderer.

### 4.5 The Complete Debounce Chain [VERIFIED]

Three independent debounce timers form a pipeline:

1. **Renderer auto-save debounce: 1000ms** (ContentPane.tsx line 69)
   - Triggered by: User typing in editor
   - Purpose: Don't write to disk on every keystroke
   
2. **Main echo suppress window: 300ms** (main.ts line 215)
   - Triggered by: `file:write` handler completing
   - Purpose: Prevent fs.watch from echoing back the write we just did

3. **Main watcher debounce: 200ms** (main.ts line 244)
   - Triggered by: fs.watch detecting a file change
   - Purpose: Coalesce rapid external changes into one IPC event

4. **Renderer suppress timeout: 500ms** (ContentPane.tsx line 73)
   - Triggered by: Auto-save completing
   - Purpose: Ignore any residual change events that slip past the main-layer suppression

**Timeline for user edit:**
```
t=0       User types → suppressExternalRef = true
t=1000    Debounce fires → fileWrite IPC
t=1000    Main: pendingContentWrites.add(path)
t=1000    Main: writeFile(path, content)
t=~1050   fs.watch fires → pendingContentWrites.has(path) → SUPPRESSED
t=1300    Main: pendingContentWrites.delete(path)
t=1500    Renderer: suppressExternalRef = false
```

**Timeline for external change (agent writes to file):**
```
t=0       Agent writes file
t=~50     fs.watch fires (eventType: 'change')
t=~50     pendingContentWrites check → NOT suppressed
t=~50     contentDebounceTimer set for 200ms
t=~250    Debounce fires → readFile → send 'file:changed' IPC
t=~250    Renderer receives → suppressExternalRef check → NOT suppressed
t=~250    model.setValue(content), cursor/scroll restored
```

---

## 5. Store Integration

### 5.1 activeFilePath State and openFile Action [VERIFIED]

**File:** packages/v3/src/renderer/store.ts
**Lines:** 17, 29, 132-134
**What it does:** `activeFilePath` is a renderer-only state field that tracks which file is open in the Monaco editor. `openFile()` is the only way to set it.

```typescript
// In the NapStore interface:
  activeFilePath: string | null;
  openFile: (path: string) => void;

// In the store implementation:
  activeFilePath: null,

  openFile: (path: string) => {
    set({ activeFilePath: path });
  },
```

**Key design:** `openFile` is a trivial setter -- it does NOT trigger file reading or IPC. The ContentPane's `useEffect([activeFilePath])` reacts to the state change and handles all the loading.

### 5.2 Independence from activeTerminalId [VERIFIED]

**File:** packages/v3/src/renderer/store.ts
**Lines:** 12, 128-134
**What it does:** `activeTerminalId` and `activeFilePath` are completely independent state fields. Setting one does NOT affect the other.

This is verified by tests:

**Test S02 (content-store.test.ts lines 58-62):**
```typescript
  it('S02: openFile does NOT change activeTerminalId', () => {
    useNapStore.getState().setActiveTerminal('uuid-1');
    useNapStore.getState().openFile('/some/file.md');
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');
  });
```

**Test S03 (content-store.test.ts lines 65-69):**
```typescript
  it('S03: setActiveTerminal does NOT change activeFilePath', () => {
    useNapStore.getState().openFile('/some/file.md');
    useNapStore.getState().setActiveTerminal('uuid-1');
    expect(useNapStore.getState().activeFilePath).toBe('/some/file.md');
  });
```

### 5.3 Per-Nepic Memory for File Path [VERIFIED]

**File:** packages/v3/src/renderer/store.ts
**Lines:** 46, 52, 85-88, 110-111
**What it does:** When switching between nepics, the currently open file path is saved in `nepicFilePathMemory` (a plain Map) and restored when switching back.

**Save on switch (lines 85-88):**
```typescript
      if (prev.activeFilePath) {
        nepicFilePathMemory.set(prev.activeNepicId, prev.activeFilePath);
      }
```

**Restore on switch (lines 110-111):**
```typescript
      const rememberedFile = nepicFilePathMemory.get(snapshot.activeNepicId);
      updates.activeFilePath = rememberedFile ?? null;
```

**Key detail:** This is NOT persisted to disk. It's in-memory only, cleared on app restart. The `_resetNepicTerminalMemory()` test helper also clears it (line 52: `nepicFilePathMemory.clear()`).

### 5.4 applySnapshot Preserves Renderer-Only State [VERIFIED]

**File:** packages/v3/src/renderer/store.ts
**Lines:** 74-126
**What it does:** When a new snapshot arrives from main (model change), it only updates model state fields (`napkins`, `architects`, `activeNepicId`, `nepics`, `watcherEvents`). Renderer-only state like `activeFilePath` is NOT touched -- unless it's a nepic switch.

**The key discriminator (lines 76-77):**
```typescript
    const nepicChanged = snapshot.activeNepicId !== prev.activeNepicId && prev.activeNepicId !== '';
```

**Comment at line 73:**
```typescript
  // Snapshot only updates model state — renderer-only state preserved
```

**Test S07 (content-store.test.ts lines 133-149) verifies this:**
```typescript
  it('S07: same-nepic snapshot preserves activeFilePath', () => {
    // ... set activeFilePath to '/some/file.md' ...
    // Another snapshot for same nepic — should NOT touch activeFilePath
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));
    expect(useNapStore.getState().activeFilePath).toBe('/some/file.md');
  });
```

---

## 6. Layout and Routing

### 6.1 route() Function and isNapPath() [VERIFIED]

**File:** packages/v3/src/renderer/routing-rules.ts
**Lines:** 1-45
**What it does:** Pure function that determines where a sidebar click should route -- left pane (Monaco) or right pane (terminal).

```typescript
export interface ClickContext {
  filePath?: string;
  agent?: { id: string; started: boolean };
}

export interface RouteResult {
  pane: 'left' | 'right';
  surface: 'monaco' | 'terminal';
}

export function route(ctx: ClickContext): RouteResult {
  // Agent click → right pane, terminal
  if (ctx.agent) {
    return { pane: 'right', surface: 'terminal' };
  }

  // File inside .nap/ → left pane, Monaco
  if (ctx.filePath && isNapPath(ctx.filePath)) {
    return { pane: 'left', surface: 'monaco' };
  }

  // Fallback → right pane
  return { pane: 'right', surface: 'terminal' };
}

/** Check if a path has .nap as a directory segment (not just a substring). */
function isNapPath(filePath: string): boolean {
  const segments = filePath.split('/');
  return segments.some((seg) => seg === '.nap');
}
```

**Design principles (from comment at line 5):** "Keep this simple -- a sequence of if/else, no abstractions."

**Why segment matching:** `isNapPath` splits on `/` and checks for an exact `.nap` segment. This prevents false positives like `.nappy`, `kidnap`, `my-nap-notes.md`. The routing-rules.test.ts has explicit edge case tests for all these (R04 tests, lines 55-75).

### 6.2 Three-Column Layout [VERIFIED]

**File:** packages/v3/src/renderer/index.tsx
**Lines:** 208-216
**What it does:** The main content area is a flex row with ContentPane, ResizeHandle, and TerminalPane.

```typescript
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <ContentPane />
          <ResizeHandle />
          <TerminalPane />
        </div>
```

**Full app structure (lines 204-218):**
```typescript
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e' }}>
      <KanbanOverlay />
      {nepics.length > 0 && <Gutter />}
      {sidebarVisible && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <ContentPane />
          <ResizeHandle />
          <TerminalPane />
        </div>
        <DebugPanel />
      </div>
    </div>
```

Layout hierarchy: `Gutter | Sidebar | (ContentPane | ResizeHandle | TerminalPane) / DebugPanel`

### 6.3 ResizeHandle Drag Mechanics [VERIFIED]

**File:** packages/v3/src/renderer/index.tsx
**Lines:** 47-104
**What it does:** A 4px-wide draggable divider between ContentPane and TerminalPane. Drag changes flex basis percentages.

```typescript
function ResizeHandle() {
  const handleRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const handle = handleRef.current;
    if (!handle) return;

    const parent = handle.parentElement;
    if (!parent) return;

    const leftPane = handle.previousElementSibling as HTMLElement;
    const rightPane = handle.nextElementSibling as HTMLElement;
    if (!leftPane || !rightPane) return;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const startX = e.clientX;
    const parentRect = parent.getBoundingClientRect();
    const leftStart = leftPane.getBoundingClientRect().width;
    const totalWidth = parentRect.width - 4; // handle width

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newLeft = Math.max(200, Math.min(totalWidth - 200, leftStart + delta));
      const leftPct = (newLeft / totalWidth) * 100;
      leftPane.style.flex = `0 0 ${leftPct}%`;
      rightPane.style.flex = `0 0 ${100 - leftPct}%`;
    };
```

**Key details:**
- **200px minimum** for each pane (line 72: `Math.max(200, Math.min(totalWidth - 200, ...)`)
- Uses `previousElementSibling`/`nextElementSibling` to find the panes -- works because ContentPane is always the previous sibling and TerminalPane is always the next sibling in the DOM
- Sets `document.body.style.userSelect = 'none'` during drag to prevent text selection
- 4px handle width with highlight on hover (`#007acc` blue)

### 6.4 Sidebar FileRow Click Flow [VERIFIED]

**File:** packages/v3/src/renderer/Sidebar.tsx
**Lines:** 89, 100-109
**What it does:** When a FileRow is clicked, the routing function determines whether to open in Monaco (left pane) or external editor (right pane/OS).

```typescript
function FileRow({
  file,
  indent,
  showControls,
}: {
  file: FileEntry;
  indent: number;
  showControls: boolean;
}) {
  const openFile = useNapStore((s) => s.openFile);

  return (
    <div
      data-testid="file-entry"
      // ...
      onClick={(e) => {
        e.stopPropagation();
        const result = route({ filePath: file.absPath });
        if (result.pane === 'left') {
          openFile(file.absPath);
        } else {
          window.electronAPI?.openFilePath(file.absPath);
        }
      }}
```

**Complete click flow for a .nap file:**
1. User clicks FileRow in Sidebar
2. `route({ filePath: file.absPath })` called (routing-rules.ts)
3. `isNapPath(file.absPath)` returns true (path contains `.nap` segment)
4. Returns `{ pane: 'left', surface: 'monaco' }`
5. `openFile(file.absPath)` called (store.ts)
6. `set({ activeFilePath: path })` updates Zustand store
7. ContentPane's `useEffect([activeFilePath])` fires
8. `fileRead(activeFilePath)` IPC to main
9. Main reads file, returns content
10. `monaco.editor.createModel(content, 'napkin-markdown')` creates model
11. `editor.setModel(model)` attaches to editor
12. `fileWatch(activeFilePath)` IPC to main starts watcher

**Complete click flow for a non-.nap file:**
1. User clicks FileRow
2. `route({ filePath: file.absPath })` returns `{ pane: 'right', surface: 'terminal' }`
3. `window.electronAPI?.openFilePath(file.absPath)` called
4. Main process: `shell.openPath(filePath)` opens in OS default app

### 6.5 AgentDot Click Flow [VERIFIED]

**File:** packages/v3/src/renderer/Sidebar.tsx
**Lines:** 40-47
**What it does:** When an agent dot is clicked, routes to terminal.

```typescript
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) {
          const result = route({ agent: { id: agent.id, started: agent.started } });
          if (result.pane === 'right') {
            setActiveTerminal(agent.id);
          }
        }
      }}
```

**Key detail:** Agent clicks ALWAYS route to right pane (the `route()` function returns `{ pane: 'right', surface: 'terminal' }` for any agent context). The `if (result.pane === 'right')` check is technically always true for agents, but the code is written defensively in case routing rules change.

---

## 7. The Type Surface

### 7.1 electronAPI Type Declaration [VERIFIED]

**File:** packages/v3/src/renderer/index.tsx
**Lines:** 16-43
**What it does:** Declares the complete type for `window.electronAPI`, keeping the renderer's view of the API in sync with what preload.ts actually exposes.

```typescript
declare global {
  interface Window {
    __napStore__: typeof useNapStore;
    electronAPI: {
      onSnapshot: (cb: (snapshot: AppSnapshot) => void) => void;
      sendIntent: (intent: unknown) => void;
      pty: {
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
        ready: (id: string) => void;
        resume: (id: string) => void;
        onData: (cb: (id: string, data: string) => void) => () => void;
        onExit: (cb: (id: string, exitCode: number) => void) => () => void;
      };
      openFilePath: (filePath: string) => void;
      saveUiState: (state: unknown) => void;
      loadUiState: () => Promise<unknown>;
      setNapkinStatus: (slug: string, status: string) => Promise<unknown>;
      switchNepic: (id: string) => Promise<unknown>;
      createNepic: (name: string) => Promise<unknown>;
      spawnSuccessor: (id: string) => Promise<{ ok?: boolean; newId?: string; error?: boolean; message?: string }>;
      fileRead: (filePath: string) => Promise<string | null>;
      fileWrite: (filePath: string, content: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      onFileChanged: (cb: (filePath: string, content: string) => void) => () => void;
      fileWatch: (filePath: string | null) => void;
    };
  }
}
```

**Why this approach:** Electron's context bridge creates a runtime API that TypeScript can't automatically type. This `declare global` block is a manual type declaration that must be kept in sync with preload.ts. If someone adds a new API to preload.ts but forgets to update this declaration, TypeScript won't see it and calls will fail with type errors.

**File content APIs in the declaration (lines 37-40):**
```typescript
      fileRead: (filePath: string) => Promise<string | null>;
      fileWrite: (filePath: string, content: string) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      onFileChanged: (cb: (filePath: string, content: string) => void) => () => void;
      fileWatch: (filePath: string | null) => void;
```

Note: `fileRead` returns `Promise<string | null>` (null if file doesn't exist). `fileWrite` returns a result object with optional `ok`/`error`/`message` fields. `onFileChanged` returns an unsubscribe function. `fileWatch` returns void (fire-and-forget).

---

## 8. TerminalPane (Companion Pane) [VERIFIED]

**File:** packages/v3/src/renderer/TerminalPane.tsx
**Lines:** 1-43
**What it does:** The right-side pane that renders the currently active terminal. Structurally mirrors ContentPane -- both are flex children of the same row.

```typescript
export function TerminalPane() {
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);

  if (!activeTerminalId) {
    return (
      <div
        data-testid="terminal-pane"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 14,
          background: '#1e1e1e',
          minWidth: 200,
        }}
      >
        no agent selected
      </div>
    );
  }

  return (
    <div
      data-testid="terminal-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
      <Terminal />
    </div>
  );
}
```

**Symmetry with ContentPane:** Both have `flex: 1`, `minWidth: 200`, and a centered placeholder text when empty ("no file open" vs "no agent selected"). Both use the same monospace font stack and gray color (`#6b7280`).

---

## 9. Test Architecture

### 9.1 Test Split: Small vs Medium [VERIFIED]

**Small tests (Vitest, `*.test.ts`):**
- `content-store.test.ts` -- Tests store logic in isolation (Zustand only, no Monaco, no Electron)
- `content-watching.test.ts` -- Tests fs.watch debounce/suppression patterns with real tmp files
- `routing-rules.test.ts` -- Tests route() function as a pure function

**Medium tests (Playwright, `*.spec.ts`):**
- `content-monaco.spec.ts` -- Tests Monaco tokenizer in a real Electron window
- `content-layout.spec.ts` -- Tests three-pane layout, resize handle, min widths
- `content-nav.spec.ts` -- Tests sidebar click routing through to Monaco/terminal
- `content-watching.spec.ts` -- Tests external file change updates in real editor

**Config:**
- Vitest: `vitest.config.ts` -- includes `tests/**/*.test.ts`
- Playwright: `playwright.config.ts` -- matches `**/*.spec.ts`, timeout 60s, 50% worker parallelism

### 9.2 Test Helper: launchApp [VERIFIED]

**File:** packages/v3/tests/helpers.ts
**Lines:** 46-58
**What it does:** Launches the Electron app for medium tests with `NAP_TEST=1` and `NAP_CWD` pointing to a temp directory.

```typescript
export async function launchApp(tmpDir: string): Promise<ElectronApplication> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nap-v3-electron-'));
  const { NAP_SOCKET: _, ...cleanEnv } = process.env;
  const app = await electron.launch({
    args: [APP_DIR, `--user-data-dir=${userDataDir}`],
    env: { ...cleanEnv, NAP_TEST: '1', NAP_CWD: tmpDir },
  });
  (app as any).__userDataDir = userDataDir;
  return app;
}
```

**Key detail:** `NAP_SOCKET` is explicitly removed from env (`const { NAP_SOCKET: _, ...cleanEnv } = process.env`) to prevent test instances from interfering with a running dev instance.

### 9.3 content-watching.test.ts Discovery Note [VERIFIED]

**File:** packages/v3/tests/content-watching.test.ts
**Lines:** 1-16
**Important finding:** The test file has a substantial comment explaining a design discovery:

```typescript
/**
 * Content file watching — small tests
 *
 * FINDING: The content file watcher is implemented inline in main.ts using
 * nodeFs.watch, NOT through MemoryFileSystem or any abstracted module.
 * The test architecture designed W01-W03 to use MemoryFileSystem.simulateChange,
 * but that path doesn't exist — the model's MemoryFileSystem watches directories
 * for structural changes, while the content watcher is a separate inline mechanism.
 *
 * These tests use real tmp files + fs.watch to verify the debounce and suppression
 * logic. They're fast (~500ms) but technically hit real filesystem.
 *
 * The fullstack engineer should consider extracting the content watcher into a
 * testable module with injectable fs (like the model uses) so true small tests
 * become possible.
 */
```

This reveals that the content watcher is intentionally NOT abstracted -- it's inline in main.ts. The tests adapted by using real filesystem operations instead of the MemoryFileSystem mock. The suggestion to extract it into a testable module is a documented future improvement.

---

## 10. Model Filesystem vs Content Filesystem [VERIFIED]

### 10.1 Two Separate Filesystem Mechanisms

**Model's filesystem (structural changes):**
- **File:** packages/v3/src/main/filesystem.ts
- Uses `NodeFileSystem.watch(dir, callback)` with `{ recursive: true }`
- Watches the entire nepic DIRECTORY for agent JSON changes, napkin status changes, etc.
- Abstracted behind `FileSystem` interface with `MemoryFileSystem` for tests

**Content pane's filesystem (file content):**
- **File:** packages/v3/src/main/main.ts (lines 222-259)
- Uses `nodeFs.watch(filePath, callback)` on a SINGLE FILE
- Watches only the currently open file for external edits
- NOT abstracted -- raw inline Node.js fs calls
- Uses `ipcMain.on('file:watch')` to switch between files

**Why they're separate:** The model watcher cares about structural changes (new files, deleted agents). The content watcher cares about text content changes to the one file the user is viewing. Different granularity, different concerns.

### 10.2 FileSystem Interface [VERIFIED]

**File:** packages/v3/src/main/filesystem.ts
**Lines:** 5-15

```typescript
export interface FileSystem {
  readdir(dir: string): Promise<string[]>;
  readJSON(filePath: string): Promise<unknown | null>;
  readFile(filePath: string): Promise<string | null>;
  isDirectory(filePath: string): Promise<boolean>;
  writeJSON(filePath: string, data: unknown): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  watch(dir: string, callback: (event: string, filename: string) => void): () => void;
}
```

The content pane does NOT use this interface. It uses raw `nodeFsPromises.readFile()` and `nodeFsPromises.writeFile()` directly (main.ts lines 201, 213).

---

## 11. Edge Cases and Surprising Findings

### 11.1 Comment-Code Mismatch in External Change Handler

**File:** packages/v3/src/renderer/ContentPane.tsx
**Line:** 146
The comment says "Use applyEdits to preserve undo stack" but `model.setValue()` is used instead. `setValue` replaces the entire buffer and clears the undo stack. This means external file changes (from agents) destroy the user's undo history.

### 11.2 Duplicated ROLE_COLORS

**Files:** packages/v3/src/renderer/napkin-markdown.ts (lines 9-15) and packages/v3/src/shared/dot-style.ts (lines 16-22)
The color values are manually synchronized. The napkin-markdown version has `user: '#22c55e'` (not in dot-style), and dot-style has `guardian: '#a855f7'` (not in napkin-markdown). If someone changes a color in one file, they must remember to change the other.

### 11.3 File Path in Breadcrumb Shows Last Two Segments

**File:** packages/v3/src/renderer/ContentPane.tsx
**Line:** 204
`activeFilePath.split('/').slice(-2).join('/')` -- For a file like `/Users/dev/project/.nap/nepics/01-v1/30-napkins/0100-explore/0100-explore.nap.md`, this shows `0100-explore/0100-explore.nap.md`. But for a file at the root of a napkin like `/foo/.nap/config.md`, it would show `.nap/config.md`.

### 11.4 Editor Container Always Mounted

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 207-215
The comment explicitly explains: "Editor container -- always mounted so useEffect can attach Monaco." The container uses `display: none` when no file is open rather than being conditionally rendered. This is because the `useEffect(() => { monaco.editor.create(...) }, [])` runs once and needs the DOM element to exist at mount time.

### 11.5 Single Model, Single Watcher

There's only ever one Monaco model at a time. When switching files, the old model is disposed and a new one is created. Similarly, only one file watcher exists at a time. This is an explicit design choice: the editor is ephemeral, not tabbed. The test N04 verifies this: "file click replaces previous file (ephemeral)."

### 11.6 suppressExternalRef Set Before Debounce, Not After

**File:** packages/v3/src/renderer/ContentPane.tsx
**Line:** 68
`suppressExternalRef.current = true` is set IMMEDIATELY when content changes, before the 1-second debounce fires. This means external changes are suppressed for the entire typing duration, not just after the save. This is intentional -- it prevents the "agent writes while user types" race from clobbering the user's uncommitted edits.

### 11.7 Error Handling in file:watch

**File:** packages/v3/src/main/main.ts
**Lines:** 255-258
Both the outer try/catch ("File may not exist yet") and the inner try/catch ("File may have been deleted") handle the case where the file disappears. The watcher silently becomes a no-op rather than crashing.

---

## 12. Bridge Types Relevant to Content Pane [VERIFIED]

**File:** packages/v3/src/shared/bridge-types.ts

### FileEntry (lines 7-12):
```typescript
export interface FileEntry {
  type: 'file';
  name: string;
  absPath: string;
  isMain?: boolean;  // true for <slug>.nap.md
}
```

### Entry (line 21):
```typescript
export type Entry = FileEntry | DirEntry;
```

### NapkinState.entries (line 72):
```typescript
  entries: Entry[];        // napkin dir files for focused/extended views
```

### AgentState.entries (line 62):
```typescript
  entries: Entry[];        // home dir files for focused/extended views
```

The `absPath` on FileEntry is what gets passed to `route()` and eventually to `openFile()`.

---

## 13. Test Patterns for Monaco [VERIFIED]

### 13.1 Waiting for Monaco to be ready (used in all medium tests):

**File:** packages/v3/tests/content-monaco.spec.ts
**Lines:** 97-108
```typescript
  // Wait for Monaco editor to mount and file to load
  await page.waitForFunction(
    () => {
      const m = (window as any).__monaco__;
      if (!m) return false;
      const editors = m.editor.getEditors();
      if (!editors || editors.length === 0) return false;
      const model = editors[0].getModel();
      return model && model.getValue().includes('Heading');
    },
    { timeout: 15000 },
  );
```

### 13.2 Testing tokenization via monaco.editor.tokenize():

**File:** packages/v3/tests/content-monaco.spec.ts
**Lines:** 133-143
```typescript
  const tokens = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const result = m.editor.tokenize('# heading text', 'napkin-markdown');
    // result is Token[][] — one array per line
    return result[0].map((t: any) => ({ offset: t.offset, type: t.type }));
  });

  // The entire line should get a 'heading' token
  const headingTokens = tokens.filter((t: any) => t.type.includes('heading'));
  expect(headingTokens.length).toBeGreaterThan(0);
```

### 13.3 Testing editor config via getRawOptions():

**File:** packages/v3/tests/content-monaco.spec.ts
**Lines:** 267-297
```typescript
  const config = await page.evaluate(() => {
    const m = (window as any).__monaco__;
    const editors = m.editor.getEditors();
    if (editors.length === 0) return null;
    const editor = editors[0];
    const opts = editor.getRawOptions();
    return {
      wordWrap: opts.wordWrap,
      minimap: opts.minimap?.enabled,
      lineNumbers: opts.lineNumbers,
      quickSuggestions: opts.quickSuggestions,
      fontSize: opts.fontSize,
    };
  });
```

**Note about quickSuggestions (line 289):** Monaco normalizes `false` to `{comments: "off", other: "off", strings: "off"}`, so the test handles both formats.

---

## 14. Ref Architecture in ContentPane [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 28-32

The component uses four refs, no regular React state:

```typescript
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const suppressExternalRef = useRef(false);
```

**Why refs instead of state:** All five values are imperative handles that should NOT trigger React re-renders when they change. The editor instance, model, timer, and suppress flag are implementation details. Only `activeFilePath` (from the store) drives re-rendering.

The only Zustand subscription is `activeFilePath` (line 27):
```typescript
  const activeFilePath = useNapStore((s) => s.activeFilePath);
```

This means the component re-renders only when the user opens a different file. All other updates (typing, saving, external changes) happen imperatively through the refs.
