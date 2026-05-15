import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore } from './store';
import { TabBar } from './TabBar';
import { registerNapkinMarkdown, registerShiftEnter } from './napkin-markdown';
import { handleLinkClick } from './content-link-provider';
import { applyGitGutter } from './git-gutter';
import { registerThemes, applyTheme, findTheme } from './themes';
import { renderMarkdown, initShiki } from './markdown-renderer';
import { roleDecoClass } from './role-palette';
import { routeLink } from './routing-rules';
import type { LinkResult } from './routing-rules';
import { syncEditToRendered, syncRenderedToEdit } from './scroll-sync';

// Inject rendered-mode CSS once
let cssInjected = false;
function ensureRenderedCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nap-rendered pre,
    .nap-rendered pre.shiki {
      border-radius: 6px;
      padding: 12px 16px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0;
    }
    .nap-rendered pre.nap-code-block {
      background: var(--nap-bg-secondary);
      border: 1px solid var(--nap-border);
    }
    .nap-rendered code {
      font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    }
    .nap-rendered p code {
      background: var(--nap-bg-secondary);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 13px;
    }
    .nap-rendered table {
      border-collapse: collapse;
      margin: 8px 0;
      width: 100%;
    }
    .nap-rendered th, .nap-rendered td {
      border: 1px solid var(--nap-border);
      padding: 6px 10px;
      text-align: left;
    }
    .nap-rendered th {
      background: var(--nap-bg-secondary);
      font-weight: 600;
    }
    .nap-rendered h1, .nap-rendered h2, .nap-rendered h3,
    .nap-rendered h4, .nap-rendered h5, .nap-rendered h6 {
      color: var(--nap-text);
      margin: 16px 0 8px 0;
    }
    .nap-rendered h1 { font-size: 1.5em; }
    .nap-rendered h2 { font-size: 1.3em; }
    .nap-rendered h3 { font-size: 1.15em; }
    .nap-rendered a {
      color: var(--nap-link);
      text-decoration: underline;
      cursor: pointer;
    }
    .nap-rendered hr {
      border: none;
      border-top: 1px solid var(--nap-border);
      margin: 16px 0;
    }
    .nap-rendered blockquote {
      border-left: 3px solid var(--nap-accent);
      padding-left: 12px;
      margin: 8px 0;
      color: var(--nap-text-muted);
    }
    .nap-rendered .role-comment {
      display: inline;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(128,128,128,0.1);
    }
    .nap-rendered ul, .nap-rendered ol {
      padding-left: 24px;
      margin: 4px 0;
    }
    .nap-rendered li {
      margin: 2px 0;
    }
    .git-gutter-added {
      border-left: 3px solid #22c55e !important;
      margin-left: 3px;
    }
    .git-gutter-modified {
      border-left: 3px solid #3b82f6 !important;
      margin-left: 3px;
    }
    .git-gutter-deleted {
      border-left: 3px solid transparent !important;
      margin-left: 3px;
    }
    .git-gutter-deleted::after {
      content: '';
      position: absolute;
      left: 0;
      top: -3px;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid #ef4444;
    }
  `;
  document.head.appendChild(style);
}

// Register language + themes once
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  ensureRenderedCss();
  registerNapkinMarkdown();
  registerThemes();
  // Apply initial theme from persisted state
  const themeName = useNapStore.getState().currentThemeName;
  applyTheme(findTheme(themeName));
  // Shiki init moved to component-level useEffect (needs state to trigger re-render)
  // Expose Monaco for medium tests (same pattern as window.__napStore__)
  (window as any).__monaco__ = monaco;
}

// Configure Monaco workers (ESM approach — no external plugin needed)
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    );
  },
};

export function ContentPane() {
  const activeFilePath = useNapStore((s) => s.activeFilePath);
  const leftTabs = useNapStore((s) => s.leftTabs);
  const activeLeftTabId = useNapStore((s) => s.activeLeftTabId);
  const leftPaneRenderMode = useNapStore((s) => s.leftPaneRenderMode);
  const currentThemeName = useNapStore((s) => s.currentThemeName);
  const fileReloadVersion = useNapStore((s) => s._fileReloadVersion);
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
  const roleDecorationsRef = useRef<string[]>([]);
  const contentDisposableRef = useRef<monaco.IDisposable | null>(null);
  const prevModeRef = useRef(leftPaneRenderMode);
  const [shikiLoaded, setShikiLoaded] = useState(false);

  // Detect if the active tab is a ghost
  const activeTab = leftTabs.find((t) => t.id === activeLeftTabId);
  const isGhost = activeTab?.ghost === true;

  // Initialize shiki (async — flips shikiLoaded when ready, triggering re-render of code blocks)
  useEffect(() => {
    initShiki().then(() => setShikiLoaded(true));
  }, []);

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    ensureRegistered();

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

    editorRef.current = editor;

    // Register shift-enter keybinding
    shiftEnterDisposableRef.current = registerShiftEnter(editor);

    // Re-request git gutter on editor focus (debounced — catches stale decorations)
    editor.onDidFocusEditorText(() => {
      clearTimeout(focusGutterTimerRef.current);
      focusGutterTimerRef.current = setTimeout(() => {
        const filePath = useNapStore.getState().activeFilePath;
        if (filePath) refreshGitGutter(filePath);
      }, 300);
    });

    // Auto-save on change (1s debounce)
    editor.onDidChangeModelContent(() => {
      // Refresh role comment decorations immediately
      refreshRoleDecorations();

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

    // ResizeObserver → editor.layout()
    const observer = new ResizeObserver(() => {
      editor.layout();
    });
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(gutterTimerRef.current);
      clearTimeout(focusGutterTimerRef.current);
      shiftEnterDisposableRef.current?.dispose();
      observer.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  // Refresh git gutter decorations — 200ms delay + model identity guard
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

  // Apply role comment decorations — scan for //XX: and color by hash
  function refreshRoleDecorations() {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const lineCount = model.getLineCount();
    const roleRegex = /\/\/(\w+):/g;

    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i);
      let match: RegExpExecArray | null;
      roleRegex.lastIndex = 0;
      while ((match = roleRegex.exec(line)) !== null) {
        const prefix = match[1];
        const cls = roleDecoClass(prefix);
        const startCol = match.index + 1;
        const endCol = line.length + 1; // color to end of line
        decorations.push({
          range: new monaco.Range(i, startCol, i, endCol),
          options: { inlineClassName: cls },
        });
        break; // one role comment per line
      }
    }

    roleDecorationsRef.current = editor.deltaDecorations(roleDecorationsRef.current, decorations);
  }

  // Handle link clicks from Monaco
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

  // Wire up link click handling via Monaco's opener service
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Override the default opener to handle our links
    const disposable = (editor as any).getContribution?.('editor.linkDetector');

    // Alternative: intercept via onMouseDown
    const mouseDisposable = editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && e.event.ctrlKey || e.event.metaKey) {
        // Cmd/Ctrl+Click on text — check if there's a link
        const position = e.target.position;
        if (!position) return;
        const model = editor.getModel();
        if (!model) return;
        const lineContent = model.getLineContent(position.lineNumber);
        const sourceFilePath = useNapStore.getState().activeFilePath;
        if (!sourceFilePath) return;

        // Find if click position is within a detected link
        const col = position.column;
        // Check markdown links
        const mdRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = mdRegex.exec(lineContent)) !== null) {
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          if (col >= start && col < end) {
            e.event.preventDefault();
            handleLinkClick(match[2], sourceFilePath, handleResult);
            return;
          }
        }

        // Check bare URLs
        const urlRegex = /https?:\/\/[^\s)>\]]+/g;
        while ((match = urlRegex.exec(lineContent)) !== null) {
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          if (col >= start && col < end) {
            e.event.preventDefault();
            handleLinkClick(match[0], sourceFilePath, handleResult);
            return;
          }
        }

        // Check bare file paths
        const pathRegex = /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;
        while ((match = pathRegex.exec(lineContent)) !== null) {
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          if (col >= start && col < end) {
            // Skip if inside URL
            let i = match.index - 1;
            while (i >= 0 && lineContent[i] !== ' ' && lineContent[i] !== '\t') i--;
            const token = lineContent.slice(i + 1);
            if (/^https?:\/\//.test(token)) continue;
            e.event.preventDefault();
            handleLinkClick(match[0], sourceFilePath, handleResult);
            return;
          }
        }
      }
    });

    return () => mouseDisposable.dispose();
  }, []);

  // Load file when activeFilePath changes (or ghost promotion triggers reload)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let aborted = false;

    if (!activeFilePath) {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      contentDisposableRef.current?.dispose();
      contentDisposableRef.current = null;
      editor.setModel(null);
      gutterDecorationsRef.current = [];
      window.electronAPI?.fileWatch(null);
      return;
    }

    (async () => {
      const content = await window.electronAPI?.fileRead(activeFilePath);
      if (aborted) return;

      if (content === null || content === undefined) {
        if (modelRef.current) {
          modelRef.current.dispose();
          modelRef.current = null;
        }
        contentDisposableRef.current?.dispose();
        contentDisposableRef.current = null;
        editor.setModel(null);
        gutterDecorationsRef.current = [];
        window.electronAPI?.fileWatch(null);

        const state = useNapStore.getState();
        const tab = state.leftTabs.find((t) => t.path === activeFilePath);
        if (tab && !tab.ghost) {
          // Start watcher BEFORE setting ghost flag — when external code sees
          // ghost=true, the subscription is guaranteed ready.
          await window.electronAPI?.watchGhost(activeFilePath);
          const leftTabs = useNapStore.getState().leftTabs.map((t) =>
            t.path === activeFilePath ? { ...t, ghost: true } : t,
          );
          useNapStore.setState({ leftTabs });
        }
        return;
      }

      if (aborted) return;

      if (modelRef.current) {
        modelRef.current.dispose();
      }
      contentDisposableRef.current?.dispose();

      const model = monaco.editor.createModel(content, 'napkin-markdown');
      modelRef.current = model;
      editor.setModel(model);
      gutterDecorationsRef.current = [];

      window.electronAPI?.fileWatch(activeFilePath);
      refreshGitGutter(activeFilePath);
      refreshRoleDecorations();

      const currentMode = useNapStore.getState().leftPaneRenderMode;
      if (currentMode === 'rendered' && renderedRef.current) {
        renderedRef.current.innerHTML = renderMarkdown(content, shikiTheme);
      }

      contentDisposableRef.current = model.onDidChangeContent(() => {
        const mode = useNapStore.getState().leftPaneRenderMode;
        if (mode === 'rendered' && renderedRef.current) {
          renderedRef.current.innerHTML = renderMarkdown(model.getValue(), shikiTheme);
        }
      });
    })();

    return () => {
      aborted = true;
      clearTimeout(saveTimerRef.current);
    };
  }, [activeFilePath, fileReloadVersion]);

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

      model.setValue(content);

      if (editor && position) {
        editor.setPosition(position);
      }
      if (editor && scrollTop !== undefined) {
        editor.setScrollTop(scrollTop);
      }

      // Refresh git gutter + role decorations
      if (filePath) refreshGitGutter(filePath);
      refreshRoleDecorations();
    });

    return unsub;
  }, []);

  // Rendered mode: generate HTML when mode or theme changes
  // (Tab switch rendering is handled in the file load effect above)
  const shikiTheme = findTheme(currentThemeName).shikiTheme;

  useEffect(() => {
    if (leftPaneRenderMode !== 'rendered' || !renderedRef.current) return;
    const model = modelRef.current;
    if (!model) return;
    renderedRef.current.innerHTML = renderMarkdown(model.getValue(), shikiTheme);
  }, [leftPaneRenderMode, shikiTheme, shikiLoaded]);

  // Scroll sync on mode toggle
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = leftPaneRenderMode;
    if (prevMode === leftPaneRenderMode) return;

    const editor = editorRef.current;
    const rendered = renderedRef.current;
    if (!editor || !rendered) return;

    if (prevMode === 'edit' && leftPaneRenderMode === 'rendered') {
      // Edit → rendered: match scroll position
      // Run after a microtask so rendered HTML has been populated by the effect above
      queueMicrotask(() => syncEditToRendered(editor, rendered));
    } else if (prevMode === 'rendered' && leftPaneRenderMode === 'edit') {
      // Rendered → edit: rendered div is visibility:hidden so scrollTop/offsetTop are preserved
      syncRenderedToEdit(editor, rendered);
      setTimeout(() => editor.focus(), 0);
    }
  }, [leftPaneRenderMode]);

  // Rendered view click handler: links → routeLink, Cmd+click → edit at source line
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

  return (
    <div
      data-testid="content-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--nap-bg)',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
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
      {/* Placeholder — visible when no file open */}
      {!activeFilePath && leftTabs.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--nap-text-muted)',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 14,
          }}
        >
          no file open
        </div>
      )}
      {/* Ghost tab placeholder — file not found */}
      {isGhost && (
        <div
          data-testid="ghost-placeholder"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--nap-text-muted)',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 14,
            opacity: 0.5,
          }}
        >
          file not found
        </div>
      )}
      {/* Stacked layers: editor + rendered, both always mounted and laid out.
          visibility:hidden preserves scrollTop/offsetTop so scroll sync works. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* Editor layer */}
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: activeFilePath && !isGhost && leftPaneRenderMode === 'edit' ? 1 : 0,
            visibility: activeFilePath && !isGhost && leftPaneRenderMode === 'edit' ? 'visible' : 'hidden',
          }}
        />
        {/* Rendered layer */}
        <div
          ref={renderedRef}
          data-testid="rendered-view"
          className="nap-rendered"
          onClick={handleRenderedClick}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'auto',
            padding: '16px 24px',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--nap-text-secondary)',
            cursor: 'default',
            zIndex: activeFilePath && !isGhost && leftPaneRenderMode === 'rendered' ? 1 : 0,
            visibility: activeFilePath && !isGhost && leftPaneRenderMode === 'rendered' ? 'visible' : 'hidden',
          }}
        />
      </div>
    </div>
  );
}
