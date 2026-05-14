import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { ContentPane } from './ContentPane';
import { TerminalPane } from './TerminalPane';
import { DebugPanel } from './DebugPanel';
import { KanbanOverlay } from './KanbanOverlay';
import { Gutter } from './Gutter';
import { useNapStore, loadPersistedUiState, persistFullUiState } from './store';
import { createTerminalInstance, getTerminal, disposeTerminal } from './terminal-registry';
import { createFileLinkProvider } from './file-link-provider';
import { routeLink } from './routing-rules';
import type { LinkResult } from './routing-rules';
import type { AppSnapshot } from '../shared/bridge-types';
import '@xterm/xterm/css/xterm.css';

// Expose store for Playwright tests
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
      fileExists: (filePath: string) => Promise<boolean>;
      fileGitDiff: (filePath: string) => Promise<Array<{ type: 'add' | 'modify' | 'delete'; startLine: number; endLine: number }>>;
      onCodeChanged: (cb: (filePath: string, content: string) => void) => () => void;
      codeWatch: (filePath: string | null) => void;
      shellOpenExternal: (url: string) => void;
      watchGhost: (filePath: string) => void;
      unwatchGhost: (filePath: string) => void;
      onGhostAppeared: (cb: (filePath: string, content: string) => void) => () => void;
    };
  }
}

window.__napStore__ = useNapStore;
(window as any).__getTerminal__ = getTerminal;

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

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: 'col-resize',
        flexShrink: 0,
        background: 'transparent',
        zIndex: 5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nap-accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    />
  );
}

function App() {
  const applySnapshot = useNapStore((s) => s.applySnapshot);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);
  const toggleSidebar = useNapStore((s) => s.toggleSidebar);
  const toggleDebugPanel = useNapStore((s) => s.toggleDebugPanel);
  const toggleKanban = useNapStore((s) => s.toggleKanban);
  const nepics = useNapStore((s) => s.nepics);

  // Wire snapshot IPC
  useEffect(() => {
    if (window.electronAPI?.onSnapshot) {
      window.electronAPI.onSnapshot((snapshot) => {
        applySnapshot(snapshot);
      });
    }
    // Load persisted UI state (debug panel, theme, tabs, terminal, card)
    loadPersistedUiState();
  }, [applySnapshot]);

  // Save full session state on quit
  useEffect(() => {
    const handler = () => { persistFullUiState(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Wire ghost tab watcher — promote ghost tabs when files reappear
  useEffect(() => {
    if (!window.electronAPI?.onGhostAppeared) return;
    const unsub = window.electronAPI.onGhostAppeared((filePath) => {
      useNapStore.getState().promoteGhostTab(filePath);
      window.electronAPI?.unwatchGhost(filePath);
    });
    return unsub;
  }, []);

  // Wire pty data → xterm terminals
  useEffect(() => {
    if (!window.electronAPI?.pty) return;

    const unsubData = window.electronAPI.pty.onData((id, data) => {
      const entry = getTerminal(id);
      if (entry) {
        entry.terminal.write(data);
      }
    });

    const unsubExit = window.electronAPI.pty.onExit((id) => {
      disposeTerminal(id);
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, []);

  // Create/dispose xterm terminals for running agents, wire keyboard → pty
  useEffect(() => {
    const state = useNapStore.getState();
    const allAgents = [
      ...state.napkins.flatMap((n) => n.agents),
      ...state.architects,
    ];

    for (const agent of allAgents) {
      if (agent.started && !agent.exited && !getTerminal(agent.id)) {
        const entry = createTerminalInstance(agent.id);
        // Keyboard input → pty
        entry.terminal.onData((data) => {
          window.electronAPI?.pty?.write(agent.id, data);
        });
        // File link provider
        entry.terminal.registerLinkProvider(
          createFileLinkProvider(
            entry.terminal,
            () => '/',
            (rawMatch) => {
              const store = useNapStore.getState();
              const result = routeLink({ href: rawMatch, sourceFilePath: '' });
              if (result.action === 'openDoc') {
                store.openDoc(result.path);
              } else if (result.action === 'openCode') {
                store.openCode({ path: result.path, line: result.line, col: result.col });
              } else if (result.action === 'openExternal') {
                window.electronAPI?.shellOpenExternal(result.url);
              }
            },
          ),
        );
        // Signal ready after next tick (terminal needs to be opened first)
        window.electronAPI?.pty?.ready(agent.id);
      }
    }

    // Set default active terminal if none set
    if (!state.activeTerminalId) {
      const firstRunning = allAgents.find((a) => a.running);
      if (firstRunning) {
        useNapStore.getState().setActiveTerminal(firstRunning.id);
      }
    }
  });

  // Cmd+B → toggle sidebar, Cmd+D → toggle debug panel, Cmd+` → toggle kanban, Cmd+W → close tab
  // Cmd+T → cycle theme, Cmd+Shift+J → toggle render mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        toggleDebugPanel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        toggleKanban();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        const state = useNapStore.getState();
        if (state.activeLeftTabId) {
          state.closeActiveTab('left');
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        useNapStore.getState().cycleTheme();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        useNapStore.getState().toggleRenderMode();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, toggleDebugPanel, toggleKanban]);

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--nap-bg)' }}>
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
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
