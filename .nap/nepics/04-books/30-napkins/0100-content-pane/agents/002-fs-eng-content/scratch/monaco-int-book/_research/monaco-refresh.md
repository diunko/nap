# Monaco Integration Refresh — Research Findings

Research date: 2026-05-13
Source repo: /Users/diunko/dvl/space-b/nap

All line numbers verified by reading actual files.

---

## ContentPane.tsx — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/ContentPane.tsx
**Lines:** 1-449 (entire file)
**What it does:** The left pane — owns one Monaco editor for napkin-markdown, plus a rendered HTML overlay for preview mode. Now handles TabBar, git gutter, shift-enter, link click routing, and rendered mode.
**Why it's shaped this way:** Single editor instance reused across tabs (model swap), never unmounted. Rendered view is a sibling div toggled by CSS display, so editor state survives mode toggle.

### Imports (lines 1-11)

```typescript
import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore } from './store';
import { TabBar } from './TabBar';
import { registerNapkinMarkdown, registerShiftEnter } from './napkin-markdown';
import { handleLinkClick } from './content-link-provider';
import { applyGitGutter } from './git-gutter';
import { registerThemes, applyTheme, findTheme } from './themes';
import { renderMarkdown } from './markdown-renderer';
import { routeLink } from './routing-rules';
import type { LinkResult } from './routing-rules';
```

### ensureRegistered — one-time setup (lines 13-25)

```typescript
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
  registerThemes();
  // Apply initial theme from persisted state
  const themeName = useNapStore.getState().currentThemeName;
  applyTheme(findTheme(themeName));
  // Expose Monaco for medium tests (same pattern as window.__napStore__)
  (window as any).__monaco__ = monaco;
}
```

**Key design:** Theme applied BEFORE editor creation. `window.__monaco__` is exposed for Playwright medium tests.

### All refs — 9 total (lines 42-51)

```typescript
const containerRef = useRef<HTMLDivElement>(null);
const renderedRef = useRef<HTMLDivElement>(null);
const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const modelRef = useRef<monaco.editor.ITextModel | null>(null);
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
const suppressExternalRef = useRef(false);
const gutterDecorationsRef = useRef<string[]>([]);
const shiftEnterDisposableRef = useRef<monaco.IDisposable | null>(null);
const gutterTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
const focusGutterTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
```

**Key design:** 9 refs for one component. gutterDecorationsRef stores decoration IDs for delta updates. Three separate timer refs for save debounce (1s), gutter refresh (200ms), and focus-gutter refresh (300ms).

### Store subscriptions (lines 38-41)

```typescript
const activeFilePath = useNapStore((s) => s.activeFilePath);
const leftTabs = useNapStore((s) => s.leftTabs);
const activeLeftTabId = useNapStore((s) => s.activeLeftTabId);
const leftPaneRenderMode = useNapStore((s) => s.leftPaneRenderMode);
```

### Editor creation — options (lines 54-80)

```typescript
const editor = monaco.editor.create(containerRef.current, {
  language: 'napkin-markdown',
  theme: useNapStore.getState().currentThemeName,
  wordWrap: 'on',
  minimap: { enabled: false },
  lineNumbers: 'off',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  tabSize: 2,
  insertSpaces: true,
  fontSize: 14,
  fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  folding: false,
  glyphMargin: true,
  lineDecorationsWidth: 8,
  lineNumbersMinChars: 0,
  padding: { top: 12, bottom: 12 },
});
```

**Key design:** `lineNumbers: 'off'` — napkin-markdown doesn't use line numbers. `glyphMargin: true` — needed for git gutter decorations. `quickSuggestions: false` — writing tool, not coding tool.

### Shift-enter keybinding registration (line 84)

```typescript
shiftEnterDisposableRef.current = registerShiftEnter(editor);
```

### Focus-triggered git gutter refresh (lines 87-93)

```typescript
editor.onDidFocusEditorText(() => {
  clearTimeout(focusGutterTimerRef.current);
  focusGutterTimerRef.current = setTimeout(() => {
    const filePath = useNapStore.getState().activeFilePath;
    if (filePath) refreshGitGutter(filePath);
  }, 300);
});
```

**Key design:** 300ms debounce on focus to catch stale decorations when switching back to the app.

### Auto-save with pinActiveEphemeral (lines 96-113)

```typescript
editor.onDidChangeModelContent(() => {
  clearTimeout(saveTimerRef.current);
  const filePath = useNapStore.getState().activeFilePath;
  if (!filePath) return;

  // Pin ephemeral tab on first edit
  useNapStore.getState().pinActiveEphemeral('left');

  suppressExternalRef.current = true;
  saveTimerRef.current = setTimeout(async () => {
    const content = editor.getValue();
    await window.electronAPI?.fileWrite(filePath, content);
    // Keep suppress active briefly for watcher echo
    setTimeout(() => { suppressExternalRef.current = false; }, 500);
    // Re-run git diff after save
    refreshGitGutter(filePath);
  }, 1000);
});
```

**Key design:** `pinActiveEphemeral('left')` on first edit — typing auto-pins the ephemeral tab. 1s save debounce. 500ms suppress window after write to prevent watcher echo. Git gutter refreshed after each save.

### refreshGitGutter with model identity guard (lines 133-145)

```typescript
function refreshGitGutter(filePath: string) {
  clearTimeout(gutterTimerRef.current);
  gutterTimerRef.current = setTimeout(async () => {
    const editor = editorRef.current;
    if (!editor || !window.electronAPI?.fileGitDiff) return;
    // Capture model identity before async call
    const model = editor.getModel();
    const hunks = await window.electronAPI.fileGitDiff(filePath);
    // Guard: only apply if model hasn't changed
    if (editor.getModel() !== model) return;
    gutterDecorationsRef.current = applyGitGutter(editor, hunks, gutterDecorationsRef.current);
  }, 200);
}
```

**Key design:** MODEL IDENTITY GUARD. Captures `editor.getModel()` before the async IPC call, checks it again after. Prevents applying stale decorations if the user switched tabs during the 200ms+ round trip. Uses reference identity, not value equality. Has its own dedicated test (git-gutter-race.test.ts).

### handleResult — dispatching link actions (lines 148-168)

```typescript
function handleResult(result: LinkResult) {
  const store = useNapStore.getState();
  if (result.action === 'openCode') {
    // Resolve with fallback if needed
    if (result.fallbackPath) {
      window.electronAPI?.fileExists(result.path).then((exists: boolean) => {
        if (exists) {
          store.openCode({ path: result.path, line: result.line, col: result.col });
        } else {
          store.openCode({ path: result.fallbackPath!, line: result.line, col: result.col });
        }
      });
    } else {
      store.openCode({ path: result.path, line: result.line, col: result.col });
    }
  } else if (result.action === 'openDoc') {
    store.openDoc(result.path);
  } else if (result.action === 'openExternal') {
    window.electronAPI?.shellOpenExternal(result.url);
  }
}
```

**Key design:** Two-root resolution with fallback. Bare paths get both dirname(source) and projectRoot. If primary doesn't exist on disk, falls back to projectRoot. Uses `fileExists` IPC (async) for the check. openDoc → left pane, openCode → right pane, openExternal → system browser.

### Link click handling — Cmd+Click interception (lines 171-237)

```typescript
// Wire up link click handling via Monaco's opener service
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  // Alternative: intercept via onMouseDown
  const mouseDisposable = editor.onMouseDown((e) => {
    if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && e.event.ctrlKey || e.event.metaKey) {
      const position = e.target.position;
      if (!position) return;
      const model = editor.getModel();
      if (!model) return;
      const lineContent = model.getLineContent(position.lineNumber);
      const sourceFilePath = useNapStore.getState().activeFilePath;
      if (!sourceFilePath) return;

      const col = position.column;
      // Check markdown links [text](url)
      const mdRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      // ... matches in priority order: markdown links → bare URLs → bare file paths
```

