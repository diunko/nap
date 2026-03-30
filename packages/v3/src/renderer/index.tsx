import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { Terminal } from './Terminal';
import { DebugPanel } from './DebugPanel';
import { useNapStore } from './store';
import { createTerminalInstance, getTerminal, disposeTerminal } from './terminal-registry';
import { createFileLinkProvider } from './file-link-provider';
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
    };
  }
}

window.__napStore__ = useNapStore;

function App() {
  const applySnapshot = useNapStore((s) => s.applySnapshot);
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);

  // Wire snapshot IPC
  useEffect(() => {
    if (window.electronAPI?.onSnapshot) {
      window.electronAPI.onSnapshot((snapshot) => {
        applySnapshot(snapshot);
      });
    }
  }, [applySnapshot]);

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
            (filePath) => window.electronAPI?.openFilePath(filePath),
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

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTerminalId ? (
          <Terminal />
        ) : (
          <div style={{ flex: 1, color: '#ccc', padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
            v3
          </div>
        )}
      </div>
      <DebugPanel />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
