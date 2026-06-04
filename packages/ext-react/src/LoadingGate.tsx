/**
 * Loading gate — renders pipeline progress as a step list.
 *
 * Custom step renderers for clone and fetch-diff: inline PAT input
 * right on the failed step. Default renderer for everything else.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Pipeline, PipelineState, StepDef } from './pipeline';
import type { GateStepDef } from './pipeline-steps';
import { PROVIDERS, type NapConfig } from './url-config';
import {
  globalTokens, setGlobalToken,
  globalGitlabHostname, setGlobalGitlabHostname,
  globalDebugMode, setGlobalDebugMode,
  requestHostPermission,
} from './chrome-storage';
import { setGitlabHostname } from './url-config';

export function LoadingGate({ pipeline, gateStep }: { pipeline: Pipeline; gateStep?: GateStepDef }) {
  const [state, setState] = useState<PipelineState>(pipeline.getState());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => pipeline.subscribe(setState), [pipeline]);

  const ctx = pipeline.getCtx();

  return (
    <div
      data-testid="loading-gate"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        color: 'var(--nap-text-muted)',
        position: 'relative',
      }}
    >
      {/* Settings gear — always visible during loading */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', flexShrink: 0 }}>
        <span
          data-testid="loading-gate-settings-gear"
          onClick={() => setSettingsOpen(true)}
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3, fontSize: 14 }}
        >
          &#9881;
        </span>
      </div>

      {/* Step list — centered */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {state.steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              index={i}
              ctx={ctx}
              gateStep={gateStep}
              onRetry={() => pipeline.retry(i)}
            />
          ))}

          {state.overall === 'error' && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <span
                data-testid="retry-all"
                onClick={() => pipeline.retryAll()}
                style={{
                  cursor: 'pointer',
                  color: 'var(--nap-link)',
                  fontSize: 12,
                  textDecoration: 'underline',
                }}
              >
                retry all
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Standalone settings overlay — no session needed, writes to chrome.storage.sync */}
      {settingsOpen && (
        <LoadingGateSettings onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

// ── Step row with custom renderer dispatch ──

function StepRow({
  step,
  index,
  ctx,
  gateStep,
  onRetry,
}: {
  step: PipelineState['steps'][0];
  index: number;
  ctx: Record<string, any>;
  gateStep?: GateStepDef;
  onRetry: () => void;
}) {
  const icon =
    step.status === 'done' ? '\u2713' :
    step.status === 'running' ? '\u27F3' :
    step.status === 'error' ? '\u2717' :
    '\u25CB';

  const color =
    step.status === 'done' ? '#22c55e' :
    step.status === 'running' ? 'var(--nap-text)' :
    step.status === 'error' ? '#ef4444' :
    'var(--nap-text-dim)';

  // Gate step detection: name === 'ready' + status === 'running' → show [start]
  const isGateWaiting = step.name === 'ready' && step.status === 'running' && gateStep;

  // Determine if this is a clone or fetch-diff step for custom rendering
  const isCloneStep = step.name.startsWith('cloning ');
  const isFetchDiffStep = step.name === 'loading PR changes';
  const isAuthError = step.status === 'error' && step.error === 'authentication failed';

  return (
    <div
      data-testid={`pipeline-step-${index}`}
      style={{ padding: '4px 0', fontSize: 13 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color, width: 16, textAlign: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{ color: step.status === 'pending' ? 'var(--nap-text-dim)' : 'var(--nap-text)' }}>
          {step.name}{step.status === 'running' && !isGateWaiting ? '...' : ''}
        </span>
        {isGateWaiting && (
          <button
            data-testid="gate-start"
            onClick={() => gateStep!.triggerStart()}
            style={{
              ...btnStyle,
              marginLeft: 8,
              padding: '2px 14px',
              fontWeight: 600,
            }}
          >
            start
          </button>
        )}
      </div>

      {step.status === 'error' && (
        <div style={{ marginLeft: 24, marginTop: 4 }}>
          {/* Custom renderer: clone step 401 with no token → inline form */}
          {isCloneStep && isAuthError ? (
            <CloneTokenForm ctx={ctx} step={step} onRetry={onRetry} />
          ) : isFetchDiffStep && isAuthError ? (
            <FetchDiffTokenForm step={step} onRetry={onRetry} />
          ) : (
            <DefaultError step={step} index={index} onRetry={onRetry} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Default error renderer ──

function DefaultError({
  step,
  index,
  onRetry,
}: {
  step: PipelineState['steps'][0];
  index: number;
  onRetry: () => void;
}) {
  return (
    <>
      <div style={{ color: '#ef4444', fontSize: 12 }}>{step.error}</div>
      <div style={{ color: 'var(--nap-text-muted)', fontSize: 11, marginTop: 2 }}>{step.hint}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          data-testid={`retry-step-${index}`}
          onClick={onRetry}
          style={btnStyle}
        >
          retry
        </button>
      </div>
    </>
  );
}

// ── Clone step: inline token form ──

function CloneTokenForm({
  ctx,
  step,
  onRetry,
}: {
  ctx: Record<string, any>;
  step: PipelineState['steps'][0];
  onRetry: () => void;
}) {
  const config = ctx.config as NapConfig | undefined;
  const provider = config?.provider ?? 'github';
  const label = PROVIDERS[provider]?.label ?? provider;

  // Determine which token key to use
  const tokenKey = provider === 'gitlab' ? 'gitlabToken' : 'githubToken';
  const currentToken = globalTokens[tokenKey];

  // If token already exists (wrong token, not missing), show plain error
  if (currentToken) {
    return (
      <>
        <div style={{ color: '#ef4444', fontSize: 12 }}>authentication failed — check your {label} token</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <TokenInputAndRetry tokenKey={tokenKey} label={label} onRetry={onRetry} />
        </div>
      </>
    );
  }

  // No token set — show inline form
  return (
    <>
      <div style={{ color: '#ef4444', fontSize: 12 }}>{step.error}</div>
      <div style={{ color: 'var(--nap-text-muted)', fontSize: 11, marginTop: 2 }}>enter your {label} token below</div>
      <TokenInputAndRetry tokenKey={tokenKey} label={label} onRetry={onRetry} />
    </>
  );
}

// ── Fetch-diff step: inline token form (always GitHub) ──

function FetchDiffTokenForm({
  step,
  onRetry,
}: {
  step: PipelineState['steps'][0];
  onRetry: () => void;
}) {
  const currentToken = globalTokens.githubToken;

  if (currentToken) {
    return (
      <>
        <div style={{ color: '#ef4444', fontSize: 12 }}>authentication failed — check your GitHub token</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <TokenInputAndRetry tokenKey="githubToken" label="GitHub" onRetry={onRetry} />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ color: '#ef4444', fontSize: 12 }}>{step.error}</div>
      <div style={{ color: 'var(--nap-text-muted)', fontSize: 11, marginTop: 2 }}>enter your GitHub PAT below</div>
      <TokenInputAndRetry tokenKey="githubToken" label="GitHub" onRetry={onRetry} />
    </>
  );
}

// ── Shared: token input + save & retry button ──

function TokenInputAndRetry({
  tokenKey,
  label,
  onRetry,
}: {
  tokenKey: 'githubToken' | 'gitlabToken';
  label: string;
  onRetry: () => void;
}) {
  const [input, setInput] = useState('');

  const handleSaveAndRetry = useCallback(async () => {
    if (!input.trim()) return;
    await setGlobalToken(tokenKey, input.trim());
    onRetry();
  }, [input, tokenKey, onRetry]);

  return (
    <div style={{ marginTop: 6 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2 }}>
        {label} PAT
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid="inline-token-input"
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tokenKey === 'githubToken' ? 'ghp_...' : 'glpat-...'}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAndRetry(); }}
          style={{
            flex: 1,
            padding: '4px 6px',
            border: '1px solid var(--nap-border)',
            borderRadius: 3,
            fontFamily: 'monospace',
            fontSize: 12,
            background: 'var(--nap-bg)',
            color: 'var(--nap-text)',
          }}
        />
        <button
          data-testid="save-and-retry"
          onClick={handleSaveAndRetry}
          style={btnStyle}
        >
          save & retry
        </button>
      </div>
    </div>
  );
}

// ── Standalone settings overlay for LoadingGate ──
// No session/Zustand needed — reads/writes chrome.storage.sync directly.

function LoadingGateSettings({ onClose }: { onClose: () => void }) {
  const [ghInput, setGhInput] = useState(globalTokens.githubToken);
  const [glInput, setGlInput] = useState(globalTokens.gitlabToken);
  const [glHostInput, setGlHostInput] = useState(globalGitlabHostname);
  const [debugInput, setDebugInput] = useState(globalDebugMode);

  const handleSave = useCallback(async () => {
    await setGlobalToken('githubToken', ghInput);
    await setGlobalToken('gitlabToken', glInput);

    const trimmedHost = glHostInput.trim();
    if (trimmedHost && trimmedHost !== globalGitlabHostname) {
      const granted = await requestHostPermission(trimmedHost);
      if (granted) {
        await setGlobalGitlabHostname(trimmedHost);
        setGitlabHostname(trimmedHost);
      }
    }

    if (debugInput !== globalDebugMode) {
      await setGlobalDebugMode(debugInput);
    }

    onClose();
  }, [ghInput, glInput, glHostInput, debugInput, onClose]);

  const inputStyle = {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--nap-border)',
    borderRadius: 3,
    fontFamily: 'monospace',
    fontSize: 12,
    background: 'var(--nap-bg)',
    color: 'var(--nap-text)',
  } as const;

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
        GitLab hostname
      </label>
      <input
        data-testid="settings-gitlab-hostname"
        type="text"
        value={glHostInput}
        onChange={(e) => setGlHostInput(e.target.value)}
        placeholder="gitlab.example.com"
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
          onClick={onClose}
          style={{ padding: '4px 12px', border: '1px solid var(--nap-border)', borderRadius: 3, background: 'var(--nap-bg-secondary)', cursor: 'pointer', fontSize: 12, color: 'var(--nap-text)' }}
        >
          Close
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 11, color: 'var(--nap-text-muted)', cursor: 'pointer' }}>
        <input
          data-testid="settings-debug-mode"
          type="checkbox"
          checked={debugInput}
          onChange={(e) => setDebugInput(e.target.checked)}
        />
        Debug mode (show Playground tab)
      </label>
    </div>
  );
}

const btnStyle = {
  padding: '2px 10px',
  border: '1px solid var(--nap-border)',
  borderRadius: 3,
  background: 'var(--nap-bg-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  color: 'var(--nap-text)',
} as const;
