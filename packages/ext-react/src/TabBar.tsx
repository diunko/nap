import type { Tab } from './store';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onPin: (tabId: string) => void;
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function TabBar({ tabs, activeTabId, onActivate, onClose, onPin }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      data-testid="tab-bar"
      style={{
        display: 'flex',
        background: 'var(--nap-bg-secondary)',
        borderBottom: '1px solid var(--nap-border)',
        flexShrink: 0,
        overflow: 'hidden',
        minHeight: 32,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const label = basename(tab.path);

        return (
          <div
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onPin(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            title={tab.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: 32,
              cursor: 'pointer',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              fontSize: 12,
              color: isActive ? 'var(--nap-text)' : 'var(--nap-text-muted)',
              fontStyle: tab.ephemeral ? 'italic' : 'normal',
              background: isActive ? 'var(--nap-bg)' : 'transparent',
              borderRight: '1px solid var(--nap-border)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              maxWidth: 180,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <span
              data-testid={`tab-close-${tab.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              style={{
                opacity: 0,
                fontSize: 14,
                lineHeight: 1,
                padding: '0 2px',
                borderRadius: 3,
                color: 'var(--nap-text-muted)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
            >
              x
            </span>
          </div>
        );
      })}
    </div>
  );
}