**Key design:** Three regex passes in priority order. Markdown links first (most specific), bare URLs second, bare file paths last. For file paths, walks back to check if inside a URL. Each match checks if click column is within the match range.

**SURPRISING:** The operator precedence on line 180 looks wrong — `e.event.ctrlKey || e.event.metaKey` should arguably be `(e.event.ctrlKey || e.event.metaKey)`, but the surrounding `&&` with `e.target.type` check makes it work because the type check short-circuits first. Still, the intent was clearly "(type is CONTENT_TEXT) AND (ctrl OR meta)".

### File load with model swap (lines 240-281)

```typescript
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;

  if (!activeFilePath) {
    if (modelRef.current) {
      modelRef.current.dispose();
      modelRef.current = null;
    }
    editor.setModel(null);
    gutterDecorationsRef.current = [];
    window.electronAPI?.fileWatch(null);
    return;
  }

  (async () => {
    const content = await window.electronAPI?.fileRead(activeFilePath);
    if (content === null || content === undefined) return;

    if (modelRef.current) {
      modelRef.current.dispose();
    }
    const model = monaco.editor.createModel(content, 'napkin-markdown');
    modelRef.current = model;
    editor.setModel(model);
    gutterDecorationsRef.current = [];

    window.electronAPI?.fileWatch(activeFilePath);
    refreshGitGutter(activeFilePath);
  })();
}, [activeFilePath]);
```

**Key design:** Disposes old model, creates new. Clears gutter decorations array. Starts file watcher for external change detection. Does NOT recreate the editor — just swaps the model.

### External file change listener (lines 284-313)

```typescript
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

    model.setValue(content);

    if (editor && position) editor.setPosition(position);
    if (editor && scrollTop !== undefined) editor.setScrollTop(scrollTop);

    if (filePath) refreshGitGutter(filePath);
  });

  return unsub;
}, []);
```

**Key design:** Echo suppression via suppressExternalRef. Cursor/scroll preservation on external update. Gutter refresh after external change.

### Rendered mode — HTML generation (lines 316-340)

```typescript
// Rendered mode: generate HTML when mode or content changes
useEffect(() => {
  if (leftPaneRenderMode !== 'rendered' || !renderedRef.current) return;
  const model = modelRef.current;
  if (!model) return;
  const html = renderMarkdown(model.getValue());
  renderedRef.current.innerHTML = html;
}, [leftPaneRenderMode, activeFilePath]);

// Also update rendered HTML when model content changes (external edits)
useEffect(() => {
  if (leftPaneRenderMode !== 'rendered') return;
  const model = modelRef.current;
  if (!model) return;

  const disposable = model.onDidChangeContent(() => {
    if (renderedRef.current) {
      renderedRef.current.innerHTML = renderMarkdown(model.getValue());
    }
  });
  // Initial render
  if (renderedRef.current) {
    renderedRef.current.innerHTML = renderMarkdown(model.getValue());
  }
  return () => disposable.dispose();
}, [leftPaneRenderMode, activeFilePath]);
```

**Key design:** Two effects for two triggers: (1) mode switch or tab switch, (2) content change while in rendered mode. Uses `model.onDidChangeContent` for live preview.

### Rendered view click handler (lines 343-377)

```typescript
function handleRenderedClick(e: React.MouseEvent<HTMLDivElement>) {
  // Cmd+click → switch to edit mode at source line
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    let el = e.target as HTMLElement | null;
    while (el && !el.hasAttribute('data-source-line')) {
      el = el.parentElement;
      if (el === renderedRef.current) { el = null; break; }
    }
    if (el) {
      const line = parseInt(el.getAttribute('data-source-line')!, 10);
      useNapStore.getState().toggleRenderMode();
      const editor = editorRef.current;
      if (editor) {
        setTimeout(() => {
          editor.setPosition({ lineNumber: line, column: 1 });
          editor.revealLineInCenter(line);
          editor.focus();
        }, 0);
      }
    }
    return;
  }

  // Link clicks → route
  const anchor = (e.target as HTMLElement).closest?.('a');
  if (anchor) {
    e.preventDefault();
    const href = anchor.getAttribute('href');
    if (!href) return;
    const sourceFilePath = useNapStore.getState().activeFilePath ?? '';
    const result = routeLink({ href, sourceFilePath });
    handleResult(result);
  }
}
```

**Key design:** Cmd+click walks UP the DOM tree looking for `data-source-line`. When found, toggles to edit mode and positions cursor there via `setTimeout(0)` to let DOM update first. Regular click on anchor → routeLink dispatch.

### JSX layout (lines 379-449)

```typescript
return (
  <div data-testid="content-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', ... }}>
    {/* Tab bar */}
    <TabBar
      tabs={leftTabs}
      activeTabId={activeLeftTabId}
      onActivate={(tabId) => {
        const tab = leftTabs.find((t) => t.id === tabId);
        if (tab) useNapStore.getState().openDoc(tab.path);
      }}
      onClose={(tabId) => useNapStore.getState().closeTab('left', tabId)}
      onPin={(tabId) => useNapStore.getState().pinTab('left', tabId)}
    />
    {/* Placeholder when no file */}
    {!activeFilePath && leftTabs.length === 0 && (
      <div style={{ ... }}>no file open</div>
    )}
    {/* Editor — always mounted, hidden in rendered mode */}
    <div ref={containerRef} style={{
      flex: 1,
      display: activeFilePath && leftPaneRenderMode === 'edit' ? 'block' : 'none',
    }} />
    {/* Rendered view — visible in rendered mode */}
    {activeFilePath && leftPaneRenderMode === 'rendered' && (
      <div ref={renderedRef} data-testid="rendered-view" className="nap-rendered"
           onClick={handleRenderedClick} style={{ ... }} />
    )}
  </div>
);
```

**Key design:** Editor container ALWAYS mounted (display:none when not visible), rendered view conditionally rendered. This means the editor never loses state, and ResizeObserver keeps working.

---

## TerminalPane.tsx — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/TerminalPane.tsx
**Lines:** 1-259 (entire file)
**What it does:** The right pane — contains BOTH a terminal surface (xterm.js) AND a read-only code editor (Monaco). Switches between them based on rightPaneMode. Has its own tab bar.

### CodeEditor — inner component (lines 65-185)

```typescript
function CodeEditor() {
  const rightFilePath = useNapStore((s) => s.rightFilePath);
  const rightFileLine = useNapStore((s) => s.rightFileLine);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const decorationsRef = useRef<string[]>([]);
```

**Key design:** CodeEditor is a SECOND Monaco editor — read-only. Separate from the left pane editor. Has its own model lifecycle. Line highlight decorations for "jump to line".

### CodeEditor options (lines 79-93)

```typescript
const editor = monaco.editor.create(containerRef.current, {
  readOnly: true,
  theme: useNapStore.getState().currentThemeName,
  minimap: { enabled: false },
  lineNumbers: 'on',
  fontSize: 14,
  fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  folding: true,
  glyphMargin: true,
  padding: { top: 8, bottom: 8 },
});
```

**Key design:** `readOnly: true`, `lineNumbers: 'on'` (unlike left pane which is 'off'), `folding: true` (code has structure). Less padding (8 vs 12).

### Language detection (lines 9-21)

```typescript
function detectLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', py: 'python', rs: 'rust', go: 'go', java: 'java',
    rb: 'ruby', sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', yaml: 'yaml',
    xml: 'xml', sql: 'sql', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    swift: 'swift', kt: 'kotlin', lua: 'lua', r: 'r', php: 'php',
    toml: 'ini', ini: 'ini', dockerfile: 'dockerfile',
  };
  return map[ext] || 'plaintext';
}
```

**Key design:** 30+ extension mappings. Falls back to 'plaintext'. This is in TerminalPane.tsx, not ContentPane.tsx, because only the code pane (right pane) needs auto-detection — the left pane always uses 'napkin-markdown'.

### Line highlight animation (lines 23-63)

