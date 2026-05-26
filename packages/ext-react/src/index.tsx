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
import { fetchPrDiffRanges, fetchPrHeadBranch } from './pr-diff';
import {
  makeGateStep,
  makeValidateStep,
  makeSessionStep,
  makeInitFsStep,
  makeCheckReposStep,
  makeCloneStep,
  makeScanRepoStep,
  makeLoadNavStep,
  makeFetchDiffStep,
  type CloneFn,
  type GateStepDef,
} from './pipeline-steps';
import { LoadingGate } from './LoadingGate';
import { PlaygroundPane } from './PlaygroundPane';
import {
  globalTokens, globalDebugMode,
  initGlobalTokens, initGlobalDebugMode,
  setGlobalToken, setGlobalDebugMode,
} from './chrome-storage';
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

function SurfaceTabBar({ debugMode }: { debugMode: boolean }) {
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
      {/* Terminal + Playground tabs — always present, rightmost */}
      <div style={{ display: 'flex', marginLeft: 'auto' }}>
        {debugMode && (
          <div
            data-testid="tab-playground"
            onClick={() => setActiveSurface('playground')}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              height: 32,
              cursor: 'pointer',
              fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
              fontSize: 12,
              color: activeSurface === 'playground' ? 'var(--nap-text)' : 'var(--nap-text-muted)',
              background: activeSurface === 'playground' ? 'var(--nap-bg)' : 'transparent',
              borderLeft: '1px solid var(--nap-border)',
            }}
          >
            Playground
          </div>
        )}
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
          }}
        >
          Terminal
        </div>
      </div>
    </div>
  );
}

// ── Settings overlay ──

