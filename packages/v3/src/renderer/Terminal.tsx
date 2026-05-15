import { useEffect, useRef, useState } from 'react';
import { useNapStore } from './store';
import type { AgentState } from '../shared/bridge-types';
import { getTerminal, openTerminal, createTerminalInstance, toggleFollow } from './terminal-registry';
import { createFileLinkProvider } from './file-link-provider';

function useActiveAgent(): AgentState | null {
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);

  if (!activeTerminalId) return null;

  const architect = architects.find((a) => a.id === activeTerminalId);
  if (architect) return architect;

  for (const napkin of napkins) {
    const agent = napkin.agents.find((a) => a.id === activeTerminalId);
    if (agent) return agent;
  }

  return null;
}

function useBreadcrumb() {
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);

  if (!activeTerminalId) return null;

  // Is it an architect?
  const architect = architects.find((a) => a.id === activeTerminalId);
  if (architect) {
    const label = architect.archived ? 'archived' : architect.running ? 'running' : architect.exited ? 'exited' : 'done';
    return { agentName: architect.name, label };
  }

  // Is it a napkin agent?
  for (const napkin of napkins) {
    const agent = napkin.agents.find((a) => a.id === activeTerminalId);
    if (agent) {
      const label = agent.archived ? 'archived' : agent.running ? 'running' : agent.exited ? 'exited' : agent.done ? 'done' : '';
      return { napkinSlug: napkin.slug, agentName: agent.name, label };
    }
  }

  return { agentName: activeTerminalId };
}

