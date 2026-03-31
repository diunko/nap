import { useState, useRef, useEffect } from 'react';
import { useNapStore } from './store';

/** Extract a display label from a nepic slug: strip numeric prefix, take first char uppercase */
export function nepicLabel(slug: string): string {
  const withoutPrefix = slug.replace(/^\d+-/, '');
  return withoutPrefix.charAt(0).toUpperCase();
}

export function Gutter() {
  const nepics = useNapStore((s) => s.nepics);
  const activeNepicId = useNapStore((s) => s.activeNepicId);
  const switchNepic = useNapStore((s) => s.switchNepic);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setIsAdding(false);
      setNewName('');
      return;
    }
    setIsAdding(false);
    setNewName('');

    if (typeof window !== 'undefined' && window.electronAPI?.createNepic) {
      await window.electronAPI.createNepic(name);
    }
  };

  return (
    <div
      data-testid="gutter"
      style={{
        width: 60,
        minWidth: 60,
        background: '#1e1e1e',
        borderRight: '1px solid #3c3c3c',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: 4,
        position: 'relative',
      }}
    >
      {nepics.map((nepic) => {
        const isActive = nepic.id === activeNepicId;
        return (
          <div
            key={nepic.id}
            data-testid="nepic-icon"
            onClick={() => switchNepic(nepic.id)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              color: isActive ? '#e5e5e5' : '#6b7280',
              background: isActive ? '#37373d' : 'transparent',
              position: 'relative',
              transition: 'all 0.15s',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#37373d';
                e.currentTarget.style.color = '#cccccc';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }
            }}
          >
            {isActive && (
              <div
                data-testid="nepic-active-bar"
                style={{
                  position: 'absolute',
                  left: -11,
                  top: 10,
                  bottom: 10,
                  width: 3,
                  background: '#e5e5e5',
                  borderRadius: '0 2px 2px 0',
                }}
              />
            )}
            {nepicLabel(nepic.slug)}
          </div>
        );
      })}

      {/* (+) button */}
      <div
        data-testid="nepic-add"
        onClick={() => setIsAdding(true)}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 300,
          cursor: 'pointer',
          color: '#6b7280',
          background: 'transparent',
          position: 'relative',
          transition: 'all 0.15s',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#37373d';
          e.currentTarget.style.color = '#007acc';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#6b7280';
        }}
      >
        +
      </div>

      {/* Name input overlay */}
      {isAdding && (
        <div
          style={{
            position: 'absolute',
            left: 64,
            bottom: 12,
            background: '#252526',
            border: '1px solid #007acc',
            borderRadius: 4,
            padding: '4px 8px',
            zIndex: 100,
          }}
        >
          <input
            ref={inputRef}
            data-testid="nepic-name-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewName('');
              }
            }}
            onBlur={() => {
              setIsAdding(false);
              setNewName('');
            }}
            placeholder="nepic name"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#e5e5e5',
              outline: 'none',
              fontFamily: "'Menlo', monospace",
              fontSize: 13,
              width: 160,
            }}
          />
        </div>
      )}
    </div>
  );
}
