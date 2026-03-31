import React, { useRef, useState, useCallback } from 'react';
import { useNapStore } from './store';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colorizeJSON(obj: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);

  if (obj === null) return '<span style="color:#f59e0b">null</span>';
  if (typeof obj === 'boolean') return `<span style="color:#f59e0b">${obj}</span>`;
  if (typeof obj === 'number') return `<span style="color:#b5cea8">${obj}</span>`;
  if (typeof obj === 'string') {
    const display = obj.length > 60 ? obj.slice(0, 57) + '...' : obj;
    return `<span style="color:#ce9178">"${esc(display)}"</span>`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span style="color:#888">[]</span>';
    const items = obj.map((item) => `${indent}  ${colorizeJSON(item, depth + 1)}`);
    return `<span style="color:#888">[</span>\n${items.join('<span style="color:#888">,</span>\n')}\n${indent}<span style="color:#888">]</span>`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '<span style="color:#888">{}</span>';
    const lines = entries.map(([k, v]) =>
      `${indent}  <span style="color:#9cdcfe">"${esc(k)}"</span><span style="color:#888">: </span>${colorizeJSON(v, depth + 1)}`
    );
    return `<span style="color:#888">{</span>\n${lines.join('<span style="color:#888">,</span>\n')}\n${indent}<span style="color:#888">}</span>`;
  }

  return String(obj);
}

function ModelTab() {
  const { napkins, architects, activeNepicId, activeTerminalId } = useNapStore();

  const state = {
    activeNepicId,
    activeTerminalId,
    architects: architects.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      started: a.started,
      running: a.running,
      done: a.done,
      exited: a.exited,
    })),
    napkins: napkins.map((n) => ({
      slug: n.slug,
      status: n.status,
      agents: n.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        started: a.started,
        running: a.running,
        done: a.done,
        exited: a.exited,
      })),
    })),
  };

  return (
    <pre
      style={{ margin: 0, padding: '8px 10px', whiteSpace: 'pre', lineHeight: 1.4 }}
      dangerouslySetInnerHTML={{ __html: colorizeJSON(state) }}
    />
  );
}

function FilesystemTab() {
  const { napkins, architects } = useNapStore();

  // Show the raw file tree data from the snapshot
  const fsState = {
    napkins: napkins.map((n) => ({
      slug: n.slug,
      path: n.path,
      entries: n.entries,
      agents: n.agents.map((a) => ({
        name: a.name,
        homePath: a.homePath,
        entries: a.entries,
      })),
    })),
    architects: architects.map((a) => ({
      name: a.name,
      homePath: a.homePath,
      entries: a.entries,
    })),
  };

  return (
    <pre
      style={{ margin: 0, padding: '8px 10px', whiteSpace: 'pre', lineHeight: 1.4 }}
      dangerouslySetInnerHTML={{ __html: colorizeJSON(fsState) }}
    />
  );
}

function EventsTab() {
  const watcherEvents = useNapStore((s) => s.watcherEvents);

  if (watcherEvents.length === 0) {
    return (
      <div style={{ padding: '8px 10px', color: '#555' }}>
        No watcher events yet
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 10px' }}>
      {watcherEvents.map((evt, i) => {
        const time = new Date(evt.timestamp).toISOString().slice(11, 23);
        return (
          <div key={i} style={{ lineHeight: 1.6 }}>
            <span style={{ color: '#555' }}>{time}</span>{' '}
            <span style={{ color: '#f59e0b' }}>{evt.event}</span>{' '}
            <span style={{ color: '#9cdcfe' }}>{evt.filename}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DebugPanel() {
  const { napkins, architects } = useNapStore();
  const debugPanelCollapsed = useNapStore((s) => s.debugPanelCollapsed);
  const debugPanelTab = useNapStore((s) => s.debugPanelTab);
  const toggleDebugPanel = useNapStore((s) => s.toggleDebugPanel);
  const setDebugPanelTab = useNapStore((s) => s.setDebugPanelTab);

  const [width, setWidth] = useState(340);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(340);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.max(200, Math.min(800, startWidth.current + delta)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width]);

  // Collapsed: thin bar that can be clicked to expand
  if (debugPanelCollapsed) {
    return (
      <div
        data-testid="debug-panel"
        onClick={toggleDebugPanel}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 20,
          borderLeft: '1px solid #333',
          backgroundColor: '#1a1a1a',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#252526')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a1a1a')}
      >
        <span style={{ color: '#555', fontSize: 10, writingMode: 'vertical-rl' }}>debug</span>
      </div>
    );
  }

  const tabs: Array<{ key: 'model' | 'filesystem' | 'events'; label: string }> = [
    { key: 'model', label: 'model' },
    { key: 'filesystem', label: 'filesystem' },
    { key: 'events', label: 'events' },
  ];

  return (
    <div
      data-testid="debug-panel"
      style={{
        width,
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        borderLeft: '1px solid #333',
        backgroundColor: '#1a1a1a',
        fontFamily: 'Menlo, Monaco, monospace',
        fontSize: 11,
        color: '#ccc',
        overflowX: 'hidden',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 4,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#007acc')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      />

      {/* Header with count + collapse button */}
      <div style={{
        padding: '6px 10px',
        fontSize: 10,
        color: '#555',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span>
          v12 run:{napkins.flatMap(n => n.agents).filter(a => a.running).length}+{architects.filter(a => a.running).length}
        </span>
        <span
          onClick={toggleDebugPanel}
          style={{ cursor: 'pointer', padding: '0 4px', color: '#555' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ccc')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
        >
          &#x2715;
        </span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #333',
        flexShrink: 0,
      }}>
        {tabs.map((tab) => (
          <div
            key={tab.key}
            data-testid={`debug-tab-${tab.key}`}
            onClick={() => setDebugPanelTab(tab.key)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 10,
              color: debugPanelTab === tab.key ? '#ccc' : '#555',
              borderBottom: debugPanelTab === tab.key ? '1px solid #007acc' : '1px solid transparent',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (debugPanelTab !== tab.key) e.currentTarget.style.color = '#888';
            }}
            onMouseLeave={(e) => {
              if (debugPanelTab !== tab.key) e.currentTarget.style.color = '#555';
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {debugPanelTab === 'model' && <ModelTab />}
        {debugPanelTab === 'filesystem' && <FilesystemTab />}
        {debugPanelTab === 'events' && <EventsTab />}
      </div>
    </div>
  );
}
