/**
 * Loading gate — renders pipeline progress as a step list.
 *
 * Replaces the boot-gate pattern. Shows:
 * - checkmark (done), spinner (running), error+hint+retry (error), circle (pending)
 * - Settings overlay for token entry on auth failure
 * - Retry-all link at the bottom on error
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Pipeline, PipelineState } from './pipeline';

export function LoadingGate({
  pipeline,
  onSettingsNeeded,
}: {
  pipeline: Pipeline;
  onSettingsNeeded?: () => { store: any } | null;
}) {
  const [state, setState] = useState<PipelineState>(pipeline.getState());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => pipeline.subscribe(setState), [pipeline]);

  // Token inputs (for inline settings)
  const ctx = pipeline.getCtx();
  const store = ctx.store;

  return (
    <div
      data-testid="loading-gate"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        color: 'var(--nap-text-muted)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {state.steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            index={i}
            onRetry={() => pipeline.retry(i)}
            onOpenSettings={() => setSettingsOpen(true)}
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

      {settingsOpen && store && (
        <TokenOverlay store={store} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

// ── Step row ──

function StepRow({
  step,
  index,
  onRetry,
  onOpenSettings,
}: {
  step: PipelineState['steps'][0];
  index: number;
  onRetry: () => void;
  onOpenSettings: () => void;
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
          {step.name}{step.status === 'running' ? '...' : ''}
        </span>
      </div>

      {step.status === 'error' && (
        <div style={{ marginLeft: 24, marginTop: 4 }}>
          <div style={{ color: '#ef4444', fontSize: 12 }}>{step.error}</div>
          <div style={{ color: 'var(--nap-text-muted)', fontSize: 11, marginTop: 2 }}>{step.hint}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              data-testid={`retry-step-${index}`}
              onClick={onRetry}
              style={{
                padding: '2px 10px',
                border: '1px solid var(--nap-border)',
                borderRadius: 3,
                background: 'var(--nap-bg-secondary)',
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--nap-text)',
              }}
            >
              retry
            </button>
            {step.hint?.includes('token in settings') && (
              <button
                data-testid="open-settings"
                onClick={onOpenSettings}
                style={{
                  padding: '2px 10px',
                  border: '1px solid var(--nap-border)',
                  borderRadius: 3,
                  background: 'var(--nap-bg-secondary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'var(--nap-text)',
                }}
              >
                &#9881; settings
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline token overlay ──

function TokenOverlay({ store, onClose }: { store: any; onClose: () => void }) {
  const s = store.getState();
  const [ghInput, setGhInput] = useState(s.githubToken || '');
  const [glInput, setGlInput] = useState(s.gitlabToken || '');

  const handleSave = useCallback(() => {
    store.getState().setGithubToken(ghInput);
    store.getState().setGitlabToken(glInput);
    onClose();
  }, [ghInput, glInput, store, onClose]);

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
      data-testid="loading-gate-settings"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--nap-bg)',
        zIndex: 100,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h3 style={{ fontSize: 13, marginBottom: 12 }}>Settings</h3>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2 }}>
          GitHub PAT
        </label>
        <input
          data-testid="gate-github-token"
          type="password"
          value={ghInput}
          onChange={(e) => setGhInput(e.target.value)}
          placeholder="ghp_..."
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 2, marginTop: 12 }}>
          GitLab PAT
        </label>
        <input
          data-testid="gate-gitlab-token"
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
      </div>
    </div>
  );
}
