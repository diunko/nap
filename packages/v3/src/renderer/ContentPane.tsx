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

// Register language + themes once
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
      gutterDecorationsRef.current = [];
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
      gutterDecorationsRef.current = [];

      // Start watching this file
      window.electronAPI?.fileWatch(activeFilePath);

      // Load git gutter
      refreshGitGutter(activeFilePath);
    })();

    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, [activeFilePath]);

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

      // Refresh git gutter
      if (filePath) refreshGitGutter(filePath);
    });

    return unsub;
  }, []);

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
      {/* Editor container — always mounted, hidden in rendered mode */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: activeFilePath && leftPaneRenderMode === 'edit' ? 'block' : 'none',
        }}
      />
      {/* Rendered view — visible in rendered mode */}
      {activeFilePath && leftPaneRenderMode === 'rendered' && (
        <div
          ref={renderedRef}
          data-testid="rendered-view"
          className="nap-rendered"
          onClick={handleRenderedClick}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '16px 24px',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--nap-text-secondary)',
            cursor: 'default',
          }}
        />
      )}
    </div>
  );
}
