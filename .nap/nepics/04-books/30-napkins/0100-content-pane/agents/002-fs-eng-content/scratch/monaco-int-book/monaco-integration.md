# Monaco Integration in nap v3

## The Problem

You have an Electron app running AI agents in PTY sessions. Now you want to add two editing surfaces -- a read-write napkin editor on the left, a read-only code viewer on the right -- plus five themes, a git gutter, link routing between panes, rendered markdown preview, shift-enter continuation, and tabs with ephemeral/pinned semantics. All of this has to coexist without re-rendering the world on every keystroke.

Monaco is the obvious choice for both editors. But Monaco is a heavyweight imperative component that spawns web workers and wants to own its DOM. React wants to own all the DOM. And now you are asking for TWO Monaco instances in the same window, each with different configurations, different lifecycles, and different filesystem watchers feeding them. The integration problem is not "make Monaco work in React" -- it is "make two Monaco editors, five themes, a link router, and a file-watching pipeline all coexist in a React component tree without any of them stepping on each other."

This chapter explains how that works end to end.

---

## The Monaco Lifecycle in React

### The Core Tension

Monaco is imperative. You call `monaco.editor.create(domElement, options)` and get back an editor object. You call methods on that object -- `setModel()`, `getValue()`, `layout()`. React is declarative. You describe what the UI should look like, and React figures out the DOM mutations.

The standard React mistake is to put the editor instance in state or to conditionally render the container. Both are wrong. Putting the editor in state means every `setModel()` call triggers a re-render, which interferes with Monaco's DOM ownership. Conditionally rendering the container means the `<div>` disappears and reappears, forcing you to destroy and recreate the entire editor (hundreds of milliseconds, visible flicker).

