/**
 * PlaygroundPane — interactive pipeline testing surface.
 *
 * Reads playground.yaml from LFS, parses it, renders LoadingGate with
 * per-step condition checkboxes. Conditions are live — not snapshotted on run.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LightningFsAdapter } from './fs-adapter';
import { createPipeline, type Pipeline } from './pipeline';
import { LoadingGate } from './LoadingGate';
import type { GateStepDef } from './pipeline-steps';
import {
  parsePlaygroundYaml,
  yamlToSteps,
  extractConditionState,
  type PlaygroundConfig,
  type ConditionState,
} from './playground';

const PLAYGROUND_PATH = '/home/user/playground.yaml';

export function PlaygroundPane({ adapter }: { adapter: LightningFsAdapter }) {
  const [config, setConfig] = useState<PlaygroundConfig | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [gateStep, setGateStep] = useState<GateStepDef | null>(null);
  const [, forceUpdate] = useState(0);
  const conditionRef = useRef<ConditionState>({});

  // Read and parse playground.yaml
  const loadConfig = useCallback(async () => {
    try {
      const text = await adapter.readFile(PLAYGROUND_PATH);
      const result = parsePlaygroundYaml(text);
      if (result.ok) {
        setConfig(result.config);
        setParseError(null);
        conditionRef.current = extractConditionState(result.config);
      } else {
        setConfig(null);
        setParseError(result.error);
      }
    } catch {
      setConfig(null);
      setParseError('playground.yaml not found');
    }
  }, [adapter]);

  // Load on mount + subscribe to LFS changes
  useEffect(() => {
    loadConfig();
    const unsub = adapter.onChange((event) => {
      if (event.path === PLAYGROUND_PATH) {
        loadConfig();
      }
    });
    return unsub;
  }, [adapter, loadConfig]);

  // Run pipeline
  const handleRun = useCallback(() => {
    if (!config) return;
    // Destroy previous pipeline
    pipeline?.destroy();
    // Reset conditions from current config
    conditionRef.current = extractConditionState(config);
    const { steps, gateStep } = yamlToSteps(config, conditionRef.current);
    const p = createPipeline(steps);
    p.subscribe(() => forceUpdate((n) => n + 1));
    setPipeline(p);
    setGateStep(gateStep);
    p.run();
  }, [config, pipeline]);

  // Toggle a condition
  const toggleCondition = useCallback((stepName: string, condKey: string) => {
    const stepConds = conditionRef.current[stepName];
    if (stepConds) {
      stepConds[condKey] = !stepConds[condKey];
      forceUpdate((n) => n + 1);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pipeline?.destroy();
    };
  }, [pipeline]);

  // Parse error state
  if (parseError) {
    return (
      <div
        data-testid="playground-pane"
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
        <div data-testid="playground-error" style={{ color: '#ef4444', fontSize: 13 }}>
          YAML parse error
        </div>
        <div style={{ fontSize: 11, marginTop: 8, maxWidth: 400, wordBreak: 'break-word' }}>
          {parseError}
        </div>
      </div>
    );
  }

  // No config yet (loading)
  if (!config) return null;

  return (
    <div
      data-testid="playground-pane"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
      }}
    >
      {/* Controls bar */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--nap-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          data-testid="playground-run"
          onClick={handleRun}
          style={{
            padding: '4px 16px',
            border: '1px solid var(--nap-border)',
            borderRadius: 3,
            background: 'var(--nap-bg-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--nap-text)',
          }}
        >
          run
        </button>
        <span style={{ fontSize: 11, color: 'var(--nap-text-dim)' }}>
          {config.steps.length} steps
        </span>
      </div>

      {/* Pipeline + conditions */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {pipeline ? (
          <div>
            <LoadingGate pipeline={pipeline} gateStep={gateStep ?? undefined} />
            <ConditionPanel
              config={config}
              conditionState={conditionRef.current}
              onToggle={toggleCondition}
            />
          </div>
        ) : (
          <StepPreview config={config} conditionState={conditionRef.current} onToggle={toggleCondition} />
        )}
      </div>
    </div>
  );
}

// ── Step preview (before first run) ──

function StepPreview({
  config,
  conditionState,
  onToggle,
}: {
  config: PlaygroundConfig;
  conditionState: ConditionState;
  onToggle: (stepName: string, condKey: string) => void;
}) {
  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      {config.steps.map((step, i) => (
        <div key={i} style={{ padding: '4px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--nap-text-dim)', width: 16, textAlign: 'center' }}>
              {'\u25CB'}
            </span>
            <span style={{ color: 'var(--nap-text-dim)' }}>{step.name}</span>
          </div>
          {step.conditions && (
            <div style={{ marginLeft: 24, marginTop: 4 }}>
              {Object.entries(step.conditions).map(([key]) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--nap-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid={`cond-${step.name}-${key}`}
                    checked={conditionState[step.name]?.[key] ?? false}
                    onChange={() => onToggle(step.name, key)}
                  />
                  {key}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Condition panel (shown alongside LoadingGate during/after run) ──

function ConditionPanel({
  config,
  conditionState,
  onToggle,
}: {
  config: PlaygroundConfig;
  conditionState: ConditionState;
  onToggle: (stepName: string, condKey: string) => void;
}) {
  const stepsWithConditions = config.steps.filter((s) => s.conditions);
  if (stepsWithConditions.length === 0) return null;

  return (
    <div
      data-testid="condition-panel"
      style={{
        marginTop: 16,
        padding: '12px 16px',
        border: '1px solid var(--nap-border)',
        borderRadius: 4,
        maxWidth: 400,
        margin: '16px auto 0',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--nap-text-muted)', marginBottom: 8 }}>
        conditions (live)
      </div>
      {stepsWithConditions.map((step) => (
        <div key={step.name} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--nap-text)', marginBottom: 2 }}>
            {step.name}
          </div>
          {Object.entries(step.conditions!).map(([key]) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--nap-text-muted)',
                cursor: 'pointer',
                marginLeft: 8,
              }}
            >
              <input
                type="checkbox"
                data-testid={`cond-${step.name}-${key}`}
                checked={conditionState[step.name]?.[key] ?? false}
                onChange={() => onToggle(step.name, key)}
              />
              {key}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
