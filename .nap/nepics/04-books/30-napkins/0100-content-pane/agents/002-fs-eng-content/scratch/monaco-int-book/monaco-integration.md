# Monaco Integration in nap v3

## The Problem

You have an Electron app that shows agent terminals -- AI agents running in PTY sessions, doing work. Now you want to add a reading and editing surface for `.nap` files alongside those terminals. Monaco is the obvious choice: it is VS Code's editor, it runs in the browser, it has a tokenizer engine. But Monaco is a heavyweight component. It weighs around 5MB, it spawns web workers, and it has its own imperative DOM lifecycle that does not play well with React's virtual DOM. It wants to own a `<div>` and manage everything inside it. React wants to own all the DOM.

This chapter explains how the integration works end to end: how Monaco's imperative lifecycle is reconciled with React, how file content flows between the editor, the filesystem, and external agents, and how a custom Monarch tokenizer gives `.nap` files role-colored syntax highlighting. After reading it, you should be able to modify the auto-save pipeline, add new token types, or restructure the pane layout without guessing.

---

## The Monaco Lifecycle in React

### The Core Tension

Monaco is imperative. You call `monaco.editor.create(domElement, options)` and get back an editor object. You call methods on that object -- `setModel()`, `getValue()`, `layout()`. React is declarative. You describe what the UI should look like, and React figures out the DOM mutations. These two philosophies do not naturally compose.

The standard React mistake is to put the editor instance in state or to conditionally render the container element. Both are wrong. Putting the editor in state means every `setModel()` call triggers a re-render, which triggers React to diff the DOM, which potentially interferes with Monaco's DOM ownership. Conditionally rendering the container means the `<div>` disappears and reappears, forcing you to destroy and recreate the entire editor (expensive -- hundreds of milliseconds, visible flicker).

