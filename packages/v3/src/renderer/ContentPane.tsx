import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore } from './store';
import { registerNapkinMarkdown } from './napkin-markdown';

// Register language + theme once
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const suppressExternalRef = useRef(false);

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

    // ResizeObserver → editor.layout()
    const observer = new ResizeObserver(() => {
      editor.layout();
    });
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(saveTimerRef.current);
      observer.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
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

  return (
    <div
      data-testid="content-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
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
    </div>
  );
}
