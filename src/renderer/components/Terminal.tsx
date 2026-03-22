import { useEffect, useRef } from 'react';
import { useTerminalStore, terminalStatusToAgent, type TerminalMeta } from '../store';
import { getTerminal, openTerminal } from '../terminal-registry';
import type { ScrollLockMode } from '../scroll-lock';

// Derive breadcrumb segments from active terminal + real store data
function deriveBreadcrumb(
  activeTerminalId: string | null,
  terminals: TerminalMeta[],
  napkins: { slug: string }[],
): {
  nepicLabel: string;
  napkinName?: string;
  agentName?: string;
  agentStatus?: string;
  architectTerminalId?: string;
  napkinSlug?: string;
} | null {
  if (!activeTerminalId) return null;

  const terminal = terminals.find((t) => t.id === activeTerminalId);
  if (!terminal) return { nepicLabel: 'S' };

  // Architect terminal
  if (terminal.role === 'architect') {
    const label = terminal.status === 'running' ? 'acting' : terminal.status;
    return { nepicLabel: 'S', napkinName: `(${label})` };
  }

  // Agent terminal with napkin association
  if (terminal.napkinSlug) {
    // Find the architect terminal for S click
    const architect = terminals.find((t) => t.role === 'architect' && t.status === 'running')
      || terminals.find((t) => t.role === 'architect');

    return {
      nepicLabel: 'S',
      napkinName: terminal.napkinSlug,
      agentName: terminal.name,
      agentStatus: terminalStatusToAgent(terminal.status),
      architectTerminalId: architect?.id,
      napkinSlug: terminal.napkinSlug,
    };
  }

  // Default: just show S
  return { nepicLabel: 'S' };
}

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const napkins = useTerminalStore((s) => s.napkins);
  const setActive = useTerminalStore((s) => s.setActive);
  const expandCard = useTerminalStore((s) => s.expandCard);
  const scrollLockMode = useTerminalStore((s) =>
    s.activeTerminalId ? s.scrollLockModes[s.activeTerminalId] ?? 'off' : 'off',
  ) as ScrollLockMode;

  // Reparent terminal DOM element when active terminal changes
  useEffect(() => {
    if (!activeTerminalId || !containerRef.current) return;
    const entry = getTerminal(activeTerminalId);
    if (!entry) return;

    const container = containerRef.current;

    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (!entry.opened) {
      // First display: open terminal into this container (initializes DOM + WebGL)
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
    let savedScrollY: number | null = null;
    const observer = new ResizeObserver(() => {
      // Capture scroll position immediately — CSS reflow may reset it before the debounce fires
      if (savedScrollY === null) {
        const id = useTerminalStore.getState().activeTerminalId;
        if (id) {
          const entry = getTerminal(id);
          if (entry?.opened) {
            savedScrollY = entry.terminal.buffer.active.viewportY;
          }
        }
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const id = useTerminalStore.getState().activeTerminalId;
        if (!id) return;
        const entry = getTerminal(id);
        if (!entry || !entry.opened) return;
        entry.fitAddon.fit();
        if (savedScrollY !== null) {
          entry.terminal.scrollToLine(savedScrollY);
        }
        savedScrollY = null;
        window.electronAPI.pty.resize(id, entry.terminal.cols, entry.terminal.rows);
      }, 50);
    });

    observer.observe(containerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  const borderStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor:
      scrollLockMode === 'follow'
        ? 'transparent transparent #2a5a9a transparent'
        : scrollLockMode === 'read'
          ? 'transparent #8a6a2a'
          : 'transparent',
    transition: 'border-color 0.15s ease',
    display: 'flex',
  };

  const breadcrumb = deriveBreadcrumb(activeTerminalId, terminals, napkins);

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
      {/* Breadcrumb header */}
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
        {breadcrumb ? (
          <>
            <span
              data-testid="breadcrumb-s"
              onClick={() => {
                if (breadcrumb.architectTerminalId) {
                  setActive(breadcrumb.architectTerminalId);
                }
              }}
              style={{
                color: '#6b7280',
                cursor: breadcrumb.architectTerminalId ? 'pointer' : 'default',
                padding: '2px 0',
                transition: 'color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (breadcrumb.architectTerminalId) e.currentTarget.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              {breadcrumb.nepicLabel}
            </span>
            {breadcrumb.napkinName && (
              <>
                <span style={{ color: '#3c3c3c', margin: '0 8px', cursor: 'default' }}>
                  &gt;
                </span>
                <span
                  data-testid="breadcrumb-napkin"
                  onClick={() => {
                    if (breadcrumb.napkinSlug) {
                      expandCard(breadcrumb.napkinSlug);
                    }
                  }}
                  style={{
                    color: breadcrumb.agentName ? '#6b7280' : '#e5e5e5',
                    cursor: breadcrumb.napkinSlug ? 'pointer' : 'default',
                    padding: '2px 0',
                    fontWeight: breadcrumb.agentName ? 'normal' : 600,
                  }}
                  onMouseEnter={(e) => {
                    if (breadcrumb.napkinSlug) e.currentTarget.style.color = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = breadcrumb.agentName ? '#6b7280' : '#e5e5e5';
                  }}
                >
                  {breadcrumb.napkinName}
                </span>
              </>
            )}
            {breadcrumb.agentName && (
              <>
                <span style={{ color: '#3c3c3c', margin: '0 8px', cursor: 'default' }}>
                  &gt;
                </span>
                <span
                  style={{
                    color: '#e5e5e5',
                    fontWeight: 600,
                    cursor: 'default',
                  }}
                >
                  {breadcrumb.agentName}
                </span>
                {breadcrumb.agentStatus && (
                  <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 12 }}>
                    {breadcrumb.agentStatus}
                  </span>
                )}
              </>
            )}
          </>
        ) : (
          <span style={{ color: '#6b7280' }}>S</span>
        )}
      </div>

      {/* Terminal with scroll-lock border */}
      <div style={{ ...borderStyle, flex: 1, height: 'auto' }}>
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
      </div>
    </div>
  );
}
