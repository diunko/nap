import { useEffect, useRef } from 'react';
import { useNapStore } from './store';
import { getTerminal, openTerminal, createTerminalInstance } from './terminal-registry';

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);

  // Reparent terminal DOM element when active terminal changes
  useEffect(() => {
    if (!activeTerminalId || !containerRef.current) return;
    let entry = getTerminal(activeTerminalId);
    if (!entry) {
      // Create on demand — handles race where child effect runs before parent
      entry = createTerminalInstance(activeTerminalId);
      entry.terminal.onData((data) => {
        window.electronAPI.pty.write(activeTerminalId, data);
      });
      window.electronAPI.pty.ready(activeTerminalId);
    }

    const container = containerRef.current;

    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (!entry.opened) {
      // First display: open terminal into this container (initializes DOM + Canvas)
      openTerminal(activeTerminalId, container);
    } else {
      // Already opened: reparent existing DOM element
      if (entry.terminal.element) {
        container.appendChild(entry.terminal.element);
      }
    }

    entry.fitAddon.fit();
    window.electronAPI.pty.resize(activeTerminalId, entry.terminal.cols, entry.terminal.rows);
    entry.terminal.focus();
  }, [activeTerminalId]);

  // ResizeObserver handles both window resize and sidebar toggle
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const id = useNapStore.getState().activeTerminalId;
        if (!id) return;
        const entry = getTerminal(id);
        if (!entry || !entry.opened) return;
        entry.fitAddon.fit();
        window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
      }, 50);
    });

    observer.observe(containerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        overflow: 'hidden',
      }}
    >
      {/* Breadcrumb header — v2 styles copied verbatim */}
      <div
        data-testid="terminal-breadcrumb"
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #3c3c3c',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          background: '#252526',
          flexShrink: 0,
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
        }}
      >
        <span style={{ color: '#6b7280' }}>S</span>
        {activeTerminalId && (
          <>
            <span style={{ color: '#3c3c3c', margin: '0 8px' }}>&gt;</span>
            <span style={{ color: '#e5e5e5', fontWeight: 600 }}>
              {activeTerminalId}
            </span>
          </>
        )}
      </div>

      {/* Terminal container */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
