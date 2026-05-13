import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore } from './store';
import { TabBar } from './TabBar';
import { Terminal } from './Terminal';

// Language detection from file extension
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

// Inject CSS for line highlight animation (once)
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

function CodeEditor() {
  const rightFilePath = useNapStore((s) => s.rightFilePath);
  const rightFileLine = useNapStore((s) => s.rightFileLine);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    ensureCss();

    const editor = monaco.editor.create(containerRef.current, {
      readOnly: true,
      theme: 'napkin-dark',
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

    editorRef.current = editor;

    // ResizeObserver
    const observer = new ResizeObserver(() => editor.layout());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  // Load file when rightFilePath changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!rightFilePath) {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      editor.setModel(null);
      window.electronAPI?.codeWatch(null);
      return;
    }

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

    return () => {
      decorationsRef.current = [];
    };
  }, [rightFilePath, rightFileLine]);

  // Listen for external code file changes
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

  return (
    <div
      ref={containerRef}
      data-testid="code-editor"
      style={{ flex: 1, minHeight: 0 }}
    />
  );
}

export function TerminalPane() {
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const rightPaneMode = useNapStore((s) => s.rightPaneMode);
  const rightTabs = useNapStore((s) => s.rightTabs);
  const activeRightTabId = useNapStore((s) => s.activeRightTabId);
  const rightFilePath = useNapStore((s) => s.rightFilePath);

  const hasContent = rightTabs.length > 0;

  return (
    <div
      data-testid="terminal-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
      {/* Tab bar */}
      <TabBar
        tabs={rightTabs}
        activeTabId={activeRightTabId}
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

      {/* Content */}
      {!hasContent && (
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
          no agent selected
        </div>
      )}

      {/* Terminal surface — keep alive but hidden when code is active */}
      <div style={{
        flex: 1,
        display: rightPaneMode === 'terminal' && activeTerminalId ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {activeTerminalId && <Terminal />}
      </div>

      {/* Code surface */}
      {rightPaneMode === 'code' && rightFilePath && (
        <CodeEditor />
      )}
    </div>
  );
}