function PermissionModal({ agent }: { agent: AgentState }) {
  const approval = agent.pendingApproval;
  if (!approval) return null;

  function handleDecision(decision: 'allow' | 'deny' | 'passthrough') {
    window.electronAPI.sendIntent({
      type: 'permission-response',
      agentId: agent.id,
      decision,
    });
  }

  return (
    <div
      data-testid="permission-modal"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
      }}
    >
      <div
        style={{
          background: 'var(--nap-bg)',
          border: '1px solid var(--nap-border)',
          borderRadius: 8,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          color: 'var(--nap-text)',
          position: 'relative',
        }}
      >
        <button
          data-testid="permission-dismiss-btn"
          onClick={() => handleDecision('passthrough')}
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
            background: 'none',
            border: 'none',
            color: 'var(--nap-text-muted)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '4px',
          }}
          title="Dismiss — fall through to CC dialog"
        >
          x
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Permission Request
        </div>
        <pre
          style={{
            background: 'var(--nap-bg-secondary)',
            border: '1px solid var(--nap-border)',
            borderRadius: 4,
            padding: 12,
            fontSize: 12,
            color: 'var(--nap-link)',
            overflow: 'auto',
            maxHeight: 200,
            margin: '0 0 16px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify({ tool: approval.tool, command: approval.command, ...approval.payload }, null, 2)}
        </pre>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            data-testid="permission-deny-btn"
            onClick={() => handleDecision('deny')}
            style={{
              padding: '6px 16px',
              background: '#374151',
              color: '#e5e5e5',
              border: '1px solid #4b5563',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              fontSize: 12,
            }}
          >
            Deny
          </button>
          <button
            data-testid="permission-approve-btn"
            onClick={() => handleDecision('allow')}
            style={{
              padding: '6px 16px',
              background: '#2563eb',
              color: '#e5e5e5',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              fontSize: 12,
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessorPrompt({ agent }: { agent: AgentState }) {
  const [spawning, setSpawning] = useState(false);

  async function handleSpawn() {
    setSpawning(true);
    const result = await window.electronAPI.spawnSuccessor(agent.id);
    if (result?.newId) {
      // Store will update via snapshot — switch terminal to new ID
      useNapStore.getState().setActiveTerminal(result.newId);
    }
    setSpawning(false);
  }

  return (
    <div
      data-testid="successor-prompt"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        color: 'var(--nap-text-muted)',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--nap-text-muted)' }}>
        Session expired — invoke a successor?
      </div>
      <div style={{ fontSize: 12, color: 'var(--nap-text-muted)', maxWidth: 400, textAlign: 'center' }}>
        A fresh Claude will read the original prompt, response, and codebase to continue this work.
      </div>
      <button
        data-testid="successor-spawn-btn"
        onClick={handleSpawn}
        disabled={spawning}
        style={{
          padding: '8px 20px',
          background: spawning ? '#374151' : '#2563eb',
          color: '#e5e5e5',
          border: 'none',
          borderRadius: 6,
          cursor: spawning ? 'default' : 'pointer',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
        }}
      >
        {spawning ? 'Spawning...' : 'Invoke successor'}
      </button>
    </div>
  );
}

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const activeAgent = useActiveAgent();
  const breadcrumb = useBreadcrumb();
  const [following, setFollowing] = useState(false);
  const isArchived = activeAgent?.archived ?? false;

  // Cmd+G: toggle follow mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        const id = useNapStore.getState().activeTerminalId;
        if (id) {
          const isFollowing = toggleFollow(id);
          setFollowing(isFollowing);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync follow state when switching terminals
  useEffect(() => {
    if (activeTerminalId) {
      const entry = getTerminal(activeTerminalId);
      setFollowing(entry?.following ?? false);
    }
  }, [activeTerminalId]);

  // Reparent terminal DOM element when active terminal changes
  useEffect(() => {
    if (!activeTerminalId || !containerRef.current) return;
    let entry = getTerminal(activeTerminalId);
    if (!entry) {
      // Create on demand — handles exited agents resumed by click
      entry = createTerminalInstance(activeTerminalId);
      entry.terminal.onData((data) => {
        window.electronAPI.pty.write(activeTerminalId, data);
      });
      entry.terminal.registerLinkProvider(
        createFileLinkProvider(
          entry.terminal,
          () => '/',
          (filePath) => window.electronAPI.openFilePath(filePath),
        ),
      );
      // Check if this agent needs a pty resumed
      const state = useNapStore.getState();
      const allAgents = [
        ...state.napkins.flatMap((n) => n.agents),
        ...state.architects,
      ];
      const agent = allAgents.find((a) => a.id === activeTerminalId);
      if (agent?.exited) {
        window.electronAPI.pty.resume(activeTerminalId);
      }
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

    // Defer fit/resize/focus to rAF — ensures browser has completed layout
    // so fitAddon measures the real container dimensions, not a stale/zero rect
    const termId = activeTerminalId;
    requestAnimationFrame(() => {
      entry.fitAddon.fit();
      window.electronAPI.pty.resize(termId, entry.terminal.cols, entry.terminal.rows);
      entry.terminal.focus();
      (window as any).__lastEffectFit__ = { id: termId, cols: entry.terminal.cols, rows: entry.terminal.rows, deferred: true };
    });
  }, [activeTerminalId]);

  // ResizeObserver handles both window resize and sidebar toggle
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver((entries) => {
      // Skip when container has zero dimensions (parent display:none).
      // fitAddon.fit() would resize the terminal to ~2 cols, causing the
      // pty to reflow all content to narrow columns.
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;

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
        background: 'var(--nap-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Breadcrumb header */}
      <div
        data-testid="terminal-breadcrumb"
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--nap-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          background: 'var(--nap-bg-secondary)',
          flexShrink: 0,
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 13,
        }}
      >
        <span style={{ color: 'var(--nap-text-muted)', padding: '2px 0' }}>S</span>
        {breadcrumb?.napkinSlug && (
          <>
            <span style={{ color: 'var(--nap-border)', margin: '0 8px' }}>&gt;</span>
            <span style={{ color: 'var(--nap-text-muted)', padding: '2px 0' }}>
              {breadcrumb.napkinSlug}
            </span>
          </>
        )}
        {breadcrumb?.agentName && (
          <>
            <span style={{ color: 'var(--nap-border)', margin: '0 8px' }}>&gt;</span>
            <span style={{ color: 'var(--nap-text)', fontWeight: 600 }}>
              {breadcrumb.agentName}
            </span>
          </>
        )}
        {breadcrumb?.label && (
          <span style={{ color: 'var(--nap-text-muted)', fontSize: 12, marginLeft: 12 }}>
            {breadcrumb.label}
          </span>
        )}
      </div>

      {/* Terminal container */}
      <div style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        borderBottom: following ? '2px solid #2a5a9a' : '2px solid transparent',
        transition: 'border-color 0.15s',
        position: 'relative',
      }}>
        {activeAgent?.pendingApproval && <PermissionModal agent={activeAgent} />}
        {isArchived && activeAgent ? (
          <SuccessorPrompt agent={activeAgent} />
        ) : (
          <div
            ref={containerRef}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
