import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Terminal } from './components/Terminal';
import { Gutter } from './components/Gutter';
import { NapkinBrowser } from './components/NapkinBrowser';
import { KanbanOverlay } from './components/KanbanOverlay';
import { useTerminalStore } from './store';
import { getTerminal } from './terminal-registry';
import '@xterm/xterm/css/xterm.css';

function App() {
  const sidebarVisible = useTerminalStore((s) => s.sidebarVisible);

  useEffect(() => {
    // Route pty data to the correct xterm instance
    const removeDataListener = window.electronAPI.pty.onData((id, data) => {
      const entry = getTerminal(id);
      if (entry) entry.terminal.write(data);
    });

    // DEBUG: track viewportY changes to find what causes scroll jumps
    const scrollDebugInterval = setInterval(() => {
      const store = useTerminalStore.getState();
      const id = store.activeTerminalId;
      if (!id) return;
      const entry = getTerminal(id);
      if (!entry?.opened) return;
      const viewportY = entry.terminal.buffer.active.viewportY;
      const baseY = entry.terminal.buffer.active.baseY;
      const el = entry.terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null;
      const scrollTop = el?.scrollTop ?? -1;
      // Store last known values on the window for comparison
      const w = window as any;
      if (w._dbgLastViewportY !== viewportY || w._dbgLastBaseY !== baseY) {
        console.log(`[scroll-debug] viewportY=${viewportY} baseY=${baseY} scrollTop=${Math.round(scrollTop)} Δviewport=${viewportY - (w._dbgLastViewportY ?? viewportY)} ΔbaseY=${baseY - (w._dbgLastBaseY ?? baseY)}`);
        w._dbgLastViewportY = viewportY;
        w._dbgLastBaseY = baseY;
      }
    }, 50);

    // Handle pty exit
    const removeExitListener = window.electronAPI.pty.onExit((id, exitCode) => {
      const entry = getTerminal(id);
      if (entry) {
        entry.terminal.write(`\r\n\r\n[process exited with code ${exitCode}]`);
        entry.terminal.options.disableStdin = true;
      }
      const current = useTerminalStore.getState().terminals.find((t) => t.id === id);
      if (current?.status !== 'done') {
        useTerminalStore.getState().setStatus(id, 'exited');
      }
    });

    // Menu: toggle sidebar (Cmd+B)
    const removeSidebarListener = window.electronAPI.onToggleSidebar(() => {
      useTerminalStore.getState().toggleSidebar();
    });

    // Menu: new terminal (Cmd+T)
    const removeCreateListener = window.electronAPI.onCreateTerminal(() => {
      const id = useTerminalStore.getState().createTerminal('shell');
      useTerminalStore.getState().setActive(id);
    });

    // Menu: close active terminal (Cmd+W)
    const removeCloseListener = window.electronAPI.onCloseActiveTerminal(() => {
      useTerminalStore.getState().closeActiveTerminal();
    });

    // Menu: toggle scroll lock (Cmd+G) with double-press detection
    // First press: show blue border but don't scroll (pending state).
    // If second press within 500ms: enter read lock at saved position.
    // If timer fires: commit to follow lock (scroll to bottom).
    let pendingFollowTimer: ReturnType<typeof setTimeout> | undefined;
    let savedViewportY: number | null = null;
    const removeScrollLockListener = window.electronAPI.onToggleScrollLock(() => {
      const store = useTerminalStore.getState();
      const id = store.activeTerminalId;
      if (!id) return;
      const entry = getTerminal(id);
      if (!entry) return;

      const currentMode = entry.scrollLock.getMode();
      const isPending = pendingFollowTimer !== undefined;

      if (currentMode === 'off' && !isPending) {
        // First press: save viewport position, show blue border, start timer
        savedViewportY = entry.terminal.buffer.active.viewportY;
        store.setScrollLockMode(id, 'follow');
        pendingFollowTimer = setTimeout(() => {
          pendingFollowTimer = undefined;
          savedViewportY = null;
          entry.scrollLock.setMode('follow');
        }, 500);
      } else if (currentMode === 'off' && isPending) {
        // Double-press: cancel timer, enter read lock at saved position
        clearTimeout(pendingFollowTimer);
        pendingFollowTimer = undefined;
        entry.scrollLock.setMode('read', savedViewportY ?? undefined);
        store.setScrollLockMode(id, 'read');
        savedViewportY = null;
      } else {
        // From follow or read: go to off
        clearTimeout(pendingFollowTimer);
        pendingFollowTimer = undefined;
        savedViewportY = null;
        entry.scrollLock.setMode('off');
        store.setScrollLockMode(id, 'off');
      }
    });

    // Socket: new terminal created via CLI
    const removeSocketCreate = window.electronAPI.onSocketTerminalCreated((data) => {
      useTerminalStore.getState().addSocketTerminal(data.id, data.name, data.parentId, data.cwd, data.role, data.napkinSlug);
    });

    // Socket: peek at terminal via CLI
    const removeSocketPeek = window.electronAPI.onSocketPeek((data) => {
      useTerminalStore.getState().setActive(data.id);
      if (!useTerminalStore.getState().sidebarVisible) {
        useTerminalStore.getState().toggleSidebar();
      }
    });

    // Socket: close terminal via CLI
    const removeSocketClose = window.electronAPI.onSocketTerminalClose((data) => {
      useTerminalStore.getState().disposeTerminalOnly(data.id);
    });

    // Socket: status changed (e.g. done)
    const removeSocketStatus = window.electronAPI.onSocketStatusChanged((data) => {
      useTerminalStore.getState().setStatus(data.id, data.status as 'done');
    });

    // Napkin: filesystem data update
    const removeNapkinUpdate = window.electronAPI.onNapkinUpdate((data) => {
      useTerminalStore.getState().setNapkinData(
        data as { slug: string; artifacts: string[]; agents: string[]; napkinBullets: string[] }
          | { slug: string; artifacts: string[]; agents: string[]; napkinBullets: string[] }[],
      );
    });

    // Napkin: status changed (from SQLite)
    const removeNapkinStatus = window.electronAPI.onNapkinStatusChanged((data) => {
      useTerminalStore.getState().mergeNapkinStatus(data.slug, data.status);
    });

    // Menu: toggle kanban (Cmd+`)
    const removeKanbanListener = window.electronAPI.onToggleKanban(() => {
      useTerminalStore.getState().toggleKanban();
    });

    // Socket: log buffer request
    const removeLogRequest = window.electronAPI.onLogRequest((data) => {
      const entry = getTerminal(data.id);
      if (!entry) {
        window.electronAPI.sendLogResponse(data.requestId, []);
        return;
      }
      const buffer = entry.terminal.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      // Trim trailing empty lines
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      window.electronAPI.sendLogResponse(data.requestId, lines);
    });

    // Create first terminal with options from --name/--command flags
    window.electronAPI.getInitialTerminalOpts().then((opts) => {
      useTerminalStore.getState().createTerminal(opts.name, undefined, opts.command);
    });

    return () => {
      removeDataListener();
      removeExitListener();
      removeSidebarListener();
      removeCreateListener();
      removeCloseListener();
      removeScrollLockListener();
      if (pendingFollowTimer) clearTimeout(pendingFollowTimer);
      removeSocketCreate();
      removeSocketPeek();
      removeSocketClose();
      removeSocketStatus();
      removeNapkinUpdate();
      removeNapkinStatus();
      removeKanbanListener();
      removeLogRequest();
      clearInterval(scrollDebugInterval);
    };
  }, []);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <KanbanOverlay />
      <Gutter />
      {sidebarVisible && <NapkinBrowser />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Terminal />
      </div>
      {/* Inject pulse keyframe animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Expose for e2e testing (Playwright needs access to store + registry)
(window as any).getTerminal = getTerminal;
(window as any).useTerminalStore = useTerminalStore;