```typescript
let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nap-line-highlight {
      background-color: rgba(255, 255, 0, 0.25);
      animation: nap-line-fade 1.5s ease-out forwards;
    }
    @keyframes nap-line-fade {
      from { background-color: rgba(255, 255, 0, 0.25); }
      to { background-color: transparent; }
    }
    .git-gutter-added { border-left: 3px solid #22c55e !important; margin-left: 3px; }
    .git-gutter-modified { border-left: 3px solid #3b82f6 !important; margin-left: 3px; }
    .git-gutter-deleted { ... triangle arrow CSS ... }
  `;
  document.head.appendChild(style);
}
```

**Key design:** CSS injected once via JS. Line highlight = yellow fade over 1.5s. Git gutter CSS classes defined here for both editors. Green for add, blue for modify, red triangle for delete.

### File load + line highlight (lines 108-158)

```typescript
useEffect(() => {
  ...
  (async () => {
    const content = await window.electronAPI?.fileRead(rightFilePath);
    if (content === null || content === undefined) return;

    if (modelRef.current) modelRef.current.dispose();

    const lang = detectLanguage(rightFilePath);
    const model = monaco.editor.createModel(content, lang);
    modelRef.current = model;
    editor.setModel(model);

    // Line highlight
    if (rightFileLine) {
      editor.revealLineInCenter(rightFileLine);
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(rightFileLine, 1, rightFileLine, 1),
          options: { isWholeLine: true, className: 'nap-line-highlight' },
        },
      ]);
      // Remove after animation
      setTimeout(() => {
        if (editorRef.current) {
          decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
        }
      }, 1600);
    }

    // Start watching
    window.electronAPI?.codeWatch(rightFilePath);
  })();
}, [rightFilePath, rightFileLine]);
```

**Key design:** Watches for external changes via `codeWatch` IPC. Line highlight decoration removed after 1.6s (slightly longer than animation). `revealLineInCenter` + decoration for "jump to" UX.

### Code file watcher (lines 161-176)

```typescript
useEffect(() => {
  if (!window.electronAPI?.onCodeChanged) return;

  const unsub = window.electronAPI.onCodeChanged((filePath, content) => {
    if (filePath !== useNapStore.getState().rightFilePath) return;
    const model = modelRef.current;
    if (!model) return;

    const editor = editorRef.current;
    const scrollTop = editor?.getScrollTop();
    model.setValue(content);
    if (editor && scrollTop !== undefined) editor.setScrollTop(scrollTop);
  });

  return unsub;
}, []);
```

**Key design:** No echo suppression needed — code pane is read-only. Preserves scroll position on update.

### TerminalPane layout — mode switching (lines 187-259)

```typescript
export function TerminalPane() {
  const rightPaneMode = useNapStore((s) => s.rightPaneMode);
  const rightTabs = useNapStore((s) => s.rightTabs);
  const activeRightTabId = useNapStore((s) => s.activeRightTabId);
  const rightFilePath = useNapStore((s) => s.rightFilePath);
  
  return (
    <div data-testid="terminal-pane" style={{ ... }}>
      <TabBar tabs={rightTabs} activeTabId={activeRightTabId}
        onActivate={(tabId) => {
          const tab = rightTabs.find((t) => t.id === tabId);
          if (!tab) return;
          if (tab.type === 'terminal') {
            useNapStore.getState().setActiveTerminal(tab.path);
          } else {
            useNapStore.getState().openCode({ path: tab.path });
          }
        }}
        onClose={(tabId) => useNapStore.getState().closeTab('right', tabId)}
        onPin={(tabId) => useNapStore.getState().pinTab('right', tabId)}
      />
      {/* Terminal surface — keep alive but hidden when code is active */}
      <div style={{
        display: rightPaneMode === 'terminal' && activeTerminalId ? 'flex' : 'none',
      }}>
        {activeTerminalId && <Terminal />}
      </div>
      {/* Code surface */}
      {rightPaneMode === 'code' && rightFilePath && <CodeEditor />}
    </div>
  );
}
```

**Key design:** Terminal kept alive via display:none (preserves xterm state). CodeEditor conditionally rendered (remounts when mode switches). Tab bar onActivate checks tab.type to route correctly.

---

## napkin-markdown.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/napkin-markdown.ts
**Lines:** 1-123 (entire file)
**What it does:** Registers 'napkin-markdown' language with Monaco. Contains Shift+Enter continuation logic.
**Why it's shaped this way:** Theme definitions REMOVED — now in themes.ts. This file only has tokenizer + keybinding.

### detectLinePattern (lines 22-33)

```typescript
export function detectLinePattern(line: string): LinePattern {
  const match = line.match(/^(\s*)(\* )?(\/\/\w+: )?(.*?)$/);
  if (!match) return { indent: '', bullet: '', prefix: '', content: line };

  return {
    indent: match[1] || '',
    bullet: match[2] || '',
    prefix: match[3] || '',
    content: match[4] || '',
  };
}
```

**Key design:** Single regex detects indent + optional bullet ("* ") + optional role prefix ("//XX: ") + content. The regex uses `?` on bullet and prefix groups, making them independently optional. `/\/\/\w+: /` requires the colon-space, so generic `// comments` don't false-positive.

### registerShiftEnter (lines 38-81)

```typescript
export function registerShiftEnter(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  return editor.addAction({
    id: 'napkin-shift-enter',
    label: 'Continue line pattern',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
    run(ed) {
      const position = ed.getPosition();
      if (!position) return;
      const model = ed.getModel();
      if (!model) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const pattern = detectLinePattern(lineContent);

      const continuation = pattern.indent + pattern.bullet + pattern.prefix;
      const hasContent = pattern.content.trim().length > 0;

      if (!hasContent && (pattern.bullet || pattern.prefix)) {
        // Break-out: empty prefix/bullet line → clear it and insert plain newline
        const lineRange = new monaco.Range(
          position.lineNumber, 1,
          position.lineNumber, lineContent.length + 1,
        );
        ed.executeEdits('shift-enter', [
          { range: lineRange, text: pattern.indent },
          { range: new monaco.Range(position.lineNumber, lineContent.length + 1, position.lineNumber, lineContent.length + 1), text: '\n' + pattern.indent },
        ]);
        ed.setPosition(new monaco.Position(position.lineNumber + 1, pattern.indent.length + 1));
      } else {
        // Continue with same pattern
        const insertPos = new monaco.Range(
          position.lineNumber, lineContent.length + 1,
          position.lineNumber, lineContent.length + 1,
        );
        ed.executeEdits('shift-enter', [
          { range: insertPos, text: '\n' + continuation },
        ]);
        ed.setPosition(new monaco.Position(position.lineNumber + 1, continuation.length + 1));
      }
    },
  });
}
```

**Key design:** Two modes: (1) Continue — copies indent+bullet+prefix to new line. (2) Break-out — if content is empty (you pressed shift-enter on an empty bullet), strips the bullet/prefix and gives you a plain line. This matches the behavior of Notion/Obsidian list continuation.

### Monarch tokenizer (lines 83-123)

```typescript
monaco.languages.setMonarchTokensProvider('napkin-markdown', {
  tokenizer: {
    root: [
      [/^#{1,6}\s.*$/, 'heading'],
      // Role-prefixed comments — MUST come before generic //
      [/\/\/A:.*$/, 'comment.architect'],
      [/\/\/DU:.*$/, 'comment.user'],
      [/\/\/FS:.*$/, 'comment.fs-eng'],
      [/\/\/TA:.*$/, 'comment.test-arch'],
      [/\/\/TE:.*$/, 'comment.test-eng'],
      // Generic comment
      [/\/\/.*$/, 'comment'],
      // Bold: **text**
      [/\*\*/, 'bold.marker', '@bold'],
      // Inline code: `text`
      [/`[^`]+`/, 'inline-code'],
      // Bullet marker
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

**Key design:** Role-prefixed comments MUST come before generic `//` — first match wins in Monarch. Bold uses a nested state (`@bold`) to handle the closing `**`. Comment says this explicitly with "MUST come before generic //".