The solution is refs. The **`ContentPane`** component ([ContentPane.tsx:26](/packages/v3/src/renderer/ContentPane.tsx#L26)) uses five refs and exactly one store subscription:

```typescript
export function ContentPane() {
  const activeFilePath = useNapStore((s) => s.activeFilePath); // Only re-render trigger

  const containerRef = useRef<HTMLDivElement>(null);                          // The DOM element Monaco owns
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null); // The editor instance
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);            // The current text model
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();   // Auto-save debounce handle
  const suppressExternalRef = useRef(false);                                  // Echo suppression flag
  // ...
}
```

The component re-renders when and only when the user opens a different file. Typing, saving, receiving external changes, resizing -- all of that happens imperatively through refs. React never knows about it, and that is the point.

### One-Time Registration

Before the editor can be created, the custom language and theme need to be registered with Monaco's global registry. This happens exactly once, gated by a module-level boolean.

**`ensureRegistered()`:** [ContentPane.tsx:8](/packages/v3/src/renderer/ContentPane.tsx#L8)

```typescript
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
  // Expose Monaco for medium tests (same pattern as window.__napStore__)
  (window as any).__monaco__ = monaco;
}
```

Why a module-level boolean instead of, say, a `useRef`? Because the flag needs to survive component unmount/remount cycles. A ref dies with the component instance. A module-level variable lives for the lifetime of the JavaScript module -- which, in this Electron app, means the lifetime of the renderer process. The `__monaco__` test exposure follows the same pattern as `window.__napStore__` (set in [index.tsx:45](/packages/v3/src/renderer/index.tsx#L45)): Playwright tests need to reach into the Monaco API via `page.evaluate()`, and there is no other way to get there.

### The Worker Setup

Monaco needs web workers for background tasks like diff computation. The traditional approach uses a webpack plugin to emit the worker files. But nap v3 uses electron-vite (Vite-based), and Vite handles this natively -- when it sees `new URL('...', import.meta.url)`, it emits the referenced file as a separate asset. No plugin needed.

**`MonacoEnvironment`:** [ContentPane.tsx:17](/packages/v3/src/renderer/ContentPane.tsx#L17)

```typescript
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    );
  },
};
```

The `_label` parameter is ignored. Monaco can spawn specialized workers for different languages (CSS, TypeScript, JSON), but napkin-markdown only needs the base editor worker -- Monarch tokenization runs synchronously in the main thread. The `{ type: 'module' }` flag loads the worker as an ES module.

The electron-vite config ([electron.vite.config.ts](/packages/v3/electron.vite.config.ts)) has no special Monaco configuration at all -- no rollup plugin, no manual asset handling. The renderer section is just `plugins: [react()]` with a root pointing at `src/renderer`. This is one of those cases where the simplest approach works if you pick the right tools.

### Editor Creation: Once, Never Destroyed

The editor is created in a `useEffect` with an empty dependency array -- it runs once on mount and the cleanup runs only on unmount.

**Editor creation `useEffect`:** [ContentPane.tsx:35](/packages/v3/src/renderer/ContentPane.tsx#L35)

```typescript
useEffect(() => {
  if (!containerRef.current) return;
  ensureRegistered();

  const editor = monaco.editor.create(containerRef.current, {
    language: 'napkin-markdown',
    theme: 'napkin-dark',
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'off',
    // ... more options
    padding: { top: 12, bottom: 12 },
  });

  editorRef.current = editor;
  // ... auto-save handler, ResizeObserver ...

  return () => {
    clearTimeout(saveTimerRef.current);
    observer.disconnect();
    editor.dispose();
    editorRef.current = null;
  };
}, []);  // Empty deps: create once
```

The editor configuration philosophy is "disable everything that makes it feel like an IDE." Minimap, line numbers, code suggestions, folding, glyph margin, overview ruler, line highlight -- all off. What remains is a clean writing surface with word wrap and comfortable padding. More like a prose editor than a code editor. The full option list is at [ContentPane.tsx:39-57](/packages/v3/src/renderer/ContentPane.tsx#L39) if you need to tweak it.

Inside this same effect, a `ResizeObserver` watches the container for size changes and calls `editor.layout()`. Monaco does not automatically resize when its container changes dimensions -- without this observer, dragging the resize handle would leave Monaco rendering at its old size with clipped content.

### The Always-Mounted Container

Here is a subtlety that matters. Look at the render output:

**Container element:** [ContentPane.tsx:207](/packages/v3/src/renderer/ContentPane.tsx#L207)

```typescript
{/* Editor container -- always mounted so useEffect can attach Monaco */}
<div
  ref={containerRef}
  style={{
    flex: 1,
    minHeight: 0,
    display: activeFilePath ? 'block' : 'none',  // Hidden, not unmounted
  }}
/>
```

When no file is open, the container is hidden with `display: 'none'`, not removed from the DOM. This is critical. The `useEffect([], [])` that creates the editor runs once and needs the DOM element to exist at that moment. If the container were conditionally rendered (`{activeFilePath && <div ref={containerRef} />}`), the ref would be null on first mount (before any file is opened), and the editor would never be created.

Meanwhile, a placeholder shows `"no file open"` in the same space, and a breadcrumb bar appears when a file is loaded, showing the last two path segments (e.g., `0100-explore/0100-explore.nap.md`).

### Model Swap on File Switch

When the user opens a different file, the editor stays put. What changes is the *model* -- Monaco's abstraction for the text buffer.

**File switch `useEffect`:** [ContentPane.tsx:92](/packages/v3/src/renderer/ContentPane.tsx#L92)

```typescript
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  if (!activeFilePath) {
    // No file -- clear model, stop watching
    if (modelRef.current) {
      modelRef.current.dispose();
      modelRef.current = null;
    }
    editor.setModel(null);
    window.electronAPI?.fileWatch(null);
    return;
  }

  (async () => {
    const content = await window.electronAPI?.fileRead(activeFilePath);
    if (content === null || content === undefined) return;

    // Dispose old model, create new
    if (modelRef.current) modelRef.current.dispose();
    const model = monaco.editor.createModel(content, 'napkin-markdown');
    modelRef.current = model;
    editor.setModel(model);

    // Start watching this file for external changes
    window.electronAPI?.fileWatch(activeFilePath);
  })();

  return () => { clearTimeout(saveTimerRef.current); };
}, [activeFilePath]);
```

Three things happen atomically on file switch:
1. The old model is disposed (prevents memory leaks -- Monaco models are not garbage-collected).
2. A new model is created from the file content and attached to the editor.
3. The main process is told to watch the new file (and implicitly stop watching the old one).

The cleanup function clears the save timer -- preventing a save from firing for the OLD file after you have already switched to a new one. There is only ever one model, one watcher. The editor is ephemeral, not tabbed.

---

## The File Content Pipeline

### What Happens When You Type

The auto-save pipeline is a chain of three independent debounce timers. Understanding this chain is understanding the entire content pipeline.

**Auto-save handler:** [ContentPane.tsx:63](/packages/v3/src/renderer/ContentPane.tsx#L63)

```typescript
editor.onDidChangeModelContent(() => {
  clearTimeout(saveTimerRef.current);
  const filePath = useNapStore.getState().activeFilePath;
  if (!filePath) return;

  suppressExternalRef.current = true;                    // Immediately suppress external changes
  saveTimerRef.current = setTimeout(async () => {
    const content = editor.getValue();
    await window.electronAPI?.fileWrite(filePath, content);
    // Keep suppress active briefly for watcher echo
    setTimeout(() => { suppressExternalRef.current = false; }, 500);
  }, 1000);                                              // 1s debounce before write
});
```

Notice: `suppressExternalRef.current = true` is set *immediately* on every keystroke, before the 1-second debounce fires. This is deliberate. If an agent writes to the same file while the user is typing (between keystrokes, before the save), the external change would be ignored. The user's uncommitted edits are protected. The suppress flag stays true until 500ms after the write completes.

Here is the full timeline for a user edit:

```
t=0       User types
          suppressExternalRef = true (immediate)
          debounce timer reset to 1000ms

t=1000    Debounce fires
          editor.getValue() → fileWrite IPC to main

t=1000    Main process:
          pendingContentWrites.add(path)
          writeFile(path, content)

t=~1050   fs.watch fires in main (macOS kqueue, ~50ms)
          pendingContentWrites.has(path) → true → SUPPRESSED at main layer

t=1300    Main: pendingContentWrites.delete(path) (300ms echo window)

t=1500    Renderer: suppressExternalRef = false (500ms after write)
          System ready for external changes again
```

### The Four IPC Channels

The content pipeline uses four IPC channels between renderer and main, each with a different communication pattern:

| Channel | Direction | Pattern | Purpose |
|---------|-----------|---------|---------|
| `file:read` | renderer -> main | `invoke` (request/response) | Read file content |
| `file:write` | renderer -> main | `invoke` (request/response) | Write file content |
| `file:watch` | renderer -> main | `send` (fire-and-forget) | Start/stop watching a file |
| `file:changed` | main -> renderer | `on` (event stream) | Notify renderer of external changes |

These are defined in the preload script ([preload.ts:70](/packages/v3/src/main/preload.ts#L70)):

```typescript
fileRead: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
fileWrite: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
onFileChanged: (cb: (filePath: string, content: string) => void) => {
  const handler = (_event: IpcRendererEvent, filePath: string, content: string) =>
    cb(filePath, content);
  ipcRenderer.on('file:changed', handler);
  return () => ipcRenderer.removeListener('file:changed', handler);  // Unsubscribe function
},
fileWatch: (filePath: string | null) => ipcRenderer.send('file:watch', filePath),
```

`fileRead` and `fileWrite` use `invoke` because the caller needs a response (the content, or an ok/error). `fileWatch` uses `send` because the renderer does not care about a response -- it is a command, not a query. `onFileChanged` returns an unsubscribe function, following the same pattern as `pty.onData` and `pty.onExit`.

### What Happens When an Agent Edits the File

The other direction. An AI agent writes to a `.nap` file that the user is currently viewing.

**Main process watcher:** [main.ts:223](/packages/v3/src/main/main.ts#L223)

```typescript
let contentWatcher: (() => void) | null = null;
let contentDebounceTimer: ReturnType<typeof setTimeout> | undefined;

ipcMain.on('file:watch', (_event, filePath: string | null) => {
  // Clean up previous watcher
  if (contentWatcher) { contentWatcher(); contentWatcher = null; }
  clearTimeout(contentDebounceTimer);

  if (!filePath) return;

  try {
    const watcher = nodeFs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      if (pendingContentWrites.has(filePath)) return; // Echo suppression (main layer)

      clearTimeout(contentDebounceTimer);
      contentDebounceTimer = setTimeout(async () => {
        const content = await nodeFsPromises.readFile(filePath, 'utf-8');
        if (!win.isDestroyed()) {
          win.webContents.send('file:changed', filePath, content);
        }
      }, 200);  // 200ms debounce: coalesce rapid agent writes
    });
    contentWatcher = () => watcher.close();
  } catch {
    // File may not exist yet
  }
});
```

**Renderer handler:** [ContentPane.tsx:132](/packages/v3/src/renderer/ContentPane.tsx#L132)

```typescript
useEffect(() => {
  if (!window.electronAPI?.onFileChanged) return;

  const unsub = window.electronAPI.onFileChanged((filePath, content) => {
    if (suppressExternalRef.current) return;           // Guard 1: our own echo
    if (filePath !== useNapStore.getState().activeFilePath) return; // Guard 2: wrong file

    const model = modelRef.current;
    if (!model) return;

    const editor = editorRef.current;
    const position = editor?.getPosition();      // Save cursor
    const scrollTop = editor?.getScrollTop();    // Save scroll

    model.setValue(content);                     // Replace buffer

    if (editor && position) editor.setPosition(position);     // Restore cursor
    if (editor && scrollTop !== undefined) editor.setScrollTop(scrollTop); // Restore scroll
  });

  return unsub;
}, []);
```

The external change timeline:

```
t=0       Agent writes file
t=~50     fs.watch fires (macOS kqueue, eventType: 'change')
          pendingContentWrites check → NOT in set → proceed
          contentDebounceTimer set for 200ms

t=~250    Debounce fires → readFile → send 'file:changed' IPC to renderer

t=~250    Renderer receives event
          suppressExternalRef check → false → proceed
          Save cursor position and scroll offset
          model.setValue(content) — replaces entire buffer
          Restore cursor and scroll
```

Note: there is a comment/code mismatch at line 146 -- the comment says "Use applyEdits to preserve undo stack" but the code uses `model.setValue()`, which replaces the entire undo stack. This means an external agent edit destroys the user's undo history. A future improvement would use `model.applyEdits()` with a computed diff, but that is more complex.

### Two-Layer Echo Suppression

Why does echo suppression exist in TWO places -- main process AND renderer?

Because timing is unpredictable. The `fs.watch` callback, the IPC message delivery, and JavaScript timer resolution all have variable latency. Consider the failure modes:

- **Without the main layer (`pendingContentWrites`):** The watcher fires ~50ms after the write, reads the file, and sends the content via IPC. The renderer gets a `file:changed` event for content it just wrote. If `suppressExternalRef` has already been cleared (timer fired early), the editor clobbers itself.

- **Without the renderer layer (`suppressExternalRef`):** The main layer's 300ms window might expire before the IPC message arrives (network/process scheduler jitter). Or the user might still be typing when the echo arrives -- the main layer only suppresses if there is a pending write, but the user's NEW keystrokes after the write are not "pending."

Two layers, two timescales, independent checks. The main layer is a 300ms window after each write. The renderer layer is a flag that covers the entire typing session plus 500ms after the write. Together they handle the full range of timing scenarios.

### This Watcher is Not That Watcher

An important distinction: the content watcher described above is completely separate from the model's directory watcher. The model uses `NodeFileSystem.watch(dir, callback)` with `{ recursive: true }` ([filesystem.ts](/packages/v3/src/main/filesystem.ts)) to watch the entire nepic directory for structural changes -- new agents, changed napkin status, deleted files. That watcher is abstracted behind a `FileSystem` interface with a `MemoryFileSystem` for tests.

The content watcher uses raw `nodeFs.watch(filePath)` on a single file, inline in `main.ts`. It is not abstracted. It uses `nodeFsPromises.readFile()` and `writeFile()` directly, not the `FileSystem` interface. Different granularity (one file vs. a directory tree), different concerns (text content vs. directory structure), different mechanisms.

---

## The Monarch Tokenizer

### How Monarch Works

Monarch is Monaco's built-in tokenizer engine. It is a state machine driven by regex rules evaluated top-to-bottom within each state. You define states, each containing an ordered list of `[regex, token, nextState?]` rules. When Monarch processes a line, it tries each rule in order until one matches. The match consumes characters, emits a token, and optionally transitions to another state. Then it starts again from the current position.

Rule order IS the logic. If two rules can match the same text, whichever comes first wins. This is not a bug -- it is the fundamental design principle.

### The Full Tokenizer

**`registerNapkinMarkdown()`:** [napkin-markdown.ts:22](/packages/v3/src/renderer/napkin-markdown.ts#L22)

```typescript
monaco.languages.setMonarchTokensProvider('napkin-markdown', {
  tokenizer: {
    root: [
      // Headings: # at line start
      [/^#{1,6}\s.*$/, 'heading'],

      // Role-prefixed comments -- MUST come before generic //
      [/\/\/A:.*$/, 'comment.architect'],    // Architect (blue)
      [/\/\/DU:.*$/, 'comment.user'],        // User/Dima (green)
      [/\/\/FS:.*$/, 'comment.fs-eng'],      // Fullstack engineer (green)
      [/\/\/TA:.*$/, 'comment.test-arch'],   // Test architect (orange)
      [/\/\/TE:.*$/, 'comment.test-eng'],    // Test engineer (gray)

      // Generic comment -- catches any // not matched above
      [/\/\/.*$/, 'comment'],

      // Bold: **text** -- pushes into @bold state
      [/\*\*/, 'bold.marker', '@bold'],

      // Inline code: `text`
      [/`[^`]+`/, 'inline-code'],

      // Bullet marker: * at line start
      [/^(\s*\*)(\s)/, ['bullet.marker', 'white']],

      // Everything else
      [/./, 'source'],
    ],

    bold: [
      [/\*\*/, 'bold.marker', '@pop'],  // Closing ** -- pop back to root
      [/[^*]+/, 'bold'],                // Non-asterisk content
      [/\*/, 'bold'],                   // Single * inside bold (not a closing **)
    ],
  },
});
```

### Why Rule Order Matters

The five role-prefixed comment rules (`//A:`, `//DU:`, `//FS:`, `//TA:`, `//TE:`) MUST come before the generic `//` comment rule. Monarch evaluates top-to-bottom. If `//.*$` came first, it would match `//A: some annotation` as a plain comment, and the role-specific rules would never fire. The source file has a comment at line 4 documenting this constraint explicitly: "Role-prefixed comment rules MUST come before generic //."

Each role gets its own token type (`comment.architect`, `comment.user`, etc.), which maps to a unique color in the theme. This means agent annotations in napkin files are visually distinguishable by role at a glance -- the architect's comments are blue, the test architect's are orange, and so on.

### The `@bold` State Machine

The `bold` state is the cleanest example of how Monarch states work. It solves a problem that single-rule matching cannot: `**bold text**` spans multiple tokens, and Monarch cannot match across tokens in a single rule.

When `**` is encountered in the root state, the rule `[/\*\*/, 'bold.marker', '@bold']` does three things: consumes the `**`, emits a `bold.marker` token (gray in the theme), and pushes the `@bold` state onto the state stack. Now Monarch is in the `bold` state. Inside bold:

- `[/\*\*/, 'bold.marker', '@pop']` -- a closing `**` pops back to root.
- `[/[^*]+/, 'bold']` -- runs of non-asterisk characters get the `bold` token (bold font style).
- `[/\*/, 'bold']` -- a single `*` inside bold text. Without this rule, a lone asterisk would be unmatched, potentially causing tokenizer errors or falling through to unexpected behavior.

### The Theme and the `.slice(1)` Trick

**Theme definition:** [napkin-markdown.ts:59](/packages/v3/src/renderer/napkin-markdown.ts#L59)

```typescript
const ROLE_COLORS = {
  architect: '#3b82f6',   // blue
  user: '#22c55e',        // green
  'fs-eng': '#22c55e',    // green
  'test-arch': '#f59e0b', // orange
  'test-eng': '#6b7280',  // gray
};

const COMMENT_COLOR = '#6A9955'; // VS Code's default comment color

monaco.editor.defineTheme('napkin-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'heading', foreground: 'e5e5e5', fontStyle: 'bold' },
    { token: 'comment', foreground: COMMENT_COLOR.slice(1) },
    { token: 'comment.architect', foreground: ROLE_COLORS.architect.slice(1) },
    // ... one rule per role
    { token: 'source', foreground: 'd4d4d4' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
  },
});
```

The `.slice(1)` strips the leading `#` from hex color strings. Monaco's `foreground` field expects bare hex (`3b82f6`), not CSS hex (`#3b82f6`). The colors are stored with the hash so they are valid CSS elsewhere, and stripped at the Monaco boundary.

**Maintenance hazard:** These `ROLE_COLORS` are duplicated from `dot-style.ts` ([dot-style.ts:16](/packages/v3/src/shared/dot-style.ts#L16)), not imported. The two copies have drifted -- `napkin-markdown.ts` has a `user` entry that `dot-style.ts` does not, and `dot-style.ts` has a `guardian` entry that `napkin-markdown.ts` does not. If colors change, both files must be updated manually. This is a known hazard, documented here rather than hidden.

---

## Layout and Routing

### The Three-Column Layout

The main content area is a flex row with three children: **`ContentPane`**, **`ResizeHandle`**, and **`TerminalPane`**.

**Layout structure:** [index.tsx:209](/packages/v3/src/renderer/index.tsx#L209)

```typescript
<div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
  <ContentPane />
  <ResizeHandle />
  <TerminalPane />
</div>
```

Both panes have `flex: 1` and `minWidth: 200`. Both show a centered placeholder when empty (`"no file open"` vs `"no agent selected"`). Both use the same monospace font stack and gray color (`#6b7280`). This visual symmetry is intentional -- the two panes are peers, not primary/secondary.

### ResizeHandle Mechanics

The resize handle is a 4px-wide `<div>` that turns blue on hover and supports mouse drag to resize panes.

**`ResizeHandle`:** [index.tsx:47](/packages/v3/src/renderer/index.tsx#L47)

```typescript
function ResizeHandle() {
  const handleRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // ...
    const leftPane = handle.previousElementSibling as HTMLElement;   // ContentPane
    const rightPane = handle.nextElementSibling as HTMLElement;      // TerminalPane

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';                        // Prevent text selection during drag

    const totalWidth = parentRect.width - 4;                        // Subtract handle width

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newLeft = Math.max(200, Math.min(totalWidth - 200, leftStart + delta)); // 200px min each
      const leftPct = (newLeft / totalWidth) * 100;
      leftPane.style.flex = `0 0 ${leftPct}%`;
      rightPane.style.flex = `0 0 ${100 - leftPct}%`;
    };
    // ...
  }, []);

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      style={{ width: 4, cursor: 'col-resize', flexShrink: 0, background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#007acc')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    />
  );
}
```

Key details:
- Each pane has a 200px minimum width (`Math.max(200, Math.min(totalWidth - 200, ...))`).
- The handle uses `previousElementSibling` / `nextElementSibling` to find the panes it controls -- no refs or IDs needed, because the DOM order is fixed.
- During drag, `document.body.style.userSelect = 'none'` prevents the browser from selecting text as the mouse moves.
- The resize directly mutates `style.flex` on the DOM elements. This is another case of bypassing React's declarative model for performance -- re-rendering both panes on every mousemove pixel would be noticeably janky.
- The ResizeObserver inside ContentPane's creation effect picks up these size changes and calls `editor.layout()`.

### The Routing Decision

When the user clicks something in the sidebar, the pure function **`route()`** ([routing-rules.ts:26](/packages/v3/src/renderer/routing-rules.ts#L26)) decides where to send it:

```typescript
export function route(ctx: ClickContext): RouteResult {
  if (ctx.agent) {
    return { pane: 'right', surface: 'terminal' };
  }
  if (ctx.filePath && isNapPath(ctx.filePath)) {
    return { pane: 'left', surface: 'monaco' };
  }
  return { pane: 'right', surface: 'terminal' };
}

function isNapPath(filePath: string): boolean {
  const segments = filePath.split('/');
  return segments.some((seg) => seg === '.nap');
}
```

`isNapPath` splits on `/` and checks for an exact `.nap` segment. This prevents false positives: `kidnapper.txt`, `.nappy`, and `my-nap-notes.md` all correctly return false. Only paths with `.nap` as an actual directory component (like `/project/.nap/nepics/01/file.md`) route to Monaco. The routing-rules tests have explicit edge cases for all of these.

The file at [routing-rules.ts](/packages/v3/src/renderer/routing-rules.ts) imports nothing from React or the store. It is a pure function -- easy to test, easy to reason about, easy to extend. The source file's own comment says it: "Keep this simple -- a sequence of if/else, no abstractions."

### The electronAPI Type Declaration

Electron's context bridge creates a runtime API that TypeScript cannot automatically discover. The renderer declares what it expects to find on `window.electronAPI` via a `declare global` block.

**Type declaration:** [index.tsx:16](/packages/v3/src/renderer/index.tsx#L16)

```typescript
declare global {
  interface Window {
    __napStore__: typeof useNapStore;
    electronAPI: {
      // ... PTY APIs, snapshot APIs ...
      fileRead: (filePath: string) => Promise<string | null>;
      fileWrite: (filePath: string, content: string) =>
        Promise<{ ok?: boolean; error?: boolean; message?: string }>;
      onFileChanged: (cb: (filePath: string, content: string) => void) => () => void;
      fileWatch: (filePath: string | null) => void;
    };
  }
}
```

This is a manual type declaration that MUST be kept in sync with `preload.ts`. If someone adds a new IPC channel to `preload.ts` but forgets to update this declaration, TypeScript will not see the new API and calls will get type errors. If someone changes a return type in preload but not here, the renderer code will compile against the wrong types and fail at runtime. It is the kind of thing that begs for code generation, but at the current scale, manual sync is fine.

---

## Two Flows, End to End

Now that you understand each piece, here is how they compose.

### The Read Flow

User clicks a `.nap` file in the sidebar:

```
Sidebar FileRow click
  → route({ filePath: file.absPath })           [routing-rules.ts]
  → returns { pane: 'left', surface: 'monaco' }
  → store.openFile(file.absPath)                 [store.ts]
  → set({ activeFilePath: path })

ContentPane re-renders (activeFilePath changed)
  → useEffect([activeFilePath]) fires            [ContentPane.tsx:92]
  → fileRead(activeFilePath) IPC to main
  → main: readFile(path, 'utf-8')               [main.ts:199]
  → returns content string

  → dispose old model
  → monaco.editor.createModel(content, 'napkin-markdown')
  → editor.setModel(model)

  → fileWatch(activeFilePath) IPC to main
  → main: close old watcher, open new fs.watch   [main.ts:227]
```

### The Write Flow

User types in the editor:

```
Keystroke
  → onDidChangeModelContent fires                [ContentPane.tsx:63]
  → suppressExternalRef = true
  → clear previous debounce timer
  → set new 1000ms debounce timer

1000ms later:
  → editor.getValue()
  → fileWrite(path, content) IPC to main
  → main: pendingContentWrites.add(path)         [main.ts:212]
  → main: writeFile(path, content)
  → main: setTimeout 300ms → remove from set

500ms after write completes:
  → suppressExternalRef = false                   [ContentPane.tsx:73]
```

### The External Update Flow

An agent writes to the file the user is viewing:

```
Agent writes file on disk

~50ms later:
  → fs.watch callback fires in main              [main.ts:239]
  → eventType === 'change' → proceed
  → pendingContentWrites.has(path) → false → proceed
  → set 200ms debounce timer

200ms later:
  → readFile(path, 'utf-8')
  → win.webContents.send('file:changed', path, content)

Renderer receives event:
  → onFileChanged callback fires                  [ContentPane.tsx:134]
  → suppressExternalRef → false → proceed
  → filePath === activeFilePath → proceed
  → save cursor position and scroll offset
  → model.setValue(content)
  → restore cursor and scroll
```

---

## Key Takeaways

**Refs are the bridge between imperative and declarative worlds.** Five refs, one store subscription. Monaco lives entirely in ref-land. React re-renders only when `activeFilePath` changes. Everything else is imperatively managed. This is not a hack -- it is the correct pattern for integrating any imperative library (canvas, WebGL, xterm.js) into React.

**The always-mounted container is load-bearing.** `display: 'none'` instead of conditional rendering is not laziness. It is the only way to guarantee the DOM element exists when the creation `useEffect` runs. Understand this and you will never accidentally break the editor by "cleaning up" the JSX.

**Echo suppression needs two layers because timing is unknowable.** Main process and renderer process each have their own suppression mechanism, covering different failure modes. If you are tempted to "simplify" this to a single layer, think carefully about what happens when the IPC message arrives 400ms late.

**Three independent debounce timers form a pipeline.** 1000ms (renderer auto-save), 300ms (main echo window), 200ms (main watcher coalesce), 500ms (renderer suppress tail). They are not redundant -- each solves a different timing problem at a different point in the pipeline.

**Monarch rule order is the logic.** Role-prefixed comment rules before generic `//`. If you add a new token type that overlaps with existing patterns, put the more specific rule first. The `@bold` state machine shows how to handle multi-token constructs.

**The content watcher is deliberately not abstracted.** It is raw `nodeFs.watch()` inline in `main.ts`, separate from the model's `FileSystem` interface. Two watchers, two concerns: one file for content, one directory for structure. If you need to make the content watcher testable with injected fs, that is a documented future improvement -- but it works fine as-is.

**The routing function is pure and segment-based.** No React imports, no store access. `isNapPath()` splits on `/` and checks for an exact `.nap` segment. Substring matching would produce false positives. When you add new routing rules, add them as new `if` branches -- do not introduce abstractions.
