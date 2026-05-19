import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore } from './store';
import { TabBar } from './TabBar';
import { registerNapkinMarkdown, registerShiftEnter } from './napkin-markdown';
import { registerTheme, applyTheme } from './theme';
import { roleDecoClass, generatePaletteCss } from './role-palette';
import { routeLink } from './link-routing';
import type { LinkResult, MainRepoConfig } from './link-routing';
import { detectLinks } from './content-link-provider';

// Register language + theme once
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
  registerTheme();
  applyTheme();

  // Inject role palette CSS
  const style = document.createElement('style');
  style.textContent = generatePaletteCss(false);
  document.head.appendChild(style);

  // Expose Monaco for tests
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

interface ContentPaneProps {
  adapter: { readFile: (path: string) => Promise<string>; writeFile: (path: string, content: string) => Promise<void> } | null;
  model: { suppressEcho: (suppress: boolean) => void } | null;
}

export function ContentPane({ adapter, model }: ContentPaneProps) {
  const activeFilePath = useNapStore((s) => s.activeFilePath);
  const tabs = useNapStore((s) => s.tabs);
  const activeTabId = useNapStore((s) => s.activeTabId);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const roleDecorationsRef = useRef<string[]>([]);
  const shiftEnterDisposableRef = useRef<monaco.IDisposable | null>(null);
  // Refs for stable access inside closures (auto-save, event handlers)
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const modelPropRef = useRef(model);
  modelPropRef.current = model;

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    ensureRegistered();

    const editor = monaco.editor.create(containerRef.current, {
      language: 'napkin-markdown',
      theme: 'light-blue',
      wordWrap: 'on',
      minimap: { enabled: false },
      lineNumbers: 'off',
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      tabSize: 2,
      insertSpaces: true,
      fontSize: 13,
      fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      folding: false,
      glyphMargin: true,
      lineDecorationsWidth: 8,
      padding: { top: 12, bottom: 12 },
    });

    editorRef.current = editor;
    shiftEnterDisposableRef.current = registerShiftEnter(editor);

    // Auto-save on change (1s debounce)
    editor.onDidChangeModelContent(() => {
      refreshRoleDecorations();
      clearTimeout(saveTimerRef.current);
      const filePath = useNapStore.getState().activeFilePath;
      if (!filePath || !adapter) return;

      // Pin ephemeral tab on first edit
      console.log(`[contentpane] contentChanged → pinActiveEphemeral`);
      useNapStore.getState().pinActiveEphemeral();

      saveTimerRef.current = setTimeout(async () => {
        console.log(`[contentpane] autoSave debounce 1000ms`);
        const content = editor.getValue();
        const currentModel = modelPropRef.current;
        const currentAdapter = adapterRef.current;
        if (!currentAdapter) return;
        currentModel?.suppressEcho(true);
        console.log(`[adapter] writeFile ${filePath}`);
        await currentAdapter.writeFile(filePath, content);
        // Keep suppress active briefly for echo
        setTimeout(() => { currentModel?.suppressEcho(false); }, 500);
      }, 1000);
    });

    // Link click handling via onMouseDown
    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT && (e.event.ctrlKey || e.event.metaKey)) {
        const position = e.target.position;
        if (!position) return;
        const editorModel = editor.getModel();
        if (!editorModel) return;
        const lineContent = editorModel.getLineContent(position.lineNumber);
        const sourceFilePath = useNapStore.getState().activeFilePath;
        if (!sourceFilePath) return;
        const col = position.column;

        // Check markdown links
        const mdRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = mdRegex.exec(lineContent)) !== null) {
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          if (col >= start && col < end) {
            e.event.preventDefault();
            handleLinkResult(routeLink({ href: match[2], sourceFilePath }, useNapStore.getState().mainRepoConfig ?? undefined));
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
            handleLinkResult(routeLink({ href: match[0], sourceFilePath }, useNapStore.getState().mainRepoConfig ?? undefined));
            return;
          }
        }

        // Check bare file paths
        const pathRegex = /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;
        while ((match = pathRegex.exec(lineContent)) !== null) {
          const start = match.index + 1;
          const end = match.index + match[0].length + 1;
          if (col >= start && col < end) {
            let i = match.index - 1;
            while (i >= 0 && lineContent[i] !== ' ' && lineContent[i] !== '\t') i--;
            const token = lineContent.slice(i + 1);
            if (/^https?:\/\//.test(token)) continue;
            e.event.preventDefault();
            handleLinkResult(routeLink({ href: match[0], sourceFilePath }, useNapStore.getState().mainRepoConfig ?? undefined));
            return;
          }
        }
      }
    });

    // ResizeObserver → editor.layout()
    const observer = new ResizeObserver(() => editor.layout());
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(saveTimerRef.current);
      shiftEnterDisposableRef.current?.dispose();
      observer.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  function refreshRoleDecorations() {
    const editor = editorRef.current;
    if (!editor) return;
    const editorModel = editor.getModel();
    if (!editorModel) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const lineCount = editorModel.getLineCount();
    const roleRegex = /\/\/(\w+):/g;

    for (let i = 1; i <= lineCount; i++) {
      const line = editorModel.getLineContent(i);
      let match: RegExpExecArray | null;
      roleRegex.lastIndex = 0;
      while ((match = roleRegex.exec(line)) !== null) {
        const prefix = match[1];
        const cls = roleDecoClass(prefix);
        const startCol = match.index + 1;
        const endCol = line.length + 1;
        decorations.push({
          range: new monaco.Range(i, startCol, i, endCol),
          options: { inlineClassName: cls },
        });
        break; // one role comment per line
      }
    }

    roleDecorationsRef.current = editor.deltaDecorations(roleDecorationsRef.current, decorations);
  }

  function handleLinkResult(result: LinkResult) {
    console.log(`[links] routeLink →`, result);
    if (result.action === 'openDoc') {
      useNapStore.getState().openDoc(result.path);
    } else if (result.action === 'openCode') {
      console.log(`[chrome] tabs.update → ${result.githubUrl}`);
      // Navigate the GitHub tab
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        // The active tab is likely us (side panel), find the GitHub tab
        // Use the first tab that isn't the side panel
        if (tabs[0]?.id != null) {
          chrome.tabs.update(tabs[0].id, { url: result.githubUrl });
        }
      }).catch((e) => console.warn('[chrome] tabs.update failed:', e));
    } else if (result.action === 'openExternal') {
      window.open(result.url, '_blank');
    }
  }

  // Load file when activeFilePath changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !adapter) return;
    let aborted = false;

    if (!activeFilePath) {
      if (monacoModelRef.current) {
        monacoModelRef.current.dispose();
        monacoModelRef.current = null;
      }
      editor.setModel(null);
      return;
    }

    (async () => {
      console.log(`[contentpane] loadFile → readFile from LFS`);
      let content: string;
      try {
        console.log(`[adapter] readFile ${activeFilePath}`);
        content = await adapter.readFile(activeFilePath);
      } catch {
        console.log(`[contentpane] loadFile failed — file not found`);
        return;
      }
      if (aborted) return;

      if (monacoModelRef.current) {
        monacoModelRef.current.dispose();
      }

      const newModel = monaco.editor.createModel(content, 'napkin-markdown');
      monacoModelRef.current = newModel;
      editor.setModel(newModel);
      console.log(`[monaco] setModel napkin-markdown`);
      refreshRoleDecorations();
      console.log(`[contentpane] refreshRoleDecorations`);

      // Restore scroll/cursor from tab state
      const state = useNapStore.getState();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (tab?.scrollPos != null) {
        editor.setScrollTop(tab.scrollPos);
      }
      if (tab?.cursorPos) {
        editor.setPosition(tab.cursorPos);
      }
    })();

    return () => {
      aborted = true;
      clearTimeout(saveTimerRef.current);
    };
  }, [activeFilePath, adapter]);

  // Listen for external file changes (from model layer)
  useEffect(() => {
    if (!adapter) return;
    function handleExternalChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail.path !== useNapStore.getState().activeFilePath) return;
      const editor = editorRef.current;
      const currentModel = monacoModelRef.current;
      if (!editor || !currentModel) return;

      console.log(`[contentpane] externalChange → model.setValue (preserve cursor)`);
      const position = editor.getPosition();
      const scrollTop = editor.getScrollTop();

      adapter!.readFile(detail.path).then((content) => {
        currentModel.setValue(content);
        if (position) editor.setPosition(position);
        if (scrollTop !== undefined) editor.setScrollTop(scrollTop);
        refreshRoleDecorations();
      }).catch(() => {});
    }
    window.addEventListener('nap-external-change', handleExternalChange);
    return () => window.removeEventListener('nap-external-change', handleExternalChange);
  }, [adapter]);

  // Save scroll position before switching tabs
  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      if (!editor) return;
      const state = useNapStore.getState();
      if (state.activeTabId) {
        state.saveTabScroll(state.activeTabId, editor.getScrollTop(), editor.getPosition() ?? undefined);
      }
    };
  }, [activeFilePath]);

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
      {/* Placeholder — visible when no file open */}
      {!activeFilePath && tabs.length === 0 && (
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
      {/* Monaco editor container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          visibility: activeFilePath ? 'visible' : 'hidden',
        }}
      />
    </div>
  );
}