---

## routing-rules.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/routing-rules.ts
**Lines:** 1-195 (entire file)
**What it does:** Two routing functions in one file: `route()` for sidebar clicks → pane routing, `routeLink()` for link clicks → action routing. Plus all path resolution helpers.

### route() — sidebar click routing (lines 6-45)

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
  if (ctx.agent) return { pane: 'right', surface: 'terminal' };
  if (ctx.filePath && isNapPath(ctx.filePath)) return { pane: 'left', surface: 'monaco' };
  return { pane: 'right', surface: 'terminal' };
}

function isNapPath(filePath: string): boolean {
  const segments = filePath.split('/');
  return segments.some((seg) => seg === '.nap');
}
```

**Key design:** isNapPath splits on `/` and checks for exact `.nap` segment — won't match `.nappy` or `kidnap`. Test file (routing-rules.test.ts) explicitly tests these edge cases.

### routeLink() — link classification (lines 48-121)

```typescript
export type LinkResult =
  | { action: 'openCode'; path: string; fallbackPath?: string; line?: number; col?: number }
  | { action: 'openDoc'; path: string }
  | { action: 'openExternal'; url: string };

export function routeLink(ctx: LinkContext): LinkResult {
  const { href, sourceFilePath } = ctx;

  // External links
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return { action: 'openExternal', url: href };
  }

  const parsed = parseLinkHref(href);

  // Extension wins: .md → openDoc
  const ext = getExtension(parsed.path);
  if (ext === '.md') {
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    return { action: 'openDoc', path: resolved };
  }

  // Everything else → openCode with two-root resolution
  const projectRoot = extractProjectRoot(sourceFilePath);

  if (parsed.path.startsWith('/')) {
    // Absolute → project root relative
    const resolved = normalizePath(projectRoot + parsed.path);
    return { action: 'openCode', path: resolved, line: parsed.line, col: parsed.col };
  }

  if (parsed.path.startsWith('./') || parsed.path.startsWith('../')) {
    const resolved = resolveRelative(parsed.path, sourceFilePath);
    return { action: 'openCode', path: resolved, line: parsed.line, col: parsed.col };
  }

  // Bare path → primary = dirname, fallback = projectRoot
  const primary = resolveRelative(parsed.path, sourceFilePath);
  const fallback = normalizePath(projectRoot + '/' + parsed.path);
  return {
    action: 'openCode',
    path: primary,
    fallbackPath: primary !== fallback ? fallback : undefined,
    line: parsed.line,
    col: parsed.col,
  };
}
```

**Key design:** "Extension wins over :line suffix" — `changelog.md:15` is openDoc, not openCode. Three path resolution strategies: absolute (project root), relative (dirname), bare (both with fallback). Comment on line 72 makes this explicit.

### parseLinkHref (lines 125-143)

```typescript
export function parseLinkHref(href: string): { path: string; line?: number; col?: number } {
  // Handle #L42 anchor style (markdown links)
  const anchorMatch = href.match(/^(.+?)#L(\d+)$/);
  if (anchorMatch) {
    return { path: anchorMatch[1], line: parseInt(anchorMatch[2], 10) };
  }

  // Handle :line or :line:col style
  const lineColMatch = href.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (lineColMatch) {
    return {
      path: lineColMatch[1],
      line: parseInt(lineColMatch[2], 10),
      col: lineColMatch[3] ? parseInt(lineColMatch[3], 10) : undefined,
    };
  }

  return { path: href };
}
```

**Key design:** Two line-number formats: `#L42` (GitHub-style anchors in markdown links) and `:42:17` (terminal-style path:line:col). Checked in that order.

### extractProjectRoot (lines 154-163)

```typescript
export function extractProjectRoot(sourceFilePath: string): string {
  const napIdx = sourceFilePath.indexOf('/.nap/');
  if (napIdx !== -1) return sourceFilePath.slice(0, napIdx);
  if (sourceFilePath.startsWith('.nap/')) return '.';
  const segments = sourceFilePath.split('/');
  const napSegIdx = segments.indexOf('.nap');
  if (napSegIdx > 0) return segments.slice(0, napSegIdx).join('/');
  if (napSegIdx === 0) return '.';
  return getDirname(sourceFilePath);
}
```

**Key design:** Finds `.nap/` in the path and takes everything before it as project root. Handles absolute paths, relative paths, and falls back to dirname for non-.nap paths. This is what makes `/src/model.ts` resolve to `<projectRoot>/src/model.ts` in napkin links.

### normalizePath (lines 177-195)

```typescript
function normalizePath(p: string): string {
  const parts = p.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '') {
      if (result.length === 0) result.push('');
      continue;
    }
    if (part === '..') {
      if (result.length > 1 || (result.length === 1 && result[0] !== '')) {
        result.pop();
      }
      continue;
    }
    result.push(part);
  }
  return result.join('/') || '.';
}
```

**Key design:** Pure path normalization — no Node.js imports. Handles `.`, `..`, leading `/`. Preserves absolute paths (leading `/` becomes empty string in result). Returns `.` for empty result.

---

## themes.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/themes.ts
**Lines:** 1-312 (entire file)
**What it does:** Defines the ThemeDef interface, 5 themes, and applies themes to both Monaco and CSS custom properties.

### ThemeDef interface (lines 8-31)

```typescript
export interface ThemeDef {
  name: string;
  monacoTheme: monaco.editor.IStandaloneThemeData;
  shell: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    bgHover: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textDim: string;
    accent: string;
    link: string;
  };
  roleColors: {
    architect: string;
    user: string;
    'fs-eng': string;
    'test-arch': string;
    'test-eng': string;
  };
}
```

**Key design:** Three layers per theme: (1) monacoTheme for the editor, (2) shell for app-wide CSS vars, (3) roleColors for per-role coloring in both contexts. The shell properties use camelCase, converted to kebab-case CSS variables via `camelToKebab`.

### tokenRules factory (lines 35-61)

```typescript
function tokenRules(roleColors, opts) {
  return [
    { token: 'heading', foreground: opts.heading, fontStyle: 'bold' },
    { token: 'bullet.marker', foreground: opts.bulletMarker },
    { token: 'bold', fontStyle: 'bold' },
    { token: 'bold.marker', foreground: opts.boldMarker },
    { token: 'inline-code', foreground: opts.inlineCode, background: opts.inlineCodeBg },
    // comment foreground = comment.user foreground (tokenizer tweak)
    { token: 'comment', foreground: roleColors.user.slice(1) },
    { token: 'comment.architect', foreground: roleColors.architect.slice(1) },
    { token: 'comment.user', foreground: roleColors.user.slice(1) },
    { token: 'comment.fs-eng', foreground: roleColors['fs-eng'].slice(1) },
    { token: 'comment.test-arch', foreground: roleColors['test-arch'].slice(1) },
    { token: 'comment.test-eng', foreground: roleColors['test-eng'].slice(1) },
    { token: 'source', foreground: opts.source },
  ];
}
```

**Key design:** `.slice(1)` strips the `#` from hex color codes — Monaco token rules take bare hex without `#`. Comment explicitly states: "comment foreground = comment.user foreground" — generic `//` comments have the same color as `//DU:` comments. This is tested in theme-system.test.ts (TK-01).

### THEMES array (lines 270-276)

```typescript
export const THEMES: ThemeDef[] = [
  dark,
  lightCream,
  lightGray,
  lightSepia,
  lightBlue,
];
```

**Key design:** 5 themes: 1 dark + 4 light variants. Array order = rotation order for Cmd+T cycling. Comment says "comment out entries to remove from rotation".

### applyTheme (lines 296-306)

```typescript
export function applyTheme(theme: ThemeDef): void {
  monaco.editor.setTheme(theme.name);

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.shell)) {
    root.style.setProperty(`--nap-${camelToKebab(key)}`, value);
  }
  for (const [role, color] of Object.entries(theme.roleColors)) {
    root.style.setProperty(`--nap-role-${role}`, color);
  }
}
```

**Key design:** Dual application: Monaco `setTheme()` for editor, CSS custom properties on `:root` for app shell. Every shell property becomes `--nap-<kebab-key>`, every role becomes `--nap-role-<role>`.

---

## TabBar.tsx — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/TabBar.tsx
**Lines:** 1-97 (entire file)
**What it does:** Shared tab bar component used by BOTH ContentPane and TerminalPane.

### Interface (lines 1-9)

```typescript
import type { Tab } from './store';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onPin: (tabId: string) => void;
}
```

### Key interactions (lines 43-50)

```typescript
onClick={() => onActivate(tab.id)}
onDoubleClick={() => onPin(tab.id)}
onMouseDown={(e) => {
  // Middle-click close
  if (e.button === 1) {
    e.preventDefault();
    onClose(tab.id);
  }
}}
```

**Key design:** Three interactions: click = activate, double-click = pin, middle-click = close. Close button is invisible by default (opacity: 0), shows on hover.

### Ephemeral styling (line 63)

```typescript
fontStyle: tab.ephemeral ? 'italic' : 'normal',
```

**Key design:** Ephemeral tabs rendered in italic — matches VS Code convention where ephemeral/preview tabs use italic.

### Label logic (lines 33-37)

```typescript
const label = tab.title
  ? tab.title
  : tab.type === 'terminal'
    ? tab.path.split('-').slice(-2).join('-')
    : basename(tab.path);
```

**Key design:** Terminal tabs show last two segments of ID (agent name pattern), file tabs show basename. Custom title overrides both.

---

## content-link-provider.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/content-link-provider.ts
**Lines:** 1-149 (entire file)
**What it does:** Monaco LinkProvider for napkin-markdown. Detects three kinds of links and routes them via routeLink.

### Three regex patterns (lines 11-18)

```typescript
const BARE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;
const MD_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;
```

### detectLinks — priority-based detection (lines 26-81)

```typescript
function detectLinks(lineContent: string, lineNumber: number): ContentLink[] {
  const links: ContentLink[] = [];
  const seen = new Set<string>(); // Avoid overlapping matches

  // 1. Markdown links first (highest priority)
  // 2. Bare URLs
  // 3. Bare file paths (lowest priority — skip if inside markdown link or URL)
```

**Key design:** Uses a `seen` set indexed by `lineNumber:column` to prevent overlapping matches. Markdown links → URLs → bare paths in priority order. File paths check for URL prefix via backward walk.

### registerContentLinkProvider (lines 87-124)

```typescript
export function registerContentLinkProvider(
  editor: monaco.editor.IStandaloneCodeEditor,
  getSourceFilePath: () => string | null,
  onResult: (result: LinkResult) => void,
): monaco.IDisposable {
  return monaco.languages.registerLinkProvider('napkin-markdown', {
    provideLinks(model) {
      // Walk all lines, detect links
      for (let i = 1; i <= lineCount; i++) { ... }
      return { links };
    },
    resolveLink(link) {
      const result = routeLink({ href, sourceFilePath });
      link.url = `nap-link://${encodeURIComponent(JSON.stringify(result))}`;
      return link;
    },
  });
}
```

**SURPRISING:** The `nap-link://` protocol is a clever hack. Monaco wants URLs for links, but the app needs to intercept clicks. So `resolveLink` stashes the serialized `LinkResult` in a custom protocol URL. The click handler then parses it back out. This avoids fighting Monaco's built-in link opener.

