import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';
import { TabBar } from './TabBar';
import { ContentPane } from './ContentPane';
import { TerminalPane } from './TerminalPane';
import { Sidebar } from './Sidebar';
import { createSession, getStateKey, SessionContext, useNapStore } from './session';
import type { Session } from './session';

// Buffer polyfill — required before isomorphic-git
(window as any).Buffer = Buffer;

console.log('[render] mounting ext-react');

// ── Resize handle (between editor area and nav) ──

function ResizeHandle() {
  const handleRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const handle = handleRef.current;
    if (!handle) return;
    const nav = handle.nextElementSibling as HTMLElement;
    if (!nav) return;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = nav.getBoundingClientRect().width;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(180, Math.min(600, startWidth + delta));
      nav.style.width = `${newWidth}px`;
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      ref={handleRef}
      id="nav-drag"
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: 'col-resize',
        flexShrink: 0,
        background: 'transparent',
        zIndex: 5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nap-text-muted)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    />
  );
}

// ── Header bar ──

function HeaderBar() {
  const toggleSettings = useNapStore((s) => s.toggleSettings);
  const toggleSidebar = useNapStore((s) => s.toggleSidebar);

  return (
    <div
      data-testid="header-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        height: 32,
        background: 'var(--nap-bg-secondary)',
        borderBottom: '1px solid var(--nap-border)',
        flexShrink: 0,
        gap: 8,
        fontSize: 12,
        color: 'var(--nap-text-muted)',
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--nap-text)' }} id="header-napkin-name" />
      <span style={{ flex: 1 }} />
      <span
        style={{
          cursor: 'pointer',
          padding: '2px 8px',
          border: '1px solid var(--nap-border)',
          borderRadius: 3,
          fontSize: 11,
        }}
      >
        fetch latest
      </span>
      <span
        onClick={toggleSettings}
        style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3 }}
      >
        &#9881;
      </span>
      <span
        onClick={toggleSidebar}
        style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3 }}
      >
        &#9776;
      </span>
    </div>
  );
}

// ── Surface-switching tab bar ──

function SurfaceTabBar() {
  const { store } = React.useContext(SessionContext)!;
  const tabs = useNapStore((s) => s.tabs);
  const activeTabId = useNapStore((s) => s.activeTabId);
  const activeSurface = useNapStore((s) => s.activeSurface);
  const setActiveSurface = useNapStore((s) => s.setActiveSurface);

  return (
    <div
      data-testid="tab-bar"
      style={{
        display: 'flex',
        background: 'var(--nap-bg-secondary)',
        borderBottom: '1px solid var(--nap-border)',
        flexShrink: 0,
        minHeight: 32,
      }}
    >
      {/* File tabs first */}
      <TabBar
        tabs={tabs}
        activeTabId={activeSurface === 'editor' ? activeTabId : null}
        onActivate={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) store.getState().openDoc(tab.path);
        }}
        onClose={(tabId) => store.getState().closeTab(tabId)}
        onPin={(tabId) => store.getState().pinTab(tabId)}
      />
      {/* Terminal tab — always present, rightmost */}
      <div
        data-testid="tab-terminal"
        onClick={() => setActiveSurface('terminal')}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          height: 32,
          cursor: 'pointer',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 12,
          color: activeSurface === 'terminal' ? 'var(--nap-text)' : 'var(--nap-text-muted)',
          background: activeSurface === 'terminal' ? 'var(--nap-bg)' : 'transparent',
          borderLeft: '1px solid var(--nap-border)',
          marginLeft: 'auto',
        }}
      >
        Terminal
      </div>
    </div>
  );
}

// ── Settings overlay ──