The solution is refs. The **`ContentPane`** component ([ContentPane.tsx:37](/packages/v3/src/renderer/ContentPane.tsx#L37)) uses nine refs and four store subscriptions:

```typescript
export function ContentPane() {
  // ── Store subscriptions — the ONLY things that trigger re-renders ──
  const activeFilePath = useNapStore((s) => s.activeFilePath);
  const leftTabs = useNapStore((s) => s.leftTabs);
  const activeLeftTabId = useNapStore((s) => s.activeLeftTabId);
  const leftPaneRenderMode = useNapStore((s) => s.leftPaneRenderMode);

  // ── Refs — imperative state that never triggers re-renders ──
  const containerRef = useRef<HTMLDivElement>(null);                          // DOM element Monaco owns
  const renderedRef = useRef<HTMLDivElement>(null);                           // Rendered markdown overlay
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null); // Editor instance
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);            // Current text model
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();   // Auto-save debounce
  const suppressExternalRef = useRef(false);                                  // Echo suppression flag
  const gutterDecorationsRef = useRef<string[]>([]);                         // Git gutter decoration IDs
  const shiftEnterDisposableRef = useRef<monaco.IDisposable | null>(null);   // Shift-enter keybinding handle
  const gutterTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(); // Git gutter refresh debounce
  const focusGutterTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(); // Focus-triggered gutter
}
```

The ratio is 9:4. Nine imperative handles, four reactive subscriptions. That ratio tells you where the complexity lives. Typing, saving, receiving external changes, refreshing git gutter decorations, applying link clicks -- all of it happens imperatively through refs. React re-renders when the user opens a different file, switches tabs, or toggles rendered mode. Everything else, React never knows about. That is the point.

### One-Time Registration

Before the editor can be created, the custom language, themes, and initial theme need to be registered with Monaco's global registries. This happens exactly once, gated by a module-level boolean.

**`ensureRegistered()`:** [ContentPane.tsx:15](/packages/v3/src/renderer/ContentPane.tsx#L15)

```typescript
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();                              // Monarch tokenizer for napkin-markdown
  registerThemes();                                      // All 5 themes: defineTheme() for each
  const themeName = useNapStore.getState().currentThemeName;
  applyTheme(findTheme(themeName));                      // Apply persisted theme BEFORE editor creation
  (window as any).__monaco__ = monaco;                   // Expose for Playwright medium tests
}
```

Why a module-level boolean instead of a `useRef`? Because the flag needs to survive component unmount/remount cycles. A ref dies with the component instance. A module-level variable lives for the lifetime of the renderer process.

Notice the theme is applied before the editor is created. This matters because Monaco reads the current theme name during `create()`. If you create the editor first and apply the theme second, there is a visible flash of the wrong theme on first render.

### The Worker Setup

Monaco needs web workers for background tasks like diff computation. nap v3 uses electron-vite (Vite-based), and Vite handles worker bundling natively -- when it sees `new URL('...', import.meta.url)`, it emits the referenced file as a separate asset. No plugin needed.

**`MonacoEnvironment`:** [ContentPane.tsx:28](/packages/v3/src/renderer/ContentPane.tsx#L28)

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

The `_label` parameter is ignored. Monaco can spawn specialized workers for CSS, TypeScript, JSON, but napkin-markdown only needs the base editor worker -- Monarch tokenization runs synchronously in the main thread. The electron-vite config ([electron.vite.config.ts](/packages/v3/electron.vite.config.ts)) has no special Monaco configuration. The renderer section is just `plugins: [react()]`. This is one of those cases where the simplest approach works if you pick the right tools.

### Editor Creation: Once, Model Swap on Switch

The editor is created in a `useEffect` with an empty dependency array. It runs once on mount and the cleanup runs only on unmount. The editor instance lives for the lifetime of the component.

**Editor creation:** [ContentPane.tsx:54](/packages/v3/src/renderer/ContentPane.tsx#L54)

```typescript
useEffect(() => {
  if (!containerRef.current) return;
  ensureRegistered();

  const editor = monaco.editor.create(containerRef.current, {
    language: 'napkin-markdown',
    theme: useNapStore.getState().currentThemeName,
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'off',           // Napkin is prose, not code
    quickSuggestions: false,       // No autocomplete popups
    folding: false,                // No code folding
    glyphMargin: true,             // Needed for git gutter decorations
    lineDecorationsWidth: 8,       // Space for the gutter stripe
    padding: { top: 12, bottom: 12 },
    // ... more options suppressed
  });

  editorRef.current = editor;
  shiftEnterDisposableRef.current = registerShiftEnter(editor); // Shift-enter continuation

  // Focus-triggered git gutter refresh
  editor.onDidFocusEditorText(() => {
    clearTimeout(focusGutterTimerRef.current);
    focusGutterTimerRef.current = setTimeout(() => {
      const filePath = useNapStore.getState().activeFilePath;
      if (filePath) refreshGitGutter(filePath);
    }, 300);
  });

  // ... auto-save handler, ResizeObserver ...
}, []);
```

The configuration disables everything that makes it feel like an IDE: minimap, line numbers, code suggestions, folding, overview ruler, line highlight. But `glyphMargin: true` is on -- it provides the gutter column where git decorations (added/modified/deleted) appear as colored stripes.

Inside this same effect, a `ResizeObserver` watches the container and calls `editor.layout()`. Monaco does not automatically resize when its container changes. Without the observer, dragging the resize handle would leave Monaco rendering at its old dimensions.

### The Always-Mounted Container (Now With a Double Role)

The editor container is ALWAYS in the DOM, hidden with `display: 'none'` when not visible. It serves double duty: hidden when no file is open, AND hidden when rendered mode is active.

**Container element:** [ContentPane.tsx:419](/packages/v3/src/renderer/ContentPane.tsx#L419)

```typescript
{/* Editor -- always mounted, hidden in rendered mode */}
<div ref={containerRef} style={{
  flex: 1,
  display: activeFilePath && leftPaneRenderMode === 'edit' ? 'block' : 'none',
}} />
{/* Rendered view -- visible only in rendered mode */}
{activeFilePath && leftPaneRenderMode === 'rendered' && (
  <div ref={renderedRef} data-testid="rendered-view" className="nap-rendered"
       onClick={handleRenderedClick} style={{ /* ... */ }} />
)}
```

The editor container is `display: 'none'` in two cases: no file open, or rendered mode active. The rendered view is conditionally rendered (mounts/unmounts). This asymmetry is deliberate: the editor must always exist in the DOM because the creation `useEffect` needs the element at mount time. The rendered view has no such constraint -- it is just an HTML div.

---

## Two Editors, Two Purposes

This is the key architectural insight that is easy to miss: nap v3 has TWO Monaco editor instances, and they are configured for fundamentally different purposes.

### The Left Pane: A Writing Surface

The left pane editor in **`ContentPane`** ([ContentPane.tsx:58](/packages/v3/src/renderer/ContentPane.tsx#L58)) is configured for napkin authoring:

```typescript
const editor = monaco.editor.create(containerRef.current, {
  language: 'napkin-markdown',   // Custom Monarch tokenizer
  theme: useNapStore.getState().currentThemeName,
  wordWrap: 'on',               // Prose wraps
  lineNumbers: 'off',           // No line numbers -- it's not code
  quickSuggestions: false,       // No autocomplete
  folding: false,                // No folding
  glyphMargin: true,             // For git gutter
  lineDecorationsWidth: 8,       // Gutter stripe width
  padding: { top: 12, bottom: 12 },
  tabSize: 2,
  insertSpaces: true,
  // readOnly: (not set -- defaults to false)
});
```

### The Right Pane: A Code Viewer

The right pane editor in **`CodeEditor`** ([TerminalPane.tsx:65](/packages/v3/src/renderer/TerminalPane.tsx#L65)) is configured for code reading:

```typescript
const editor = monaco.editor.create(containerRef.current, {
  readOnly: true,                // Can't edit -- it's a viewer
  theme: useNapStore.getState().currentThemeName,
  lineNumbers: 'on',            // Code needs line numbers
  folding: true,                 // Code has structure worth folding
  glyphMargin: true,             // Same gutter capability
  minimap: { enabled: false },
  padding: { top: 8, bottom: 8 }, // Less breathing room (8 vs 12)
  // wordWrap: (not set -- defaults to off)
  // language: (set dynamically per file)
});
```

The contrast is the design. The left pane disables everything that says "IDE" and enables everything that says "writing tool." The right pane enables structure (line numbers, folding) because code is structured, and is read-only because you are following a link to LOOK at something, not to edit it.

### Language Detection and Line Highlight

The right pane auto-detects language from file extension via **`detectLanguage()`** ([TerminalPane.tsx:9](/packages/v3/src/renderer/TerminalPane.tsx#L9)) -- a 30-entry extension map covering TypeScript, Python, Rust, Go, and more, falling back to `'plaintext'`.

When the store's `openCode()` action includes a line number, the **`CodeEditor`** file-load effect ([TerminalPane.tsx:108](/packages/v3/src/renderer/TerminalPane.tsx#L108)) does two things: scrolls to center that line, and applies a yellow highlight decoration that fades out over 1.5 seconds:

```typescript
if (rightFileLine) {
  editor.revealLineInCenter(rightFileLine);
  decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
    {
      range: new monaco.Range(rightFileLine, 1, rightFileLine, 1),
      options: { isWholeLine: true, className: 'nap-line-highlight' },
    },
  ]);
  // Remove decoration after animation completes
  setTimeout(() => {
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  }, 1600); // Slightly longer than the 1.5s CSS animation
}
```

The CSS animation is injected once via **`ensureCss()`** ([TerminalPane.tsx:25](/packages/v3/src/renderer/TerminalPane.tsx#L25)) -- a module-level function that creates a `<style>` element containing the `nap-line-fade` keyframes plus the git gutter CSS classes. Same `let injected = false` guard pattern as `ensureRegistered()`.

### The Terminal Stays Alive

The **`TerminalPane`** layout ([TerminalPane.tsx:187](/packages/v3/src/renderer/TerminalPane.tsx#L187)) switches between terminal and code view. But the terminal is hidden via `display: 'none'`, while the CodeEditor is conditionally rendered:

```typescript
{/* Terminal -- keep alive but hidden when code is active */}
<div style={{
  display: rightPaneMode === 'terminal' && activeTerminalId ? 'flex' : 'none',
}}>
  {activeTerminalId && <Terminal />}
</div>
{/* Code -- mount/unmount on mode switch */}
{rightPaneMode === 'code' && rightFilePath && <CodeEditor />}
```

Same asymmetry as the left pane's editor/rendered toggle. Terminal uses `display: 'none'` because xterm.js has its own imperative state (scroll buffer, cursor position) that would be lost on unmount. CodeEditor mounts fresh each time because it is a viewer -- there is no state to preserve.

### The Sentinel Terminal Tab

How does the tab bar handle one terminal that updates in-place? The store uses a sentinel ID pattern. **`TERMINAL_TAB_ID`** ([store.ts:7](/packages/v3/src/renderer/store.ts#L7)) is `'__terminal__'`. When you switch agents, the terminal tab is UPDATED (path and title change), not replaced. There is always exactly zero or one terminal tab, and it can never be closed:

```typescript
// In closeTab() — store.ts line 298
if (tab?.id === TERMINAL_TAB_ID) return; // Can never be closed
```

This is tested explicitly in `terminal-tab-refactor.test.ts` (TT-04).

---

## The File Content Pipeline

### What Happens When You Type

The auto-save pipeline is a chain of debounce timers with echo suppression. Understanding this chain is understanding the entire content pipeline.

**Auto-save handler:** [ContentPane.tsx:96](/packages/v3/src/renderer/ContentPane.tsx#L96)

```typescript
editor.onDidChangeModelContent(() => {
  clearTimeout(saveTimerRef.current);
  const filePath = useNapStore.getState().activeFilePath;
  if (!filePath) return;

  useNapStore.getState().pinActiveEphemeral('left');    // First edit auto-pins ephemeral tab
  suppressExternalRef.current = true;                    // Immediately suppress external changes
  saveTimerRef.current = setTimeout(async () => {
    const content = editor.getValue();
    await window.electronAPI?.fileWrite(filePath, content);
    setTimeout(() => { suppressExternalRef.current = false; }, 500); // 500ms suppress tail
    refreshGitGutter(filePath);                          // Git diff after save
  }, 1000);                                              // 1s debounce before write
});
```

Three things to notice. First, `pinActiveEphemeral('left')` -- typing auto-pins the ephemeral tab. This matches VS Code's behavior where previewing a file keeps it ephemeral, but editing it commits the tab. Second, `suppressExternalRef` is set immediately on every keystroke, before the 1-second debounce fires. If an agent writes to the same file while the user is typing, the external change is ignored -- the user's uncommitted edits are protected. Third, `refreshGitGutter` is called after the write completes, updating the gutter decorations to reflect the new diff state.

### The Git Gutter and the Model Identity Guard

After every save, the git gutter needs to refresh. But the refresh is async -- it involves an IPC round trip to the main process which shells out to `git diff`. What if the user switches tabs during that round trip?

**`refreshGitGutter()`:** [ContentPane.tsx:133](/packages/v3/src/renderer/ContentPane.tsx#L133)

```typescript
function refreshGitGutter(filePath: string) {
  clearTimeout(gutterTimerRef.current);
  gutterTimerRef.current = setTimeout(async () => {
    const editor = editorRef.current;
    if (!editor || !window.electronAPI?.fileGitDiff) return;
    const model = editor.getModel();                         // Capture identity BEFORE async
    const hunks = await window.electronAPI.fileGitDiff(filePath);
    if (editor.getModel() !== model) return;                 // Guard: model changed → discard
    gutterDecorationsRef.current = applyGitGutter(editor, hunks, gutterDecorationsRef.current);
  }, 200);
}
```

This is the MODEL IDENTITY GUARD pattern. It captures `editor.getModel()` before the async IPC call, then checks reference identity (`!==`) after. If the user switched files during the round trip, the model reference will be different, and the stale decorations are discarded. This is tested in `git-gutter-race.test.ts` (GG-04).

The **`applyGitGutter()`** function itself ([git-gutter.ts:21](/packages/v3/src/renderer/git-gutter.ts#L21)) is 15 lines of pure transformation -- it maps `GutterHunk[]` to Monaco `deltaDecorations`, using `linesDecorationsClassName` to apply CSS classes (`git-gutter-added`, `git-gutter-modified`, `git-gutter-deleted`). Returns the new decoration IDs for the next delta update.

The main process side is interesting too. **`file:git-diff`** ([main.ts:257](/packages/v3/src/main/main.ts#L257)) is a two-step operation: first `git ls-files --error-unmatch` to check if the file is tracked. If untracked, ALL lines are treated as "added" (the entire file lights up green). If tracked, `git diff --unified=0 HEAD` runs and the output is parsed by **`parseGitDiff()`** ([git-diff-parser.ts:22](/packages/v3/src/main/git-diff-parser.ts#L22)) into `DiffHunk[]` based on hunk line counts: `newCount=0` means delete, `oldCount=0` means add, both non-zero means modify.

### Two-Layer Echo Suppression

The same file is watched for external changes in the main process and for internal save-echoes in the renderer. Why does echo suppression exist in TWO places?

Because timing is unpredictable. The `fs.watch` callback, IPC delivery, and JavaScript timer resolution all have variable latency.

```
User types
  t=0       suppressExternalRef = true (immediate, renderer layer)
  t=1000    Debounce fires → fileWrite IPC
            Main: pendingContentWrites.add(path) (main layer)
            Main: writeFile(path, content)
  t=~1050   fs.watch fires → pendingContentWrites.has(path) → SUPPRESSED at main layer
  t=1300    Main: pendingContentWrites.delete(path)
  t=1500    Renderer: suppressExternalRef = false
```

Without the main layer, the watcher would fire, read the file, and send an IPC event. If the renderer's suppress flag has already cleared (timer jitter), the editor clobbers itself. Without the renderer layer, the main layer's 300ms window might expire before the IPC message arrives, or the user's NEW keystrokes after the write would not be "pending."

Two layers, two timescales, independent checks.

### Two Watchers for Two Panes

The main process has TWO `ContentWatcher` instances ([main.ts:289](/packages/v3/src/main/main.ts#L289)):

```typescript
// Left pane watcher — with echo suppression (read-write editor)
const contentWatcher = new ContentWatcher({
  onChange: (filePath, content) => {
    win.webContents.send('file:changed', filePath, content);
  },
  isPendingWrite: (fp) => pendingContentWrites.has(fp),
});

// Right pane watcher — no echo suppression (read-only viewer)
const codeWatcher = new ContentWatcher({
  onChange: (filePath, content) => {
    win.webContents.send('code:changed', filePath, content);
  },
  isPendingWrite: () => false, // Code pane is read-only — no echoes to suppress
});
```

The `ContentWatcher` class ([content-watcher.ts](/packages/v3/src/main/content-watcher.ts)) watches the parent directory with `@parcel/watcher`, filters by basename (to handle atomic temp+rename writes), debounces at 200ms, and deduplicates by comparing content strings. The left pane watcher has real echo suppression. The right pane watcher passes `() => false` because the code pane is read-only -- it never writes, so there are no echoes to suppress.

### What Happens When an Agent Edits the File

The external change handler ([ContentPane.tsx:284](/packages/v3/src/renderer/ContentPane.tsx#L284)) receives `file:changed` from the left pane watcher, checks both suppression guards, preserves cursor and scroll, replaces the buffer, and refreshes the git gutter:

```typescript
const unsub = window.electronAPI.onFileChanged((filePath, content) => {
  if (suppressExternalRef.current) return;                    // Guard 1: our own echo
  if (filePath !== useNapStore.getState().activeFilePath) return; // Guard 2: wrong file

  const editor = editorRef.current;
  const position = editor?.getPosition();
  const scrollTop = editor?.getScrollTop();

  modelRef.current?.setValue(content);                       // Replace buffer

  if (editor && position) editor.setPosition(position);
  if (editor && scrollTop !== undefined) editor.setScrollTop(scrollTop);
  if (filePath) refreshGitGutter(filePath);                  // Update gutter
});
```

The right pane handler ([TerminalPane.tsx:161](/packages/v3/src/renderer/TerminalPane.tsx#L161)) is simpler -- no echo suppression, just scroll preservation. Read-only means no echoes.

---

## The Monarch Tokenizer and Shift-Enter

### The Tokenizer

Monarch is Monaco's built-in tokenizer engine -- a state machine driven by regex rules evaluated top-to-bottom. The **`registerNapkinMarkdown()`** function ([napkin-markdown.ts:83](/packages/v3/src/renderer/napkin-markdown.ts#L83)) defines the complete tokenizer:

```typescript
monaco.languages.setMonarchTokensProvider('napkin-markdown', {
  tokenizer: {
    root: [
      [/^#{1,6}\s.*$/, 'heading'],

      // Role-prefixed comments — MUST come before generic //
      [/\/\/A:.*$/, 'comment.architect'],     // Architect (blue)
      [/\/\/DU:.*$/, 'comment.user'],         // User/Dima (green)
      [/\/\/FS:.*$/, 'comment.fs-eng'],       // Fullstack engineer (green)
      [/\/\/TA:.*$/, 'comment.test-arch'],    // Test architect (orange)
      [/\/\/TE:.*$/, 'comment.test-eng'],     // Test engineer (gray)

      [/\/\/.*$/, 'comment'],                  // Generic // — catches the rest

      [/\*\*/, 'bold.marker', '@bold'],        // Bold: push into @bold state
      [/`[^`]+`/, 'inline-code'],
      [/^(\s*\*)(\s)/, ['bullet.marker', 'white']],
      [/./, 'source'],
    ],
    bold: [
      [/\*\*/, 'bold.marker', '@pop'],        // Closing ** pops back to root
      [/[^*]+/, 'bold'],
      [/\*/, 'bold'],                          // Single * inside bold (not a closing **)
    ],
  },
});
```

Rule order IS the logic. The five role-prefixed rules MUST precede `//.*$`, or Monarch would match `//A: architect note` as a generic comment and the role-specific rules would never fire. The source file has a comment documenting this: "Role-prefixed comment rules MUST come before generic //."

The `bold` state handles `**text**` as a three-token construct: opening `**` (gray marker), content (bold font), closing `**` (gray marker, pops state). The third rule `[/\*/, 'bold']` handles a lone asterisk inside bold text, preventing it from being unmatched.

### Themes Extracted to `themes.ts`

Theme definitions are no longer inline in napkin-markdown.ts. They live in **`themes.ts`** ([themes.ts:8](/packages/v3/src/renderer/themes.ts#L8)), which defines a `ThemeDef` interface with three layers:

```typescript
export interface ThemeDef {
  name: string;
  monacoTheme: monaco.editor.IStandaloneThemeData;  // For Monaco's setTheme()
  shell: {
    bg: string; bgSecondary: string; bgTertiary: string;
    bgHover: string; border: string;
    text: string; textSecondary: string; textMuted: string; textDim: string;
    accent: string; link: string;
  };                                                  // For CSS custom properties
  roleColors: {
    architect: string; user: string; 'fs-eng': string;
    'test-arch': string; 'test-eng': string;
  };                                                  // For both contexts
}
```

The **`tokenRules()`** factory ([themes.ts:35](/packages/v3/src/renderer/themes.ts#L35)) generates Monaco token rules from role colors and option values. Every theme calls it with its own palette. The `.slice(1)` trick persists: Monaco's `foreground` field expects bare hex (`3b82f6`), not CSS hex (`#3b82f6`). Colors are stored with the `#` for CSS validity and stripped at the Monaco boundary.

One design decision worth noting: `{ token: 'comment', foreground: roleColors.user.slice(1) }` -- generic `//` comments get the same color as `//DU:` user comments. This is explicit, not a bug. The comment in the source says: "comment foreground = comment.user foreground (tokenizer tweak)."

### Shift-Enter Continuation

When you are writing a napkin and you type `* //A: design note`, then press Shift+Enter, you want the next line to start with `* //A: ` already filled in. The **`registerShiftEnter()`** function ([napkin-markdown.ts:38](/packages/v3/src/renderer/napkin-markdown.ts#L38)) provides this.

It starts with **`detectLinePattern()`** ([napkin-markdown.ts:22](/packages/v3/src/renderer/napkin-markdown.ts#L22)), a single regex that decomposes a line into four parts:

```typescript
export function detectLinePattern(line: string): LinePattern {
  const match = line.match(/^(\s*)(\* )?(\/\/\w+: )?(.*?)$/);
  //                         ^^^   ^^^   ^^^^^^^^^^   ^^^
  //                       indent  bullet  prefix    content
  return {
    indent: match?.[1] || '',
    bullet: match?.[2] || '',   // "* " or ""
    prefix: match?.[3] || '',   // "//A: " or ""
    content: match?.[4] || '',
  };
}
```

The regex uses `?` on the bullet and prefix groups -- they are independently optional. `\/\/\w+: ` requires the colon-space, so generic `// comments` do not false-positive as prefixes.

Then the Shift+Enter handler has two modes:

1. **Continue** -- if the current line has content, the new line gets the same indent + bullet + prefix. You type `* //A: idea`, Shift+Enter, and you get a new line `* //A: ` ready for the next thought.

2. **Break-out** -- if the content is empty (you pressed Shift+Enter on a line that is just `* //A: ` with nothing after it), the bullet and prefix are stripped, and you get a plain indented line. This is how you END a bulleted annotation section -- press Shift+Enter on the empty bullet to escape.

This matches the list continuation behavior from Notion and Obsidian. Two code paths, one regex, natural editing feel.

---

## Link Routing

You are reading a napkin and it mentions `src/model.ts:42`. You Cmd+click it. What happens?

### The Classification Cascade

The pure function **`routeLink()`** ([routing-rules.ts:74](/packages/v3/src/renderer/routing-rules.ts#L74)) classifies every link into one of three actions:

```typescript
export function routeLink(ctx: LinkContext): LinkResult {
  const { href, sourceFilePath } = ctx;

  // External → open in system browser
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return { action: 'openExternal', url: href };
  }

  const parsed = parseLinkHref(href);

  // Extension wins: .md → openDoc (left pane)
  const ext = getExtension(parsed.path);
  if (ext === '.md') {
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    return { action: 'openDoc', path: resolved };
  }

  // Everything else → openCode (right pane) with two-root resolution
  // ... absolute, relative, and bare path handling ...
}
```

The "extension wins" rule is important. `changelog.md:15` routes to `openDoc`, not `openCode`, despite having a line number suffix. The `.md` extension overrides the `:line` suffix. This is deliberate: markdown files belong in the left pane's napkin editor.

### Two-Root Resolution for Bare Paths

When a napkin at `/project/.nap/nepics/01/30-napkins/plan.nap.md` references `src/model.ts`, where does that resolve? It could be relative to the napkin's directory, or relative to the project root. The answer is: try both.

```typescript
// Bare path → primary = dirname(sourceFile), fallback = projectRoot
const primary = resolveRelative(parsed.path, sourceFilePath);
const fallback = normalizePath(projectRoot + '/' + parsed.path);
return {
  action: 'openCode',
  path: primary,
  fallbackPath: primary !== fallback ? fallback : undefined,
  line: parsed.line,
  col: parsed.col,
};
```

The **`extractProjectRoot()`** function ([routing-rules.ts:154](/packages/v3/src/renderer/routing-rules.ts#L154)) finds the project root by locating `/.nap/` in the source file path and taking everything before it. So `/project/.nap/nepics/01/plan.nap.md` yields project root `/project`.

When the result has a `fallbackPath`, the renderer's **`handleResult()`** ([ContentPane.tsx:148](/packages/v3/src/renderer/ContentPane.tsx#L148)) checks the primary path on disk first via `fileExists` IPC. If it does not exist, the fallback is used:

```typescript
if (result.fallbackPath) {
  window.electronAPI?.fileExists(result.path).then((exists: boolean) => {
    if (exists) {
      store.openCode({ path: result.path, line: result.line, col: result.col });
    } else {
      store.openCode({ path: result.fallbackPath!, line: result.line, col: result.col });
    }
  });
}
```

### Link Format Parsing

**`parseLinkHref()`** ([routing-rules.ts:125](/packages/v3/src/renderer/routing-rules.ts#L125)) understands two line-number formats:

- `file.ts#L42` -- GitHub-style anchor, from `[text](file.ts#L42)` markdown links
- `file.ts:42:17` -- terminal-style `path:line:col`, from bare text references

Both are tried in that order. If neither matches, the href is treated as a plain path.

### Cmd+Click Interception in the Editor

The **link click `useEffect`** ([ContentPane.tsx:171](/packages/v3/src/renderer/ContentPane.tsx#L171)) intercepts Cmd+Click in the Monaco editor. It runs three regex passes in priority order against the clicked line:

```
Priority 1: Markdown links — [text](url)
Priority 2: Bare URLs — https://...
Priority 3: Bare file paths — src/model.ts:42
```

For each match, it checks whether the click column falls within the match range. The first match that contains the click position wins. Bare file paths check backwards to make sure they are not inside a URL (the `isUrl` backward-walk guard).

### The `nap-link://` Protocol Hack

Monaco also has its own link detection system (the `LinkProvider` API). The **`registerContentLinkProvider()`** function ([content-link-provider.ts:87](/packages/v3/src/renderer/content-link-provider.ts#L87)) hooks into this to provide clickable underlines on links. But Monaco's `resolveLink` API expects a URL -- it wants to OPEN something in a browser. The app needs to INTERCEPT clicks, not open URLs.

The workaround: `resolveLink` stashes the serialized `LinkResult` into a custom protocol URL:

```typescript
resolveLink(link) {
  const result = routeLink({ href, sourceFilePath });
  link.url = `nap-link://${encodeURIComponent(JSON.stringify(result))}`;
  return link;
}
```

Then **`handleLinkClick()`** ([content-link-provider.ts:129](/packages/v3/src/renderer/content-link-provider.ts#L129)) checks for the `nap-link://` prefix, parses the JSON back out, and dispatches the action. This avoids fighting Monaco's built-in link opener.

### Where Links Go

The three actions route to different surfaces:

- `openDoc` -- left pane. Calls `store.openDoc(path)` which upserts a tab in the left tab bar and sets `activeFilePath`. The napkin editor loads the file.
- `openCode` -- right pane. Calls `store.openCode({path, line, col})` which sets `rightPaneMode: 'code'`, upserts a tab in the right tab bar, and the CodeEditor mounts with the file content and a yellow line highlight.
- `openExternal` -- system browser. Calls `shell.openExternal(url)` via IPC.

The same `routeLink()` function is used by THREE callers: Cmd+click in the editor, the Monaco link provider, and terminal link detection. Terminal links ([file-link-provider.ts](/packages/v3/src/renderer/file-link-provider.ts)) use the same `FILE_PATH_REGEX` and the same `routeLink()` classification.

---

## The Theme System

### Five Themes, Dual Application

nap v3 has five themes: one dark and four light variants (cream, gray, sepia, blue). They are defined in **`THEMES`** ([themes.ts:270](/packages/v3/src/renderer/themes.ts#L270)):

```typescript
export const THEMES: ThemeDef[] = [dark, lightCream, lightGray, lightSepia, lightBlue];
```

Array order equals rotation order. Cmd+T cycles through them. The comment in the source says: "comment out entries to remove from rotation."

Each theme has three layers: `monacoTheme` (editor-specific colors and token rules), `shell` (11 CSS custom properties for the app chrome), and `roleColors` (5 per-role colors used by both Monaco tokens and CSS). Why three layers? Because the app is not just a Monaco editor. The sidebar, tab bar, resize handle, gutter, debug panel -- all need to respond to theme changes. Monaco's `setTheme()` only affects Monaco editors.

The **`applyTheme()`** function ([themes.ts:296](/packages/v3/src/renderer/themes.ts#L296)) applies both:

```typescript
export function applyTheme(theme: ThemeDef): void {
  monaco.editor.setTheme(theme.name);                    // Updates ALL Monaco editors

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.shell)) {
    root.style.setProperty(`--nap-${camelToKebab(key)}`, value);  // e.g., --nap-bg-secondary
  }
  for (const [role, color] of Object.entries(theme.roleColors)) {
    root.style.setProperty(`--nap-role-${role}`, color);           // e.g., --nap-role-architect
  }
}
```

`monaco.editor.setTheme()` is global -- it updates BOTH editors (left and right) in one call. CSS custom properties on `:root` cascade to everything. One function call themes the entire app.

### Cycling and Persistence

The store's **`cycleTheme()`** ([store.ts:420](/packages/v3/src/renderer/store.ts#L420)) is four lines:

```typescript
cycleTheme: () => {
  const current = get().currentThemeName;
  const idx = THEMES.findIndex((t) => t.name === current);
  const next = THEMES[(idx + 1) % THEMES.length];     // Modulo wrap
  set({ currentThemeName: next.name });
  applyTheme(next);
  persistUiState({ theme: next.name });                // Write to ui-state.json
},
```

Modulo wrap means the 5th theme cycles back to the 1st. On app launch, the persisted theme name is loaded from `ui-state.json`. If the name is unrecognized (deleted theme?), **`findTheme()`** ([themes.ts:309](/packages/v3/src/renderer/themes.ts#L309)) falls back to `THEMES[0]`.

---

## End-to-End Flows

Now that you understand each piece, here is how they compose.

### The Read Flow: Sidebar Click to Loaded Editor

```
Sidebar FileRow click
  -> route({ filePath: file.absPath })             [routing-rules.ts:26]
  -> isNapPath(path) -> true
  -> returns { pane: 'left', surface: 'monaco' }
  -> store.openDoc(file.absPath)                   [store.ts:288]
  -> upsertTab(leftTabs, path, 'file', true)       ephemeral tab created
  -> set({ activeFilePath, leftTabs, activeLeftTabId })

ContentPane re-renders (activeFilePath changed)
  -> useEffect([activeFilePath]) fires             [ContentPane.tsx:240]
  -> fileRead(activeFilePath) IPC to main
  -> main: readFile(path, 'utf-8')                 [main.ts:207]
  -> returns content string

  -> dispose old model
  -> createModel(content, 'napkin-markdown')
  -> editor.setModel(model)
  -> gutterDecorationsRef.current = []             clear stale decorations
  -> fileWatch(activeFilePath) IPC to main         start watcher
  -> refreshGitGutter(activeFilePath)              first gutter paint
```

### The Link Click Flow: Cmd+Click to Code Viewer

```
User Cmd+clicks "src/model.ts:42" in napkin
  -> onMouseDown fires                             [ContentPane.tsx:179]
  -> three regex passes: markdown links, URLs, bare paths
  -> bare path regex matches "src/model.ts:42"
  -> routeLink({ href: 'src/model.ts:42', sourceFilePath })
  -> parseLinkHref -> { path: 'src/model.ts', line: 42 }
  -> not .md -> openCode with two-root resolution
  -> returns { action: 'openCode', path: primary, fallbackPath, line: 42 }

handleResult dispatches:
  -> fileExists(primary) IPC to main               [main.ts:246]
  -> exists -> store.openCode({ path, line: 42 })  [store.ts:276]
  -> upsertTab(rightTabs, path, 'file', true)
  -> set({ rightPaneMode: 'code', rightFilePath, rightFileLine: 42 })

TerminalPane re-renders (rightPaneMode changed)
  -> CodeEditor mounts                             [TerminalPane.tsx:65]
  -> detectLanguage('model.ts') -> 'typescript'
  -> fileRead(path) IPC -> createModel(content, 'typescript')
  -> revealLineInCenter(42)
  -> deltaDecorations with nap-line-highlight      yellow fade animation
  -> codeWatch(path) IPC starts right-pane watcher
```

### The Theme Switch Flow: Cmd+T

```
Cmd+T keydown                                      [index.tsx:225]
  -> store.cycleTheme()                            [store.ts:420]
  -> find current theme index
  -> (idx + 1) % THEMES.length -> next theme
  -> set({ currentThemeName: next.name })
  -> applyTheme(next)                              [themes.ts:296]
     -> monaco.editor.setTheme(next.name)          both editors update
     -> set CSS vars on :root                      app shell updates
  -> persistUiState({ theme: next.name })          write ui-state.json
```

### The Auto-Save + Git Gutter Pipeline

```
User types in editor
  -> onDidChangeModelContent                       [ContentPane.tsx:96]
  -> pinActiveEphemeral('left')                    ephemeral -> pinned
  -> suppressExternalRef = true
  -> save debounce: 1000ms

1000ms later:
  -> editor.getValue() -> fileWrite IPC
  -> main: pendingContentWrites.add(path)          [main.ts:220]
  -> main: writeFile(path, content)
  -> 300ms later: pendingContentWrites.delete(path)
  -> 500ms after write: suppressExternalRef = false

Immediately after write:
  -> refreshGitGutter(filePath)                    [ContentPane.tsx:133]
  -> 200ms debounce
  -> capture model identity
  -> fileGitDiff IPC -> main shells out to git
  -> main: git ls-files -> tracked? -> git diff --unified=0
  -> parseGitDiff -> GutterHunk[]
  -> model identity guard: same model? -> proceed
  -> applyGitGutter -> deltaDecorations
```

---

## Key Takeaways

**Nine refs, four subscriptions -- the ratio tells the story.** The component re-renders for tab switches, file opens, and mode toggles. Everything else is imperative. This is not a hack -- it is the correct pattern for any heavyweight imperative library in React (Monaco, xterm.js, canvas, WebGL). If you are adding a new feature, ask yourself: does this need to trigger a React re-render? If not, use a ref.

**Two editors for two purposes -- the configuration contrast IS the design.** Left pane: no line numbers, word wrap, read-write, napkin-markdown. Right pane: line numbers on, folding on, read-only, auto-detected language. If you are tempted to "unify" them, resist. They serve different purposes and their configurations reflect that.

**The model identity guard prevents stale async decorations.** Capture the model reference before an async call, check reference identity after. This three-line pattern prevents an entire class of race conditions where the user switches files during an IPC round trip. Use it whenever you have async operations that update editor decorations.

**Link routing is a pure function cascade with two-root fallback.** `routeLink()` does classification and resolution without touching the store or React. The two-root pattern (dirname primary, project root fallback) handles both relative references within `.nap/` and project-root references like `/src/model.ts`. Extension wins over line suffix -- `.md` files always go to the left pane.

**Theme dual application: Monaco `setTheme()` + CSS custom properties.** One call to `applyTheme()` updates both Monaco editors AND the entire app shell. If you add a new UI component, use the `--nap-*` CSS variables -- they will automatically respond to theme changes.

**Echo suppression needs two layers because timing is unknowable.** Main process (`pendingContentWrites`, 300ms window) and renderer (`suppressExternalRef`, covers entire typing session + 500ms tail). If you are tempted to simplify to one layer, think about what happens when the IPC message arrives 400ms late.

**The sentinel terminal tab is immortal.** `TERMINAL_TAB_ID = '__terminal__'` cannot be closed, always sits at position 0 in the right tab bar, and updates in-place when you switch agents. Code file tabs are ephemeral until pinned by edit or double-click. This asymmetry is the right design: you always have a terminal, you sometimes view code.
