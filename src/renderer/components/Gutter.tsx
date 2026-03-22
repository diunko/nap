import { useTerminalStore } from '../store';
import { MOCK_NEPICS } from '../mock-data';

export function Gutter() {
  const activeNepicId = useTerminalStore((s) => s.activeNepicId);
  const setActiveNepic = useTerminalStore((s) => s.setActiveNepic);

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
      }}
    >
      {MOCK_NEPICS.map((nepic) => {
        const isActive = nepic.id === activeNepicId;
        const isAdd = nepic.label === '+';
        return (
          <div
            key={nepic.id}
            data-testid="nepic-icon"
            onClick={() => {
              if (!isAdd) setActiveNepic(nepic.id);
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isAdd ? 20 : 15,
              fontWeight: isAdd ? 300 : 600,
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
                e.currentTarget.style.color = isAdd ? '#007acc' : '#cccccc';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }
            }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div
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
            {nepic.label}
          </div>
        );
      })}
    </div>
  );
}