### handleLinkClick (lines 129-149)

```typescript
export function handleLinkClick(url, sourceFilePath, onResult): boolean {
  if (url.startsWith('nap-link://')) {
    const result = JSON.parse(decodeURIComponent(url.slice('nap-link://'.length)));
    onResult(result);
    return true;
  }
  // Direct href — classify and route
  const result = routeLink({ href: url, sourceFilePath });
  onResult(result);
  return true;
}
```

**Key design:** Two code paths: (1) pre-resolved nap-link:// protocol (from linkProvider), (2) direct href (from Cmd+click interception in ContentPane).

---

## git-gutter.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/git-gutter.ts
**Lines:** 1-35 (entire file)
**What it does:** Pure function that converts GutterHunk[] to Monaco deltaDecorations.

```typescript
export interface GutterHunk {
  type: 'add' | 'modify' | 'delete';
  startLine: number;
  endLine: number;
}

const GUTTER_CLASS: Record<string, string> = {
  add: 'git-gutter-added',
  modify: 'git-gutter-modified',
  delete: 'git-gutter-deleted',
};

export function applyGitGutter(
  editor: monaco.editor.IStandaloneCodeEditor,
  hunks: GutterHunk[],
  oldDecorations: string[],
): string[] {
  const newDecorations = hunks.map((hunk) => ({
    range: new monaco.Range(hunk.startLine, 1, hunk.endLine, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: GUTTER_CLASS[hunk.type],
    },
  }));
  return editor.deltaDecorations(oldDecorations, newDecorations);
}
```

**Key design:** Uses `linesDecorationsClassName` (not `glyphMarginClassName`). Returns new decoration IDs for delta tracking. The CSS classes are defined in TerminalPane.tsx's `ensureCss()`. 35 lines total — the simplest module in the feature set.

---

## markdown-renderer.ts — Full Architecture [VERIFIED]

**File:** packages/v3/src/renderer/markdown-renderer.ts
**Lines:** 1-82 (entire file)
**What it does:** Converts markdown to HTML with data-source-line attributes and role comment styling.

### Source line plugin (lines 22-36)

```typescript
md.core.ruler.push('source_line', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting === 1) {
      token.attrSet('data-source-line', String(token.map[0] + 1));
    }
    if (token.children) {
      for (const child of token.children) {
        if (child.map && child.nesting === 1) {
          child.attrSet('data-source-line', String(child.map[0] + 1));
        }
      }
    }
  }
});
```

**Key design:** `token.map[0] + 1` — markdown-it uses 0-indexed lines, Monaco uses 1-indexed. The `+1` converts. `nesting === 1` means only opening tags (not closing or self-closing). This means `<hr>` (nesting=0) does NOT get data-source-line — noted as a known gap in the test (rendered-mode.test.ts line 119).

### Role comment text renderer (lines 40-59)

```typescript
md.renderer.rules.text = (tokens, idx, options, env, self) => {
  const content = tokens[idx].content;
  const roleMatch = content.match(/^\/\/(\w+):\s/);
  if (roleMatch) {
    const prefix = roleMatch[1];
    const role = ROLE_PREFIXES[prefix];
    if (role) {
      const escaped = md.utils.escapeHtml(content);
      return `<span class="role-comment role-${role}">${escaped}</span>`;
    }
  }
  return defaultTextRender(tokens, idx, options, env, self);
};
```

### Post-process regex for mid-paragraph role comments (lines 67-82)

```typescript
export function renderMarkdown(source: string): string {
  const html = md.render(source);
  return html.replace(
    /\/\/(A|DU|FS|TA|TE):\s([^<]*)/g,
    (match, prefix, rest) => {
      const role = ROLE_PREFIXES[prefix];
      if (role) {
        return `<span class="role-comment role-${role}">//${prefix}: ${rest}</span>`;
      }
      return match;
    },
  );
}
```

**Key design:** Two-pass role detection: (1) text renderer catches role comments at start of text tokens, (2) post-process regex catches mid-paragraph patterns. This handles both `* //A: text` (list item where //A: is the text token) and `paragraph with //A: inline` patterns.

---

## Store — Tab + Right Pane + Theme + Render Mode State [VERIFIED]

**File:** packages/v3/src/renderer/store.ts
**Lines:** 1-469 (entire file)

### Tab interface (lines 9-17)

```typescript
export interface Tab {
  id: string;
  path: string;
  type: 'file' | 'terminal';
  ephemeral: boolean;
  title?: string;
  scrollPos?: number;
  cursorPos?: { lineNumber: number; column: number };
}
```

