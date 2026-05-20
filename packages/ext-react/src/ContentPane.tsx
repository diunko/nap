import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useNapStore, useSession } from './session';
import { TabBar } from './TabBar';
import { registerNapkinMarkdown, registerShiftEnter } from './napkin-markdown';
import { registerTheme, applyTheme } from './theme';
import { roleDecoClass, generatePaletteCss } from './role-palette';
import { routeLink, resolveDiffUrl } from './link-routing';
import type { LinkResult, MainRepoConfig, DiffRoutingContext } from './link-routing';
import { detectLinks } from './content-link-provider';

// Register language + theme once
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerNapkinMarkdown();
  registerTheme();
  applyTheme();

  // Inject role palette CSS + link decoration CSS
  const style = document.createElement('style');
  style.textContent = generatePaletteCss(false) + '\n' +
    '.nap-link { text-decoration: underline; color: var(--nap-link); }\n' +
    '.nap-link-hover { color: var(--nap-accent) !important; cursor: pointer; }';
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

function IdlePane() {
  const mainRepoConfig = useNapStore((s) => s.mainRepoConfig);

  return (
    <div
      data-testid="idle-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--nap-text-muted)',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 12,
        gap: 4,
      }}
    >
      {mainRepoConfig ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--nap-text)' }}>
            {mainRepoConfig.owner}/{mainRepoConfig.repo}
          </div>
          <div>{mainRepoConfig.branch}</div>
        </>
      ) : (
        <div style={{ fontSize: 14 }}>no file open</div>
      )}
    </div>
  );
}

interface ContentPaneProps {
  adapter: { readFile: (path: string) => Promise<string>; writeFile: (path: string, content: string) => Promise<void> } | null;
  model: { suppressEcho: (suppress: boolean) => void } | null;
}

