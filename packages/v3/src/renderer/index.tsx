import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { useNapStore } from './store';
import type { AppSnapshot } from '../shared/bridge-types';

// Expose store for Playwright tests
declare global {
  interface Window {
    __napStore__: typeof useNapStore;
    electronAPI: {
      onSnapshot: (cb: (snapshot: AppSnapshot) => void) => void;
      sendIntent: (intent: unknown) => void;
    };
  }
}

window.__napStore__ = useNapStore;

function App() {
  const applySnapshot = useNapStore((s) => s.applySnapshot);

  useEffect(() => {
    if (window.electronAPI?.onSnapshot) {
      window.electronAPI.onSnapshot((snapshot) => {
        applySnapshot(snapshot);
      });
    }
  }, [applySnapshot]);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e' }}>
      <Sidebar />
      <div style={{ flex: 1, color: '#ccc', padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
        v3
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