function SettingsOverlay({ debugMode, onDebugModeChange, onResetSession }: { debugMode: boolean; onDebugModeChange: (v: boolean) => void; onResetSession?: () => void }) {
  const settingsVisible = useNapStore((s) => s.settingsVisible);
  const mainRepoConfig = useNapStore((s) => s.mainRepoConfig);
  const toggleSettings = useNapStore((s) => s.toggleSettings);
  const [ghInput, setGhInput] = useState('');
  const [glInput, setGlInput] = useState('');

  // Sync inputs from global tokens on open
  useEffect(() => {
    if (settingsVisible) {
      setGhInput(globalTokens.githubToken);
      setGlInput(globalTokens.gitlabToken);
    }
  }, [settingsVisible]);

  if (!settingsVisible) return null;

  const inputStyle = { width: '100%', padding: '4px 6px', border: '1px solid var(--nap-border)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12, background: 'var(--nap-bg)', color: 'var(--nap-text)' } as const;

  function handleSave() {
    setGlobalToken('githubToken', ghInput);
    setGlobalToken('gitlabToken', glInput);
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 11, color: 'var(--nap-text-muted)', cursor: 'pointer' }}>
        <input
          data-testid="settings-debug-mode"
          type="checkbox"
          checked={debugMode}
          onChange={(e) => onDebugModeChange(e.target.checked)}
        />
        Debug mode (show Playground tab)
      </label>

      {onResetSession && (
        <button
          data-testid="reset-session-btn"
          onClick={() => { toggleSettings(); onResetSession(); }}
          style={{ marginTop: 16, padding: '4px 12px', border: '1px solid #ef4444', borderRadius: 3, background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#ef4444' }}
        >
          reset session
        </button>
      )}
    </div>
  );
}

// ── Panel (inner content, receives session from context) ──

function Panel({ debugMode, onDebugModeChange, onResetSession }: { debugMode: boolean; onDebugModeChange: (v: boolean) => void; onResetSession?: () => void }) {
  const { store, lfs, adapter, model } = React.useContext(SessionContext)!;
  const activeSurface = useNapStore((s) => s.activeSurface);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);

  // Auth callback — reads provider from model config, tokens from global ref
  const getAuth = useCallback(async () => {
    const provider = model.getProvider();
    return getTokenForProvider(provider, { githubToken: globalTokens.githubToken, gitlabToken: globalTokens.gitlabToken });
  }, [model]);

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
          <SurfaceTabBar debugMode={debugMode} />
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <SettingsOverlay debugMode={debugMode} onDebugModeChange={onDebugModeChange} onResetSession={onResetSession} />
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
                store={store}
                onCommandComplete={(cmd) => model.onCommandComplete(cmd)}
                onShellReady={(exec) => model.registerShell(exec)}
                getAuth={getAuth}
              />
            </div>
            {/* Playground surface */}
            <div
              id="playground-surface"
              style={{
                position: 'absolute',
                inset: 0,
                visibility: activeSurface === 'playground' ? 'visible' : 'hidden',
                pointerEvents: activeSurface === 'playground' ? 'auto' : 'none',
                zIndex: activeSurface === 'playground' ? 1 : 0,
                background: 'var(--nap-bg)',
              }}
            >
              <PlaygroundPane adapter={adapter} />
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

// ── Session wipe helper ──

async function wipeSessionData(key: string): Promise<void> {
  const fsName = `nap-fs-${key}`;
  console.log(`[wipe] deleting IDB: ${fsName}, ${fsName}_lock`);
  indexedDB.deleteDatabase(fsName);
  indexedDB.deleteDatabase(`${fsName}_lock`);

  const uiKey = `nap-ui-${key}`;
  try {
    const req = indexedDB.open('nap-state');
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').delete(uiKey);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        } catch { resolve(); }
      };
      req.onerror = () => resolve();
    });
  } catch { /* best effort */ }
  console.log(`[wipe] done: fs=${fsName}, ui=${uiKey}`);
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
  const gateStepRef = useRef<GateStepDef | null>(null);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [, forceUpdate] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [globalReady, setGlobalReady] = useState(false);
  const [resetCount, setResetCount] = useState(0);

  // Read global settings (tokens + debug mode) from chrome.storage.sync on boot
  useEffect(() => {
    Promise.all([initGlobalTokens(), initGlobalDebugMode()]).then(() => {
      setDebugMode(globalDebugMode);
      setGlobalReady(true);
      console.log(`[boot] global settings loaded: debug=${globalDebugMode}, ghToken=${globalTokens.githubToken ? 'set' : 'empty'}, glToken=${globalTokens.gitlabToken ? 'set' : 'empty'}`);
    });
  }, []);

  const handleDebugModeChange = useCallback((value: boolean) => {
    setDebugMode(value);
    setGlobalDebugMode(value);
  }, []);

  // Tab URL reader — chrome.tabs.query on mount
  useEffect(() => {
    if (!globalReady) return;
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
  }, [globalReady]);

  // Reset handler — wipe IDB, bump resetCount to trigger fresh pipeline
  const handleResetSession = useCallback(async () => {
    if (!bootState || bootState.state !== 'session') return;
    // Destroy current pipeline + session
    const oldPipeline = pipelineRef.current;
    if (oldPipeline) {
      const ctx = oldPipeline.getCtx();
      if (ctx.model) ctx.model.destroy();
      oldPipeline.destroy();
      pipelineRef.current = null;
    }
    await wipeSessionData(bootState.key);
    setPipelineDone(false);
    setResetCount((c) => c + 1);
  }, [bootState]);

  // Create and run pipeline when boot state is 'session' (or after reset)
  useEffect(() => {
    if (!bootState || bootState.state !== 'session') return;

    const isReset = resetCount > 0;
    const gate = makeGateStep(!isReset); // autoStart=true on normal boot, false after reset
    gateStepRef.current = gate;

    const config = bootState.config;
    const steps = [
      gate,
      makeValidateStep(),
      makeSessionStep(createSession),
      makeInitFsStep(),
      makeCheckReposStep(findNepicRoot),
      makeCloneStep(realCloneFn, config),
      makeScanRepoStep(findNepicRoot, config),
      makeLoadNavStep(),
      makeFetchDiffStep(fetchPrDiffRanges, fetchPrHeadBranch),
    ];

    const pipeline = createPipeline(steps, {
      config,
      stateKey: bootState.key,
    });
    pipelineRef.current = pipeline;

    // Clone step index — used to bridge pipeline state → store.cloningStatus
    const cloneStepIdx = steps.findIndex((s) => s.name.startsWith('cloning'));

    const unsub = pipeline.subscribe((state) => {
      if (state.overall === 'done') {
        setPipelineDone(true);
      }

      // Bridge pipeline clone step → legacy store.cloningStatus
      // Existing Playwright tests assert on cloningStatus ('done' for fresh, 'idle' for return)
      if (cloneStepIdx >= 0) {
        const ctx = pipeline.getCtx();
        const cloneStep = state.steps[cloneStepIdx];
        if (ctx.store && !ctx.skipClone) {
          if (cloneStep.status === 'running') {
            ctx.store.getState().setCloningStatus('cloning');
          } else if (cloneStep.status === 'done') {
            ctx.store.getState().setCloningStatus('done');
          }
        }
      }

      // Force re-render so LoadingGate updates
      forceUpdate((n) => n + 1);
    });

    console.log('[pipeline] starting');
    pipeline.run();

    // Console API for debugging — dev only
    if (import.meta.env.DEV) {
      (window as any).__napPipeline__ = pipeline;
      (window as any).__wipeCurrentSession__ = handleResetSession;
    }

    return () => {
      unsub();
      pipeline.destroy();
      // Destroy session if it was created
      const ctx = pipeline.getCtx();
      if (ctx.model) ctx.model.destroy();
    };
  }, [bootState, resetCount, handleResetSession]);

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
    return <LoadingGate pipeline={pipelineRef.current} gateStep={gateStepRef.current ?? undefined} />;
  }

  // Pipeline done — render the panel with session from pipeline ctx
  const ctx = pipelineRef.current?.getCtx();
  const session = ctx?.session as Session | undefined;
  if (!session) return null;

  return (
    <SessionContext.Provider value={session}>
      <Panel key={session.key + '-' + resetCount} debugMode={debugMode} onDebugModeChange={handleDebugModeChange} onResetSession={handleResetSession} />
    </SessionContext.Provider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
console.log('[store] initialized');