### TERMINAL_TAB_ID sentinel (line 8)

```typescript
export const TERMINAL_TAB_ID = '__terminal__';
```

**Key design:** The terminal tab has a special sentinel ID. This is how the store prevents duplicate terminal tabs and prevents closing it.

### New state fields (lines 39-50)

```typescript
// ── Tab + right pane state ──
rightPaneMode: 'terminal' | 'code';
rightFilePath: string | null;
rightFileLine: number | null;
leftTabs: Tab[];
activeLeftTabId: string | null;
rightTabs: Tab[];
activeRightTabId: string | null;

// ── Theme + render mode ──
currentThemeName: string;
leftPaneRenderMode: 'edit' | 'rendered';
```

### New actions (lines 56-76)

```typescript
openCode: (opts: { path: string; line?: number; col?: number }) => void;
openDoc: (path: string) => void;
closeTab: (pane: 'left' | 'right', tabId: string) => void;
closeActiveTab: (pane: 'left' | 'right') => void;
pinTab: (pane: 'left' | 'right', tabId: string) => void;
pinActiveEphemeral: (pane: 'left' | 'right') => void;
saveTabScroll: (pane: 'left' | 'right', tabId: string, scrollPos: number, cursorPos?: Tab['cursorPos']) => void;
cycleTheme: () => void;
toggleRenderMode: () => void;
```

### Per-nepic memory maps (lines 79-84)

```typescript
const nepicTerminalMemory = new Map<string, string>();
const nepicFocusedCardMemory = new Map<string, string>();
const nepicFilePathMemory = new Map<string, string>();
const nepicLeftTabsMemory = new Map<string, { tabs: Tab[]; activeId: string | null }>();
const nepicRightTabsMemory = new Map<string, { tabs: Tab[]; activeId: string | null }>();
```

**Key design:** Per-nepic memory for tabs. When switching nepics, current tab state is saved to these maps and the target nepic's state is restored. Test in tabs-store.test.ts (T08).

### upsertTab (lines 100-123)

```typescript
function upsertTab(
  tabs: Tab[],
  path: string,
  type: 'file' | 'terminal',
  ephemeral: boolean,
): [Tab[], string] {
  // Existing tab with same path? → return it
  const existing = tabs.find((t) => t.path === path && t.type === type);
  if (existing) return [tabs, existing.id];

  // Reuse ephemeral slot?
  if (ephemeral) {
    const ephIdx = tabs.findIndex((t) => t.ephemeral);
    if (ephIdx !== -1) {
      const updated = [...tabs];
      updated[ephIdx] = { ...updated[ephIdx], path, type };
      return [updated, updated[ephIdx].id];
    }
  }

  // Create new tab
  const tab: Tab = { id: nextTabId(), path, type, ephemeral };
  return [[...tabs, tab], tab.id];
}
```

**Key design:** Three outcomes: (1) existing tab found → reuse, (2) ephemeral slot available → replace in-place (preserves tab ID), (3) no match → create new. Ephemeral tab reuse is what makes "single-click preview" work — each new click replaces the preview tab.

### setActiveTerminal — sentinel terminal tab (lines 241-269)

```typescript
setActiveTerminal: (id: string) => {
  const prev = get();
  const allAgents = [...prev.napkins.flatMap((n) => n.agents), ...prev.architects];
  const agent = allAgents.find((a) => a.id === id);
  const title = agent?.name ?? id;

  const existingIdx = prev.rightTabs.findIndex((t) => t.id === TERMINAL_TAB_ID);
  let tabs: Tab[];
  if (existingIdx !== -1) {
    tabs = prev.rightTabs.map((t) =>
      t.id === TERMINAL_TAB_ID ? { ...t, path: id, title } : t,
    );
  } else {
    const termTab: Tab = { id: TERMINAL_TAB_ID, path: id, type: 'terminal', ephemeral: false, title };
    tabs = [termTab, ...prev.rightTabs];
  }

  set({
    activeTerminalId: id,
    rightPaneMode: 'terminal',
    rightTabs: tabs,
    activeRightTabId: TERMINAL_TAB_ID,
  });
},
```

**Key design:** ONE terminal tab with sentinel ID. When you switch agents, the tab is UPDATED (path/title changed), not replaced. Terminal tab always prepended to position 0. Always pinned (ephemeral: false). Lookup agent name from both napkins.agents and architects.

### closeTab — terminal protection (lines 298-323)

```typescript
closeTab: (pane: 'left' | 'right', tabId: string) => {
  if (pane === 'right') {
    const tab = prev.rightTabs.find((t) => t.id === tabId);
    if (tab?.id === TERMINAL_TAB_ID) return; // can never be closed
    ...
  }
}
```

### openCode (lines 276-286)

```typescript
openCode: (opts: { path: string; line?: number; col?: number }) => {
  const prev = get();
  const [tabs, tabId] = upsertTab(prev.rightTabs, opts.path, 'file', true);
  set({
    rightPaneMode: 'code',
    rightFilePath: opts.path,
    rightFileLine: opts.line ?? null,
    rightTabs: tabs,
    activeRightTabId: tabId,
  });
},
```

**Key design:** Sets rightPaneMode to 'code' — this triggers TerminalPane to show CodeEditor instead of Terminal. File tabs are always ephemeral until pinned.

### openDoc (lines 288-296)

```typescript
openDoc: (path: string) => {
  const prev = get();
  const [tabs, tabId] = upsertTab(prev.leftTabs, path, 'file', true);
  set({
    activeFilePath: path,
    leftTabs: tabs,
    activeLeftTabId: tabId,
  });
},
```

### cycleTheme (lines 420-427)

```typescript
cycleTheme: () => {
  const current = get().currentThemeName;
  const idx = THEMES.findIndex((t) => t.name === current);
  const next = THEMES[(idx + 1) % THEMES.length];
  set({ currentThemeName: next.name });
  applyTheme(next);
  persistUiState({ theme: next.name });
},
```

**Key design:** Wrapping modulo rotation through THEMES array. Calls applyTheme immediately. Persists to ui-state.json via IPC.

### toggleRenderMode (lines 429-433)

```typescript
toggleRenderMode: () => {
  const next = get().leftPaneRenderMode === 'edit' ? 'rendered' : 'edit';
  set({ leftPaneRenderMode: next });
  persistUiState({ leftPaneRenderMode: next });
},
```

### UI state persistence (lines 437-469)

```typescript
function persistUiState(partial) {
  if (typeof window !== 'undefined' && window.electronAPI?.saveUiState) {
    window.electronAPI.saveUiState(partial);
  }
}

export async function loadPersistedUiState(): Promise<void> {
  const state = await window.electronAPI.loadUiState();
  if (typeof state.theme === 'string') {
    const theme = findTheme(state.theme);
    updates.currentThemeName = theme.name;
  }
  if (state.leftPaneRenderMode === 'edit' || state.leftPaneRenderMode === 'rendered') {
    updates.leftPaneRenderMode = state.leftPaneRenderMode;
  }
  ...
}
```

**Key design:** Validation on load: only 'edit' or 'rendered' accepted for render mode. Unknown theme names fall back to THEMES[0]. Tested in rendered-mode.test.ts (RM-07) and theme-system.test.ts (TH-03, TH-04).

---

## main.ts — New IPC Channels [VERIFIED]

**File:** packages/v3/src/main/main.ts
**Lines:** 1-385 (entire file)

### file:exists IPC (lines 246-253)

```typescript
ipcMain.handle('file:exists', async (_event, filePath: string) => {
  try {
    await nodeFsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
});
```

**Used by:** ContentPane's handleResult for two-root fallback resolution.

### file:git-diff IPC (lines 257-285)