function SettingsOverlay() {
  const settingsVisible = useNapStore((s) => s.settingsVisible);
  const mainRepoConfig = useNapStore((s) => s.mainRepoConfig);
  const toggleSettings = useNapStore((s) => s.toggleSettings);
  const setMainRepo = useNapStore((s) => s.setMainRepo);
  const [repoInput, setRepoInput] = useState(mainRepoConfig ? `${mainRepoConfig.owner}/${mainRepoConfig.repo}` : '');
  const [branchInput, setBranchInput] = useState(mainRepoConfig?.branch ?? 'main');
  const [patInput, setPatInput] = useState('');

  if (!settingsVisible) return null;

  function handleSave() {
    const parts = repoInput.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      setMainRepo({ owner: parts[0], repo: parts[1], branch: branchInput || 'main' });
    }
    toggleSettings();
  }

  return (
    <div
      data-testid="settings-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--nap-bg)',
        zIndex: 100,
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <h3 style={{ fontSize: 13, marginBottom: 12 }}>Settings</h3>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 8 }}>
        Main code repo (owner/repo)
      </label>
      <input
        type="text"
        value={repoInput}
        onChange={(e) => setRepoInput(e.target.value)}
        placeholder="org/project"
        style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--nap-border)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, background: 'var(--nap-bg)', color: 'var(--nap-text)' }}
      />
      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 8 }}>
        Branch
      </label>
      <input
        type="text"
        value={branchInput}
        onChange={(e) => setBranchInput(e.target.value)}
        placeholder="main"
        style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--nap-border)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, background: 'var(--nap-bg)', color: 'var(--nap-text)' }}
      />
      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 8 }}>
        GitHub PAT (optional, for private repos)
      </label>
      <input
        type="password"
        value={patInput}
        onChange={(e) => setPatInput(e.target.value)}
        placeholder="ghp_..."
        style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--nap-border)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, background: 'var(--nap-bg)', color: 'var(--nap-text)' }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          style={{ padding: '4px 12px', border: '1px solid var(--nap-border)', borderRadius: 3, background: 'var(--nap-bg-secondary)', cursor: 'pointer', fontSize: 12, color: 'var(--nap-text)' }}
        >
          Save
        </button>
        <button
          onClick={toggleSettings}
          style={{ padding: '4px 12px', border: '1px solid var(--nap-border)', borderRadius: 3, background: 'var(--nap-bg-secondary)', cursor: 'pointer', fontSize: 12, color: 'var(--nap-text)' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Panel (inner content, receives session from context) ──

function Panel() {
  const { store, lfs, adapter, model } = React.useContext(SessionContext)!;
  const activeSurface = useNapStore((s) => s.activeSurface);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);

  // Init model (filesystem bootstrap + repo scan)
  useEffect(() => {
    model.init();
    return () => model.destroy();
  }, [model]);

  // Stable callback that reaches the current model
  const handleCommandComplete = useCallback((cmd: string) => {
    model.onCommandComplete(cmd);
  }, [model]);

  // Zoom keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const s = store.getState();
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          s.setZoom(s.zoom + 0.1);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          s.setZoom(s.zoom - 0.1);
        } else if (e.key === '0' || e.key === ')') {
          e.preventDefault();
          s.setZoom(1.0);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        s.closeActiveTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        s.extendCard();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        s.toggleSidebar();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    console.log('[render] mounted — layout: [ContentPane | ResizeHandle | Sidebar]');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <HeaderBar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SurfaceTabBar />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <SettingsOverlay />
            {/* Editor surface */}
            <div
              id="editor-surface"
              style={{
                position: 'absolute',
                inset: 0,
                visibility: activeSurface === 'editor' ? 'visible' : 'hidden',
                pointerEvents: activeSurface === 'editor' ? 'auto' : 'none',
                zIndex: activeSurface === 'editor' ? 1 : 0,
              }}
            >
              <ContentPane adapter={adapter} model={model} />
            </div>
            {/* Terminal surface */}
            <div
              id="terminal-surface"
              style={{
                position: 'absolute',
                inset: 0,
                visibility: activeSurface === 'terminal' ? 'visible' : 'hidden',
                pointerEvents: activeSurface === 'terminal' ? 'auto' : 'none',
                zIndex: activeSurface === 'terminal' ? 1 : 0,
                background: '#1e1e1e',
              }}
            >
              <TerminalPane
                lfs={lfs}
                adapter={adapter}
                onCommandComplete={handleCommandComplete}
              />
            </div>
          </div>
        </div>
        <ResizeHandle />
        {sidebarVisible && <Sidebar />}
      </div>
    </div>
  );
}

// ── App (creates session, provides context) ──

function App() {
  const [session, setSession] = useState<Session>(() => createSession(getStateKey()));

  // Expose switchSession for console and content script use
  useEffect(() => {
    const switchSession = (key: string) => {
      console.log(`[session] switching to key: ${key}`);
      session.model.destroy();
      setSession(createSession(key));
    };
    (window as any).__switchSession__ = switchSession;

    // Also listen for content script messages
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (msg: any) => {
        if (msg.type === 'session-key-changed' && msg.key) switchSession(msg.key);
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, [session]);

  return (
    <SessionContext.Provider value={session}>
      <Panel key={session.key} />
    </SessionContext.Provider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
console.log('[store] initialized');
