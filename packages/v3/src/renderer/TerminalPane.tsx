import { useNapStore } from './store';
import { Terminal } from './Terminal';

export function TerminalPane() {
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);

  if (!activeTerminalId) {
    return (
      <div
        data-testid="terminal-pane"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 14,
          background: '#1e1e1e',
          minWidth: 200,
        }}
      >
        no agent selected
      </div>
    );
  }

  return (
    <div
      data-testid="terminal-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 200,
      }}
    >
      <Terminal />
    </div>
  );
}