```typescript
ipcMain.handle('file:git-diff', async (_event, filePath: string) => {
  return new Promise<ReturnType<typeof parseGitDiff>>((resolve) => {
    // Check if file is tracked
    execFile('git', ['ls-files', '--error-unmatch', filePath], { cwd: projectCwd }, (lsErr) => {
      if (lsErr) {
        // Untracked file — all lines are "added"
        nodeFsPromises.readFile(filePath, 'utf-8').then((content) => {
          const lineCount = content.split('\n').length;
          resolve(lineCount > 0 ? [{ type: 'add', startLine: 1, endLine: lineCount }] : []);
        }).catch(() => resolve([]));
        return;
      }
      // Tracked file — run git diff
      execFile('git', ['diff', '--unified=0', 'HEAD', '--', filePath], { ... }, (err, stdout) => {
        resolve(parseGitDiff(stdout));
      });
    });
  });
});
```

**Key design:** Two-step: first `git ls-files --error-unmatch` to check if tracked. If untracked, treats ALL lines as "added" (green gutter). If tracked, runs `git diff --unified=0 HEAD` and parses. `--unified=0` means no context lines — just the hunks.

### shell:open-external IPC (lines 201-203)

```typescript
ipcMain.on('shell:open-external', (_event, url: string) => {
  shell.openExternal(url);
});
```

### code:watch + code:changed IPC (lines 288-300)

```typescript
const codeWatcher = new ContentWatcher({
  onChange: (filePath, content) => {
    if (!win.isDestroyed()) {
      win.webContents.send('code:changed', filePath, content);
    }
  },
  isPendingWrite: () => false, // Code pane is read-only, no echo suppression
});

ipcMain.on('code:watch', (_event, filePath: string | null) => {
  codeWatcher.watch(filePath);
});
```

**Key design:** Two ContentWatcher instances: one for left pane (file:watch/file:changed), one for right pane (code:watch/code:changed). Right pane watcher has `isPendingWrite: () => false` because it's read-only.

---

## preload.ts — New IPC Channels [VERIFIED]

**File:** packages/v3/src/main/preload.ts
**Lines:** 1-91 (entire file)

### New channels (lines 80-91)

```typescript
// ── File operations (0200 — link routing, git gutter, code pane) ──
fileExists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
fileGitDiff: (filePath: string) => ipcRenderer.invoke('file:git-diff', filePath),
onCodeChanged: (cb: (filePath: string, content: string) => void) => {
  const handler = (_event: IpcRendererEvent, filePath: string, content: string) =>
    cb(filePath, content);
  ipcRenderer.on('code:changed', handler);
  return () => ipcRenderer.removeListener('code:changed', handler);
},
codeWatch: (filePath: string | null) => ipcRenderer.send('code:watch', filePath),
shellOpenExternal: (url: string) => ipcRenderer.send('shell:open-external', url),
```

---

## git-diff-parser.ts [VERIFIED]

**File:** packages/v3/src/main/git-diff-parser.ts
**Lines:** 1-49 (entire file)
**What it does:** Pure function that parses `git diff --unified=0` output into DiffHunk[].

```typescript
export function parseGitDiff(output: string): DiffHunk[] {
  if (!output || output.includes('Binary files') && output.includes('differ')) {
    return [];
  }

  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

  while ((match = hunkRegex.exec(output)) !== null) {
    const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    if (newCount === 0) {
      hunks.push({ type: 'delete', startLine: newStart, endLine: newStart });
    } else if (oldCount === 0) {
      hunks.push({ type: 'add', startLine: newStart, endLine: newStart + newCount - 1 });
    } else {
      hunks.push({ type: 'modify', startLine: newStart, endLine: newStart + newCount - 1 });
    }
  }
  return hunks;
}
```

**Key design:** Classification logic based on oldCount and newCount: newCount=0 → delete, oldCount=0 → add, both non-zero → modify. Omitted count defaults to 1 (per git diff format). Skips binary files.

---

## content-watcher.ts [VERIFIED]

**File:** packages/v3/src/main/content-watcher.ts
**Lines:** 1-93 (entire file)
**What it does:** Watches a single file for external changes using @parcel/watcher.

**Key design decisions:**
- Uses @parcel/watcher (not chokidar) — better performance for single-file watching
- Debounce (200ms default) to coalesce rapid writes
- Content dedup: `lastContent` comparison prevents firing for no-change events
- Echo suppression via `isPendingWrite` callback — checked BEFORE and AFTER debounce
- Watches the PARENT DIRECTORY, filters by basename — handles atomic writes (temp+rename pattern)

---

## file-link-provider.ts [VERIFIED]

**File:** packages/v3/src/renderer/file-link-provider.ts
**Lines:** 1-93 (entire file)
**What it does:** xterm.js ILinkProvider for terminal file path detection. Used in index.tsx to make file paths in terminal output clickable.

### FILE_PATH_REGEX (line 12)

```typescript
export const FILE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;
```

**Same regex as content-link-provider.ts BARE_PATH_REGEX.** Matches paths with optional line:col.

### isUrl guard (lines 14-21)

```typescript
function isUrl(text: string, startIndex: number): boolean {
  let i = startIndex - 1;
  while (i >= 0 && text[i] !== ' ' && text[i] !== '\t') i--;
  const token = text.slice(i + 1);
  return /^https?:\/\//.test(token);
}
```

**Same backward-walk pattern** as in content-link-provider.ts line 67-70.

### Integration with routeLink (in index.tsx lines 168-184)

```typescript
entry.terminal.registerLinkProvider(
  createFileLinkProvider(
    entry.terminal,
    () => '/',
    (rawMatch) => {
      const store = useNapStore.getState();
      const result = routeLink({ href: rawMatch, sourceFilePath: '' });
      if (result.action === 'openDoc') store.openDoc(result.path);
      else if (result.action === 'openCode') store.openCode({ path: result.path, line: result.line, col: result.col });
      else if (result.action === 'openExternal') window.electronAPI?.shellOpenExternal(result.url);
    },
  ),
);
```

**Key design:** Terminal links use `sourceFilePath: ''` — no source context, so routeLink treats paths as-is. `getCwd: () => '/'` means paths resolve from root.

---

## index.tsx — Layout + Key Bindings [VERIFIED]

**File:** packages/v3/src/renderer/index.tsx
**Lines:** 1-254 (entire file)

### Global keyboard shortcuts (lines 200-234)

