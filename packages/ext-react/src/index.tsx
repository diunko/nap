import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';
import { TabBar } from './TabBar';
import { ContentPane } from './ContentPane';
import { TerminalPane } from './TerminalPane';
import { Sidebar } from './Sidebar';
import { createSession, SessionContext, useNapStore } from './session';
import type { Session } from './session';
import { resolveBootState, type BootState } from './boot-gate';
import { getTokenForProvider } from './url-config';
import { createPipeline, type Pipeline } from './pipeline';
import { findNepicRoot } from './model';
import { fetchPrDiffRanges } from './pr-diff';
import {
  makeValidateStep,
  makeSessionStep,
  makeInitFsStep,
  makeCheckReposStep,
  makeCloneStep,
  makeScanRepoStep,
  makeLoadNavStep,
  makeFetchDiffStep,
  type CloneFn,
} from './pipeline-steps';
import { LoadingGate } from './LoadingGate';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

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

function HeaderBar({ onFetchLatest, onRefreshPr }: { onFetchLatest?: () => void; onRefreshPr?: () => void }) {
  const toggleSettings = useNapStore((s) => s.toggleSettings);
  const toggleSidebar = useNapStore((s) => s.toggleSidebar);
  const toggleFocusMode = useNapStore((s) => s.toggleFocusMode);
  const focusMode = useNapStore((s) => s.focusMode);

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
        data-testid="refresh-pr-btn"
        onClick={onRefreshPr}
        style={{
          cursor: 'pointer',
          padding: '2px 8px',
          border: '1px solid var(--nap-border)',
          borderRadius: 3,
          fontSize: 11,
        }}
      >
        refresh PR
      </span>
      <span
        data-testid="fetch-latest-btn"
        onClick={onFetchLatest}
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
        data-testid="focus-toggle-btn"
        onClick={toggleFocusMode}
        title={focusMode ? 'Show all cards (Ctrl+Shift+F)' : 'Focus on current card (Ctrl+Shift+F)'}
        style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3, fontSize: 14 }}
      >
        {focusMode ? '\u25C9' : '\u25CE'}
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
  const githubToken = useNapStore((s) => s.githubToken);
  const gitlabToken = useNapStore((s) => s.gitlabToken);
  const setGithubToken = useNapStore((s) => s.setGithubToken);
  const setGitlabToken = useNapStore((s) => s.setGitlabToken);
  const [ghInput, setGhInput] = useState('');
  const [glInput, setGlInput] = useState('');

  // Sync inputs from store on open
  useEffect(() => {
    if (settingsVisible) {
      setGhInput(githubToken);
      setGlInput(gitlabToken);
    }
  }, [settingsVisible]);

  if (!settingsVisible) return null;

  const inputStyle = { width: '100%', padding: '4px 6px', border: '1px solid var(--nap-border)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, background: 'var(--nap-bg)', color: 'var(--nap-text)' } as const;

  function handleSave() {
    setGithubToken(ghInput);
    setGitlabToken(glInput);
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

      {mainRepoConfig && (
        <div style={{ fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 12, padding: '6px 8px', background: 'var(--nap-bg-secondary)', borderRadius: 3 }}>
          Code repo: <span style={{ color: 'var(--nap-text)' }}>{mainRepoConfig.owner}/{mainRepoConfig.repo}</span>
          <br />
          Branch: <span style={{ color: 'var(--nap-text)' }}>{mainRepoConfig.branch}</span>
          <br />
          <span style={{ fontSize: 10, color: 'var(--nap-text-dim)' }}>auto-detected from URL</span>
        </div>
      )}

      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 8 }}>
        GitHub PAT (optional, for private repos)
      </label>
      <input
        data-testid="settings-github-token"
        type="password"
        value={ghInput}
        onChange={(e) => setGhInput(e.target.value)}
        placeholder="ghp_..."
        style={inputStyle}
      />

      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 12 }}>
        GitLab PAT (optional, for GitLab-hosted .nap repos)
      </label>
      <input
        data-testid="settings-gitlab-token"
        type="password"
        value={glInput}
        onChange={(e) => setGlInput(e.target.value)}
        placeholder="glpat-..."
        style={inputStyle}
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

  // Auth callback — reads provider from model config, tokens from store
  const getAuth = useCallback(async () => {
    const s = store.getState();
    const provider = model.getProvider();
    return getTokenForProvider(provider, { githubToken: s.githubToken, gitlabToken: s.gitlabToken });
  }, [store, model]);

  // Model cleanup (init is done by pipeline before Panel mounts)
  useEffect(() => {
    return () => {
      model.registerShell(null);
      model.destroy();
    };
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
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        s.toggleFocusMode();
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
      <HeaderBar
        onFetchLatest={() => model.fetchLatest()}
        onRefreshPr={() => model.refreshPr()}
      />
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
                onCommandComplete={(cmd) => model.onCommandComplete(cmd)}
                onShellReady={(exec) => model.registerShell(exec)}
                getAuth={getAuth}
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

// ── Boot gate messages ──

function BootMessage({ message, detail }: { message: string; detail?: string }) {
  return (
    <div
      data-testid="boot-message"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        color: 'var(--nap-text-muted)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 8 }}>{message}</div>
      {detail && <div style={{ fontSize: 11, color: 'var(--nap-text-dim)' }}>{detail}</div>}
    </div>
  );
}

// ── Production clone function (wraps isomorphic-git) ──

const realCloneFn: CloneFn = async (url, dir, lfs, auth) => {
  await git.clone({
    fs: lfs,
    http,
    dir,
    url,
    singleBranch: true,
    depth: 20,
    ...(auth ? { onAuth: () => auth } : {}),
  });
};

// ── App (reads tab URL, gates boot, runs pipeline) ──

function App() {
  const [bootState, setBootState] = useState<BootState | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [, forceUpdate] = useState(0);

  // Tab URL reader — chrome.tabs.query on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url;
        console.log(`[boot] tab URL: ${url}`);
        const state = resolveBootState(url);
        console.log(`[boot] state: ${state.state}`);
        setBootState(state);
      });
    } else {
      const state = resolveBootState(window.location.href);
      setBootState(state);
    }
  }, []);

  // Create and run pipeline when boot state is 'session'
  useEffect(() => {
    if (!bootState || bootState.state !== 'session') return;

    const config = bootState.config;
    const steps = [
      makeValidateStep(),
      makeSessionStep(createSession),
      makeInitFsStep(),
      makeCheckReposStep(findNepicRoot),
      makeCloneStep(realCloneFn, config),
      makeScanRepoStep(findNepicRoot, config),
      makeLoadNavStep(),
      makeFetchDiffStep(fetchPrDiffRanges),
    ];

    const pipeline = createPipeline(steps, {
      config,
      stateKey: bootState.key,
    });
    pipelineRef.current = pipeline;

    const unsub = pipeline.subscribe((state) => {
      if (state.overall === 'done') {
        setPipelineDone(true);
      }
      // Force re-render so LoadingGate updates
      forceUpdate((n) => n + 1);
    });

    console.log('[pipeline] starting');
    pipeline.run();

    // Console API for debugging
    (window as any).__napPipeline__ = pipeline;

    return () => {
      unsub();
      pipeline.destroy();
      // Destroy session if it was created
      const ctx = pipeline.getCtx();
      if (ctx.model) ctx.model.destroy();
    };
  }, [bootState]);

  // Loading — waiting for chrome.tabs.query
  if (!bootState) {
    return (
      <div
        data-testid="boot-loading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
          fontSize: 12,
          color: 'var(--nap-text-muted)',
        }}
      />
    );
  }

  // Gate messages (pre-pipeline)
  if (bootState.state === 'no-hash') {
    return <BootMessage message="ask the author for a review link" detail="open a PR with a #nap-repo=... hash" />;
  }

  if (bootState.state === 'wrong-page') {
    return <BootMessage message="open on a GitHub page" detail="nap works on github.com pull request pages" />;
  }

  // Pipeline running — show loading gate
  if (!pipelineDone && pipelineRef.current) {
    return <LoadingGate pipeline={pipelineRef.current} />;
  }

  // Pipeline done — render the panel with session from pipeline ctx
  const ctx = pipelineRef.current?.getCtx();
  const session = ctx?.session as Session | undefined;
  if (!session) return null;

  return (
    <SessionContext.Provider value={session}>
      <Panel key={session.key} />
    </SessionContext.Provider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
console.log('[store] initialized');
