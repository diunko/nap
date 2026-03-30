import { useRef, useState, useCallback } from 'react';
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

export function DebugPanel() {
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

  return (
    <div
      style={{
        width,
        height: '100%',
        position: 'relative',
        borderLeft: '1px solid #333',
        backgroundColor: '#1a1a1a',
        fontFamily: 'Menlo, Monaco, monospace',
        fontSize: 11,
        color: '#ccc',
        overflowX: 'hidden',
        overflowY: 'auto',
        flexShrink: 0,
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
      <div style={{ padding: '6px 10px', fontSize: 10, color: '#555', borderBottom: '1px solid #333' }}>
        v12 run:{napkins.flatMap(n => n.agents).filter(a => a.running).length}+{architects.filter(a => a.running).length} — model state
      </div>
      <pre
        style={{ margin: 0, padding: '8px 10px', whiteSpace: 'pre', lineHeight: 1.4 }}
        dangerouslySetInnerHTML={{ __html: colorizeJSON(state) }}
      />
    </div>
  );
}
