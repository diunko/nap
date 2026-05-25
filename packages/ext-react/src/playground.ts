/**
 * Playground — YAML config → fake pipeline steps.
 *
 * Parses playground.yaml into StepDefs that the existing pipeline runner executes.
 * Conditions are read live (not snapshotted) at step execution time.
 */

import yaml from 'js-yaml';
import type { StepDef, StepResult } from './pipeline';
import { makeGateStep, type GateStepDef } from './pipeline-steps';

// ── YAML config types ──

export interface PlaygroundStepConfig {
  name: string;
  delay?: number;
  auto_start?: boolean;
  conditions?: Record<string, boolean>;
  on_fail?: Record<string, { error: string; hint: string }>;
}

export interface PlaygroundConfig {
  steps: PlaygroundStepConfig[];
}

// ── Condition state ──

/** Per-step, per-condition booleans. Mutable — read live at execution time. */
export type ConditionState = Record<string, Record<string, boolean>>;

/** Extract initial condition values from parsed YAML config. */
export function extractConditionState(config: PlaygroundConfig): ConditionState {
  const state: ConditionState = {};
  for (const step of config.steps) {
    if (step.conditions) {
      state[step.name] = { ...step.conditions };
    }
  }
  return state;
}

// ── YAML parsing ──

export type ParseResult =
  | { ok: true; config: PlaygroundConfig }
  | { ok: false; error: string };

/** Parse YAML text into PlaygroundConfig. Never throws. */
export function parsePlaygroundYaml(text: string): ParseResult {
  try {
    const doc = yaml.load(text);
    if (!doc || typeof doc !== 'object') {
      return { ok: false, error: 'invalid config: expected an object with a "steps" array' };
    }
    const obj = doc as Record<string, unknown>;
    if (!Array.isArray(obj.steps)) {
      return { ok: false, error: 'invalid config: missing or invalid "steps" array' };
    }
    const steps: PlaygroundStepConfig[] = [];
    for (let i = 0; i < obj.steps.length; i++) {
      const raw = obj.steps[i];
      if (!raw || typeof raw !== 'object' || typeof (raw as any).name !== 'string') {
        return { ok: false, error: `invalid step at index ${i}: missing "name"` };
      }
      const s = raw as Record<string, unknown>;
      steps.push({
        name: s.name as string,
        delay: typeof s.delay === 'number' ? s.delay : undefined,
        auto_start: typeof s.auto_start === 'boolean' ? s.auto_start : undefined,
        conditions: s.conditions && typeof s.conditions === 'object'
          ? s.conditions as Record<string, boolean>
          : undefined,
        on_fail: s.on_fail && typeof s.on_fail === 'object'
          ? s.on_fail as Record<string, { error: string; hint: string }>
          : undefined,
      });
    }
    return { ok: true, config: { steps } };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return { ok: false, error: msg };
  }
}

// ── YAML → fake StepDefs ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert parsed config into StepDefs for the pipeline runner.
 * `conditionState` is a mutable reference — steps read it live at execution time.
 */
export interface YamlToStepsResult {
  steps: StepDef[];
  gateStep: GateStepDef | null;
}

export function yamlToSteps(
  config: PlaygroundConfig,
  conditionState: ConditionState,
): YamlToStepsResult {
  let gateStep: GateStepDef | null = null;

  const steps = config.steps.map((step): StepDef => {
    // auto_start: false → gate step pattern (block until trigger)
    if (step.auto_start === false) {
      const gate = makeGateStep(false);
      // Override name from YAML (may differ from default 'ready')
      const original = gate;
      gateStep = gate;
      return {
        name: step.name,
        run: original.run,
        triggerStart: original.triggerStart,
      } as StepDef & { triggerStart: () => void };
    }

    return {
      name: step.name,
      run: async (): Promise<StepResult> => {
        if (step.delay) await sleep(step.delay);

        const conditions = conditionState[step.name];
        if (conditions) {
          for (const [key, value] of Object.entries(conditions)) {
            if (!value && step.on_fail?.[key]) {
              return { ok: false, ...step.on_fail[key] };
            }
          }
        }
        return { ok: true };
      },
      cleanup: async () => {},
    };
  });

  return { steps, gateStep };
}

// ── Default YAML ──

export const DEFAULT_PLAYGROUND_YAML = `# Playground — edit this file to configure fake pipeline steps
# Switch to the Playground tab to run and test

steps:
  - name: parse URL
    delay: 200

  - name: create session
    delay: 300

  - name: clone repo
    delay: 3000
    conditions:
      token_present: false
      network_available: true
    on_fail:
      token_present: { error: "401 — authentication failed", hint: "enter token" }
      network_available: { error: "network error", hint: "check VPN" }

  - name: scan repo
    delay: 200
    conditions:
      has_nepics: true
    on_fail:
      has_nepics: { error: "no .nap structure found", hint: "wrong repo" }

  - name: load navigation
    delay: 400

  - name: fetch PR diff
    delay: 500
`;
