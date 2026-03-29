import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ color: '#ccc', padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
      v3
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
