import { useState, useEffect, useRef } from 'react';
import { useTerminalStore, TerminalMeta } from '../store';

const STATUS_COLORS: Record<TerminalMeta['status'], string> = {
  running: '#22c55e',
  exited: '#6b7280',
  done: '#3b82f6',
};

export function Sidebar() {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const setActive = useTerminalStore((s) => s.setActive);
  const createTerminal = useTerminalStore((s) => s.createTerminal);

  const [filterText, setFilterText] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setFilterVisible(true);
        setTimeout(() => filterInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && filterVisible) {
        e.preventDefault();
        setFilterText('');
        setFilterVisible(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filterVisible]);

  const filteredTerminals = filterText
    ? terminals.filter((t) =>
        t.name.toLowerCase().includes(filterText.toLowerCase()),
      )
    : terminals;

  return (
    <div
      style={{
        width: 250,
        flexShrink: 0,
        backgroundColor: '#252526',
        borderRight: '1px solid #3c3c3c',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #3c3c3c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: '#cccccc',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Terminals
        </span>
        <button
          onClick={() => {
            const id = createTerminal('shell');
            useTerminalStore.getState().setActive(id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
          title="New Terminal"
        >
          +
        </button>
      </div>
      {filterVisible && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid #3c3c3c' }}>
          <input
            ref={filterInputRef}
            data-testid="sidebar-filter"
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter..."
            style={{
              width: '100%',
              padding: '4px 8px',
              backgroundColor: '#3c3c3c',
              border: '1px solid #555',
              borderRadius: 3,
              color: '#cccccc',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredTerminals.map((t) => (
          <AgentCard
            key={t.id}
            terminal={t}
            isActive={t.id === activeTerminalId}
            onClick={() => setActive(t.id)}
            parentName={
              t.parentId ? terminals.find((p) => p.id === t.parentId)?.name : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({
  terminal,
  isActive,
  onClick,
  parentName,
}: {
  terminal: TerminalMeta;
  isActive: boolean;
  onClick: () => void;
  parentName?: string;
}) {
  return (
    <div
      onClick={onClick}
      data-testid="agent-card"
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: isActive ? '#37373d' : 'transparent',
        borderLeft: isActive ? '2px solid #007acc' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[terminal.status],
            flexShrink: 0,
          }}
        />
        <span style={{ color: '#cccccc', fontSize: 13 }}>{terminal.name}</span>
      </div>
      {parentName && (
        <div style={{ color: '#808080', fontSize: 11, marginLeft: 16, marginTop: 2 }}>
          {'↳ '}
          {parentName}
        </div>
      )}
    </div>
  );
}