export function ContentPane({ adapter, model }: ContentPaneProps) {
  const { store } = useSession();
  const activeFilePath = useNapStore((s) => s.activeFilePath);
  const tabs = useNapStore((s) => s.tabs);
  const activeTabId = useNapStore((s) => s.activeTabId);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const roleDecorationsRef = useRef<string[]>([]);
  const linkDecorationsRef = useRef<string[]>([]);
  const hoverDecorationsRef = useRef<string[]>([]);
  const shiftEnterDisposableRef = useRef<monaco.IDisposable | null>(null);
  // With key={session.key} on Panel, this component remounts on session change.
  // Closures safely capture adapter, model, store — they're stable for this lifetime.

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
      refreshLinkDecorations();
      clearTimeout(saveTimerRef.current);
      const filePath = store.getState().activeFilePath;
      if (!filePath || !adapter) return;

      // Pin ephemeral tab on first edit
      console.log(`[contentpane] contentChanged → pinActiveEphemeral`);
      store.getState().pinActiveEphemeral();

      saveTimerRef.current = setTimeout(async () => {
        console.log(`[contentpane] autoSave debounce 1000ms`);
        const content = editor.getValue();
        const currentModel = model;
        const currentAdapter = adapter;
        if (!currentAdapter) return;
        currentModel?.suppressEcho(true);
        console.log(`[adapter] writeFile ${filePath}`);
        await currentAdapter.writeFile(filePath, content);
        // Keep suppress active briefly for echo
        setTimeout(() => { currentModel?.suppressEcho(false); }, 500);
      }, 1000);
    });

    // Build diff routing context from current store state
    function getDiffCtx(): DiffRoutingContext | undefined {
      const s = store.getState();
      if (s.prNum > 0 && s.prDiffRanges) {
        return { prNum: s.prNum, prDiffRanges: s.prDiffRanges };
      }
      return undefined;
    }

    // Link click handling via onMouseDown
    editor.onMouseDown((e) => {
      console.log(`[links] onMouseDown target=${e.target.type} meta=${e.event.metaKey} ctrl=${e.event.ctrlKey}`);
      if (!(e.event.ctrlKey || e.event.metaKey)) return;
      // Accept CONTENT_TEXT (6) for real clicks, or UNKNOWN (0) for synthetic
      // events where Monaco can't hit-test (isTrusted=false). For UNKNOWN,
      // fall back to the editor's cursor position.
      const isContentText = e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT;
      const isUnknown = e.target.type === monaco.editor.MouseTargetType.UNKNOWN;
      if (!isContentText && !isUnknown) return;
      {
        const position = isContentText ? e.target.position : editor.getPosition();
        if (!position) return;
        const editorModel = editor.getModel();
        if (!editorModel) return;
        const lineContent = editorModel.getLineContent(position.lineNumber);
        const sourceFilePath = store.getState().activeFilePath;
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
            handleLinkResult(routeLink({ href: match[2], sourceFilePath }, store.getState().mainRepoConfig ?? undefined, getDiffCtx()));
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
            handleLinkResult(routeLink({ href: match[0], sourceFilePath }, store.getState().mainRepoConfig ?? undefined, getDiffCtx()));
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
            handleLinkResult(routeLink({ href: match[0], sourceFilePath }, store.getState().mainRepoConfig ?? undefined, getDiffCtx()));
            return;
          }
        }
      }
    });

    // Cmd+hover: add temporary nap-link-hover decoration
    editor.onMouseMove((e) => {
      if (!e.event.metaKey) {
        if (hoverDecorationsRef.current.length > 0) {
          hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, []);
          console.log('[contentpane] link-hover cleared');
        }
        return;
      }

      const position = e.target.position;
      if (!position) {
        if (hoverDecorationsRef.current.length > 0) {
          hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, []);
          console.log('[contentpane] link-hover cleared');
        }
        return;
      }

      const editorModel = editor.getModel();
      if (!editorModel) return;

      const lineContent = editorModel.getLineContent(position.lineNumber);
      const links = detectLinks(lineContent, position.lineNumber);
      const col = position.column;

      let hoverLink = null;
      for (const link of links) {
        if (col >= link.range.startColumn && col < link.range.endColumn) {
          hoverLink = link;
          break;
        }
      }

      if (hoverLink) {
        console.log(`[contentpane] link-hover on line ${position.lineNumber}`);
        hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, [{
          range: new monaco.Range(
            hoverLink.range.startLineNumber, hoverLink.range.startColumn,
            hoverLink.range.endLineNumber, hoverLink.range.endColumn,
          ),
          options: { inlineClassName: 'nap-link-hover' },
        }]);
      } else if (hoverDecorationsRef.current.length > 0) {
        hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, []);
        console.log('[contentpane] link-hover cleared');
      }
    });

    // Keyup: clear hover decorations when Meta released
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' && hoverDecorationsRef.current.length > 0) {
        hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, []);
        console.log('[contentpane] link-hover cleared');
      }
    };
    // Keydown: clear hover if a non-meta key pressed (meta no longer held)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && hoverDecorationsRef.current.length > 0) {
        hoverDecorationsRef.current = editor.deltaDecorations(hoverDecorationsRef.current, []);
        console.log('[contentpane] link-hover cleared');
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleKeyDown);

    // ResizeObserver → editor.layout()
    const observer = new ResizeObserver(() => editor.layout());
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(saveTimerRef.current);
      shiftEnterDisposableRef.current?.dispose();
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleKeyDown);
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

  function refreshLinkDecorations() {
    const editor = editorRef.current;
    if (!editor) return;
    const editorModel = editor.getModel();
    if (!editorModel) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const lineCount = editorModel.getLineCount();

    for (let i = 1; i <= lineCount; i++) {
      const line = editorModel.getLineContent(i);
      const links = detectLinks(line, i);
      for (const link of links) {
        decorations.push({
          range: new monaco.Range(
            link.range.startLineNumber, link.range.startColumn,
            link.range.endLineNumber, link.range.endColumn,
          ),
          options: { inlineClassName: 'nap-link' },
        });
      }
    }

    linkDecorationsRef.current = editor.deltaDecorations(linkDecorationsRef.current, decorations);
    console.log(`[contentpane] refreshLinkDecorations (${decorations.length} links)`);
  }

  function navigateGitHubTab(url: string) {
    console.log(`[chrome] navigate → ${url}`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId == null) return;
      // Try content script first (SPA-friendly), fall back to chrome.tabs.update
      chrome.tabs.sendMessage(tabId, { type: 'navigate', url }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          console.log('[chrome] content script unavailable, falling back to tabs.update');
          chrome.tabs.update(tabId, { url });
        }
      });
    });
  }

  function handleLinkResult(result: LinkResult) {
    console.log(`[links] routeLink →`, result);
    if (result.action === 'openDoc') {
      store.getState().openDoc(result.path);
    } else if (result.action === 'openCode') {
      // Check if it's a diff URL placeholder that needs async resolution
      if (result.githubUrl.startsWith('__DIFF_URL__:')) {
        resolveDiffUrl(result.githubUrl).then(navigateGitHubTab).catch((e) => {
          console.warn('[links] diff URL resolution failed, falling back to blob:', e);
          // Fallback: build blob URL
          const config = store.getState().mainRepoConfig;
          if (config) {
            const fallback = `https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${result.githubUrl.split(':')[2]}`;
            navigateGitHubTab(fallback);
          }
        });
      } else {
        navigateGitHubTab(result.githubUrl);
      }
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
      // Layout after setModel — Monaco needs to measure with real content.
      // Deferred one frame so the browser has applied any pending
      // visibility changes (editor surface hidden → visible).
      requestAnimationFrame(() => editor.layout());
      refreshRoleDecorations();
      refreshLinkDecorations();
      console.log(`[contentpane] refreshRoleDecorations`);

      // Restore scroll/cursor from tab state
      const state = store.getState();
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
      // Flush pending auto-save before switching files — edits must not be lost
      if (saveTimerRef.current !== undefined) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
        const ed = editorRef.current;
        const currentAdapter = adapter;
        const currentModel = model;
        if (ed && currentAdapter && activeFilePath) {
          const content = ed.getValue();
          currentModel?.suppressEcho(true);
          console.log(`[contentpane] flush auto-save on file switch: ${activeFilePath}`);
          currentAdapter.writeFile(activeFilePath, content).then(() => {
            setTimeout(() => { currentModel?.suppressEcho(false); }, 500);
          });
        }
      }
    };
  }, [activeFilePath, adapter]);

  // Listen for external file changes (from model layer)
  useEffect(() => {
    if (!adapter) return;
    function handleExternalChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail.path !== store.getState().activeFilePath) return;
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
        refreshLinkDecorations();
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
      const state = store.getState();
      if (state.activeTabId) {
        state.saveTabScroll(state.activeTabId, editor.getScrollTop(), editor.getPosition() ?? undefined);
      }
    };
  }, [activeFilePath]);

  return (
    <div
      data-testid="content-pane"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--nap-bg)',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
      {/* Idle pane — visible when no file open, shows repo/branch context */}
      {!activeFilePath && <IdlePane />}
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