```typescript
// Cmd+B → toggle sidebar, Cmd+D → toggle debug panel, Cmd+` → toggle kanban, Cmd+W → close tab
// Cmd+T → cycle theme, Cmd+Shift+J → toggle render mode
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { toggleSidebar(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') { toggleDebugPanel(); }
    if ((e.metaKey || e.ctrlKey) && e.key === '`') { toggleKanban(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      const state = useNapStore.getState();
      if (state.activeLeftTabId) state.closeActiveTab('left');
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 't') { cycleTheme(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'J') { toggleRenderMode(); }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [toggleSidebar, toggleDebugPanel, toggleKanban]);
```

**Key design:** Cmd+W closes left pane active tab (not right — prevents accidentally closing terminal). Cmd+T cycles theme. Cmd+Shift+J toggles rendered mode. 

### Window type declaration (lines 17-49)

```typescript
declare global {
  interface Window {
    __napStore__: typeof useNapStore;
    electronAPI: {
      // ... full type declaration for all IPC channels
      fileExists: (filePath: string) => Promise<boolean>;
      fileGitDiff: (filePath: string) => Promise<Array<{ type: 'add' | 'modify' | 'delete'; startLine: number; endLine: number }>>;
      onCodeChanged: (cb: (filePath: string, content: string) => void) => () => void;
      codeWatch: (filePath: string | null) => void;
      shellOpenExternal: (url: string) => void;
    };
  }
}
```

### Layout (lines 236-251)

```typescript
return (
  <div style={{ display: 'flex', height: '100%', background: 'var(--nap-bg)' }}>
    <KanbanOverlay />
    {nepics.length > 0 && <Gutter />}
    {sidebarVisible && <Sidebar />}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ... }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ContentPane />
        <ResizeHandle />
        <TerminalPane />
      </div>
      <DebugPanel />
    </div>
  </div>
);
```

**Key design:** ContentPane and TerminalPane side by side with a drag-resize handle. Both in a flex row. All using CSS custom properties from theme system.

---

## Test Coverage Summary [VERIFIED]

### Small tests (vitest):
- **routing-rules.test.ts** — sidebar click routing (4 describe blocks, edge cases for .nap path matching)
- **link-routing.test.ts** — routeLink function (7 describe blocks: code paths, markdown links, md extension, external links, path resolution, edge cases, parseLinkHref, extractProjectRoot)
- **tabs-store.test.ts** — tab lifecycle (T01-T08: ephemeral creation, reuse, pinning, coexistence, terminal tab, Cmd-W, per-nepic memory, openCode right pane)
- **right-pane-store.test.ts** — rightPaneMode state (P01-P04: defaults, openCode sets all fields, setActiveTerminal resets mode, openCode doesn't change activeTerminalId)
- **terminal-tab-refactor.test.ts** — sentinel terminal tab (TT-01 through TT-05: no accumulation, position 0, title from agent name, can't close, file tabs unaffected)
- **terminal-link-routing.test.ts** — terminal → routeLink integration (TL-01 through TL-03: .nap links → openDoc, code links → openCode with line, URLs not misrouted)
- **theme-system.test.ts** — theme validation (TH-01 through TH-04: structure validation, cycleTheme rotation, persistence, fallback. TK-01: comment color equals user color)
- **rendered-mode.test.ts** — rendered mode (RM-01 through RM-04, RM-07: toggleRenderMode state, global mode across tabs, source line mapping, role comment styling, persistence)
- **git-diff-parser.test.ts** — parseGitDiff (G01-G05: added/modified/deleted hunks, empty input, edge cases)
- **shift-enter.test.ts** — detectLinePattern (SE01-SE05: full pattern, bullet only, indent only, break-out detection)
- **git-gutter-race.test.ts** — model identity guard pattern (GG-04: decorations skipped on model change, applied on same model, reference identity)

### Medium tests (Playwright):
- **tabs.spec.ts** — T07 (tab close disposes model), T09 (editing auto-pins), T10 (middle-click close)
- **theme-css.spec.ts** — TH-05 (CSS variables on :root), TH-06 (Monaco setTheme for all themes)
- **rendered-mode.spec.ts** — TS-01 (tabSize config), RM-05 (Cmd+click→edit at source line), RM-06 (link click routes)

---

## Data Flow Traces

### Flow 1: User clicks link in napkin → file opens in right pane

1. **ContentPane.tsx line 180** — Monaco `onMouseDown` fires with Cmd+Click
2. **ContentPane.tsx lines 193-232** — Regex match determines link type (markdown/URL/path)
3. **content-link-provider.ts line 129** — `handleLinkClick(href, sourceFilePath, handleResult)`
4. **routing-rules.ts line 74** — `routeLink()` classifies: code/doc/external
5. **ContentPane.tsx line 148** — `handleResult()` dispatches action
6. **ContentPane.tsx line 153** — For bare paths: `fileExists` IPC checks primary path
7. **main.ts line 246** — `file:exists` handler uses `fs.access()`
8. **ContentPane.tsx line 155** — If primary exists: `store.openCode({path, line, col})`
9. **store.ts line 276** — `openCode`: upsertTab → set rightPaneMode='code'
10. **TerminalPane.tsx line 254** — `rightPaneMode === 'code'` renders CodeEditor
11. **TerminalPane.tsx line 123** — CodeEditor loads file via `fileRead` IPC
12. **TerminalPane.tsx line 135** — `revealLineInCenter` + yellow highlight decoration

### Flow 2: User types in editor → auto-save → git gutter refresh

1. **ContentPane.tsx line 96** — `onDidChangeModelContent` fires
2. **ContentPane.tsx line 102** — `pinActiveEphemeral('left')` — pins ephemeral tab
3. **ContentPane.tsx line 104** — `suppressExternalRef.current = true`
4. **ContentPane.tsx line 105** — 1s debounce timer starts
5. **ContentPane.tsx line 107** — `fileWrite(filePath, content)` IPC
6. **main.ts line 218** — `file:write` handler writes, adds to pendingContentWrites
7. **ContentPane.tsx line 109** — 500ms later: `suppressExternalRef = false`
8. **ContentPane.tsx line 111** — `refreshGitGutter(filePath)`
9. **ContentPane.tsx line 134** — 200ms debounce in refreshGitGutter
10. **ContentPane.tsx line 139** — Captures model reference
11. **main.ts line 257** — `file:git-diff` handler: git ls-files, then git diff
12. **git-diff-parser.ts line 22** — `parseGitDiff` returns DiffHunk[]
13. **ContentPane.tsx line 142** — Model identity guard check
14. **git-gutter.ts line 21** — `applyGitGutter` → `deltaDecorations`

### Flow 3: Theme switch

1. **index.tsx line 225** — Cmd+T → `cycleTheme()`
2. **store.ts line 420** — Find next theme in THEMES array (modulo wrap)
3. **store.ts line 424** — `set({ currentThemeName: next.name })`
4. **themes.ts line 297** — `monaco.editor.setTheme(theme.name)` — updates ALL Monaco editors
5. **themes.ts line 300** — Sets CSS variables on `document.documentElement.style`
6. **store.ts line 426** — `persistUiState({ theme: next.name })`
7. **preload.ts line 56** — `save-ui-state` IPC → main process
8. **main.ts line 303** — `model.saveUiState(state)` → writes ui-state.json

### Flow 4: Rendered mode toggle

1. **index.tsx line 228** — Cmd+Shift+J → `toggleRenderMode()`
2. **store.ts line 429** — Flips `leftPaneRenderMode` between 'edit' and 'rendered'
3. **ContentPane.tsx line 424** — Editor container display toggles: 'block' ↔ 'none'
4. **ContentPane.tsx line 428** — Rendered div conditionally mounts/unmounts
5. **ContentPane.tsx line 316** — Effect fires: `renderMarkdown(model.getValue())`
6. **markdown-renderer.ts line 66** — markdown-it render + source line attrs + role comment spans
7. **ContentPane.tsx line 321** — `renderedRef.current.innerHTML = html`

---

## Surprising Findings

1. **Operator precedence bug?** — ContentPane.tsx line 180: `e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && e.event.ctrlKey || e.event.metaKey`. Without explicit parens, this is `(type===CONTENT_TEXT && ctrlKey) || metaKey`. So metaKey alone (without type check) would pass. Works in practice because the `if` also checks `position`, but the intent was clearly `type===CONTENT_TEXT && (ctrlKey || metaKey)`.

2. **HR elements don't get data-source-line** — markdown-renderer.ts: `<hr>` has `nesting=0` (self-closing), so the source_line plugin skips it. The test explicitly documents this as a "known gap" (rendered-mode.test.ts line 119).

3. **Same regex in two files** — `FILE_PATH_REGEX` (file-link-provider.ts line 12) and `BARE_PATH_REGEX` (content-link-provider.ts line 12) are identical. Not DRY, but they're in different contexts (terminal vs editor).

4. **`nap-link://` custom protocol** — content-link-provider.ts line 120. Serializes LinkResult as JSON into a URL. Clever workaround for Monaco's link API which expects URLs.

5. **Two ContentWatcher instances** — main.ts has TWO watchers: `contentWatcher` (line 231) for left pane with echo suppression, `codeWatcher` (line 289) for right pane without echo suppression (read-only).

6. **Terminal tab can NEVER be closed** — store.ts line 311: `if (tab?.id === TERMINAL_TAB_ID) return;`. The sentinel approach means one tab is immortal. Test in terminal-tab-refactor.test.ts (TT-04).

7. **window.__monaco__ exposed at line 24** — ContentPane.tsx. Not just for debug — medium tests use it to query editor state. Same pattern as `window.__napStore__`.

8. **`.slice(1)` on hex colors** — themes.ts line 53. Monaco token rules take `'ce9178'` not `'#ce9178'`. The slice strips the `#`.
