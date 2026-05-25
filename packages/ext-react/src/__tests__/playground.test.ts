import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parsePlaygroundYaml,
  yamlToSteps,
  extractConditionState,
  DEFAULT_PLAYGROUND_YAML,
  type ConditionState,
  type PlaygroundConfig,
} from '../playground';
import { createPipeline } from '../pipeline';
import { makeInitFsStep } from '../pipeline-steps';

// ── PG-S01: parsePlaygroundYaml — valid config ──

describe('PG-S01: parsePlaygroundYaml — valid config', () => {
  it('parses YAML with 3 steps including delays, conditions, on_fail', () => {
    const yaml = `
steps:
  - name: parse URL
    delay: 200
  - name: clone repo
    delay: 3000
    conditions:
      token_present: false
      network_available: true
    on_fail:
      token_present: { error: "401", hint: "enter token" }
      network_available: { error: "network error", hint: "check VPN" }
  - name: scan repo
    delay: 200
    conditions:
      has_nepics: true
    on_fail:
      has_nepics: { error: "no .nap structure", hint: "wrong repo" }
`;
    const result = parsePlaygroundYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.steps).toHaveLength(3);
    expect(result.config.steps[0].name).toBe('parse URL');
    expect(result.config.steps[0].delay).toBe(200);
    expect(result.config.steps[1].name).toBe('clone repo');
    expect(result.config.steps[1].delay).toBe(3000);
    expect(result.config.steps[1].conditions).toEqual({
      token_present: false,
      network_available: true,
    });
    expect(result.config.steps[1].on_fail?.token_present.error).toBe('401');
    expect(result.config.steps[2].conditions?.has_nepics).toBe(true);
  });
});

// ── PG-S02: parsePlaygroundYaml — invalid YAML returns error ──

describe('PG-S02: parsePlaygroundYaml — invalid YAML returns error', () => {
  it('returns error for invalid indentation', () => {
    const result = parsePlaygroundYaml('steps:\n  - name: foo\n  bar');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});

// ── PG-S03: parsePlaygroundYaml — partial YAML (auto-save mid-edit) ──

describe('PG-S03: parsePlaygroundYaml — partial YAML (auto-save mid-edit)', () => {
  it('handles incomplete but syntactically valid YAML without crash', () => {
    const result = parsePlaygroundYaml('steps:\n  - name: pa');
    // This is valid YAML — just an incomplete step name
    // Should parse, but only has 1 step with name "pa"
    if (result.ok) {
      expect(result.config.steps).toHaveLength(1);
      expect(result.config.steps[0].name).toBe('pa');
    }
    // Either way: no crash
    expect(true).toBe(true);
  });

  it('returns error for step missing name field', () => {
    const result = parsePlaygroundYaml('steps:\n  - delay: 200');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing "name"');
    }
  });
});

// ── PG-S04: parsePlaygroundYaml — empty / whitespace / null-ish ──

describe('PG-S04: parsePlaygroundYaml — empty / whitespace / null-ish', () => {
  it('returns error for empty string', () => {
    const result = parsePlaygroundYaml('');
    expect(result.ok).toBe(false);
  });

  it('returns error for whitespace only', () => {
    const result = parsePlaygroundYaml('   ');
    expect(result.ok).toBe(false);
  });

  it('returns error for YAML doc separator only', () => {
    const result = parsePlaygroundYaml('---');
    expect(result.ok).toBe(false);
  });
});

// ── PG-S05: yamlToSteps — maps config to working StepDefs ──

describe('PG-S05: yamlToSteps — maps config to working StepDefs', () => {
  it('produces 3 StepDefs, all succeed (no conditions)', async () => {
    vi.useFakeTimers();
    const config: PlaygroundConfig = {
      steps: [
        { name: 'step-a', delay: 100 },
        { name: 'step-b', delay: 200 },
        { name: 'step-c' },
      ],
    };
    const conditionState: ConditionState = {};
    const { steps } = yamlToSteps(config, conditionState);

    expect(steps).toHaveLength(3);
    expect(steps[0].name).toBe('step-a');
    expect(steps[1].name).toBe('step-b');
    expect(steps[2].name).toBe('step-c');

    // Run step-c (no delay)
    const p = steps[2].run({});
    const result = await p;
    expect(result).toEqual({ ok: true });

    vi.useRealTimers();
  });
});

// ── PG-S06: yamlToSteps — condition true → step succeeds ──

describe('PG-S06: yamlToSteps — condition true → step succeeds', () => {
  it('step with all conditions true succeeds', async () => {
    const config: PlaygroundConfig = {
      steps: [{
        name: 'clone',
        conditions: { token_present: true },
        on_fail: { token_present: { error: '401', hint: 'enter token' } },
      }],
    };
    const conditionState: ConditionState = { clone: { token_present: true } };
    const { steps } = yamlToSteps(config, conditionState);
    const result = await steps[0].run({});
    expect(result).toEqual({ ok: true });
  });
});

// ── PG-S07: yamlToSteps — condition false → step fails with on_fail ──

describe('PG-S07: yamlToSteps — condition false → step fails with on_fail', () => {
  it('step with false condition returns on_fail error and hint', async () => {
    const config: PlaygroundConfig = {
      steps: [{
        name: 'clone',
        conditions: { token_present: true },
        on_fail: { token_present: { error: '401', hint: 'enter token' } },
      }],
    };
    const conditionState: ConditionState = { clone: { token_present: false } };
    const { steps } = yamlToSteps(config, conditionState);
    const result = await steps[0].run({});
    expect(result).toEqual({ ok: false, error: '401', hint: 'enter token' });
  });
});

// ── PG-S08: condition state — initial values extracted from YAML ──

describe('PG-S08: condition state — initial values from YAML', () => {
  it('extracts per-step conditions matching YAML values', () => {
    const config: PlaygroundConfig = {
      steps: [
        { name: 'parse URL' },
        {
          name: 'clone repo',
          conditions: { token_present: false, network_available: true },
        },
        {
          name: 'scan repo',
          conditions: { has_nepics: true },
        },
      ],
    };
    const state = extractConditionState(config);
    expect(state['clone repo']).toEqual({ token_present: false, network_available: true });
    expect(state['scan repo']).toEqual({ has_nepics: true });
    expect(state['parse URL']).toBeUndefined();
  });
});

// ── PG-S09: condition state — toggle overrides initial value ──

describe('PG-S09: condition state — toggle overrides initial value', () => {
  it('mutating conditionState changes step behavior', async () => {
    const config: PlaygroundConfig = {
      steps: [{
        name: 'clone',
        conditions: { token_present: true },
        on_fail: { token_present: { error: '401', hint: 'h' } },
      }],
    };
    const conditionState: ConditionState = { clone: { token_present: false } };
    const { steps } = yamlToSteps(config, conditionState);

    // Before toggle — fails
    let result = await steps[0].run({});
    expect(result.ok).toBe(false);

    // Toggle
    conditionState['clone'].token_present = true;

    // After toggle — succeeds
    result = await steps[0].run({});
    expect(result.ok).toBe(true);
  });
});

// ── PG-S10: condition state — live read at execution time, not snapshot ──

describe('PG-S10: condition state — live read, not snapshot', () => {
  it('toggle mid-pipeline affects later step', async () => {
    const config: PlaygroundConfig = {
      steps: [
        { name: 'step-0', delay: 0 },
        {
          name: 'step-1',
          delay: 0,
          conditions: { token_present: true },
          on_fail: { token_present: { error: '401', hint: 'h' } },
        },
      ],
    };
    const conditionState: ConditionState = { 'step-1': { token_present: false } };
    const { steps } = yamlToSteps(config, conditionState);

    const pipeline = createPipeline(steps);

    // Toggle token_present after step 0 completes
    pipeline.subscribe((state) => {
      if (state.steps[0].status === 'done' && state.steps[1].status === 'pending') {
        conditionState['step-1'].token_present = true;
      }
    });

    await pipeline.run();
    const final = pipeline.getState();
    expect(final.steps[1].status).toBe('done');
    expect(final.overall).toBe('done');
  });
});

// ── PG-S11: condition state — re-run after YAML change resets conditions ──

describe('PG-S11: re-parse YAML resets condition state', () => {
  it('toggle is forgotten after extractConditionState from new parse', () => {
    const yaml = `
steps:
  - name: clone
    conditions:
      token_present: false
`;
    const result = parsePlaygroundYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let conditionState = extractConditionState(result.config);
    expect(conditionState['clone'].token_present).toBe(false);

    // User toggles
    conditionState['clone'].token_present = true;
    expect(conditionState['clone'].token_present).toBe(true);

    // Re-parse (simulates YAML change)
    const result2 = parsePlaygroundYaml(yaml);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;

    conditionState = extractConditionState(result2.config);
    expect(conditionState['clone'].token_present).toBe(false);
  });
});

// ── PG-S12: multiple conditions — first unmet determines error ──

describe('PG-S12: multiple conditions — first unmet determines error', () => {
  it('returns error from first false condition (insertion order)', async () => {
    const config: PlaygroundConfig = {
      steps: [{
        name: 'clone',
        conditions: { token_present: true, network_available: true },
        on_fail: {
          token_present: { error: '401', hint: 'enter token' },
          network_available: { error: 'network error', hint: 'check VPN' },
        },
      }],
    };
    const conditionState: ConditionState = {
      clone: { token_present: false, network_available: false },
    };
    const { steps } = yamlToSteps(config, conditionState);
    const result = await steps[0].run({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // First condition in insertion order is token_present
      expect(result.error).toBe('401');
      expect(result.hint).toBe('enter token');
    }
  });
});

// ── PG-S13: toggle → retry → pass (the core interaction) ──

describe('PG-S13: toggle → retry → pass (core interaction)', () => {
  it('run → fail → toggle → retry → all done', async () => {
    const config: PlaygroundConfig = {
      steps: [
        { name: 'step-0' },
        { name: 'step-1' },
        {
          name: 'step-2',
          conditions: { token_present: true },
          on_fail: { token_present: { error: '401', hint: 'h' } },
        },
        { name: 'step-3' },
        { name: 'step-4' },
      ],
    };
    const conditionState: ConditionState = {
      'step-2': { token_present: false },
    };
    const { steps } = yamlToSteps(config, conditionState);
    const pipeline = createPipeline(steps);

    // Run — step-2 should fail
    await pipeline.run();
    let state = pipeline.getState();
    expect(state.steps[2].status).toBe('error');
    expect(state.steps[2].error).toBe('401');
    expect(state.steps[3].status).toBe('pending');

    // Toggle condition
    conditionState['step-2'].token_present = true;

    // Retry step 2
    await pipeline.retry(2);
    state = pipeline.getState();
    expect(state.steps[2].status).toBe('done');
    expect(state.steps[3].status).toBe('done');
    expect(state.steps[4].status).toBe('done');
    expect(state.overall).toBe('done');
  });
});

// ── PG-S14: DEFAULT_PLAYGROUND_YAML is valid and parseable ──

describe('PG-S14: DEFAULT_PLAYGROUND_YAML is valid', () => {
  it('parses to a valid config with steps and at least one false condition', () => {
    const result = parsePlaygroundYaml(DEFAULT_PLAYGROUND_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.steps.length).toBeGreaterThanOrEqual(3);

    // At least one step should have a condition set to false
    const condState = extractConditionState(result.config);
    const hasFalse = Object.values(condState).some((stepConds) =>
      Object.values(stepConds).some((v) => v === false),
    );
    expect(hasFalse).toBe(true);
  });
});

// ── PG-S15: file seeding — creates if not exists, skips if exists ──

describe('PG-S15: file seeding — creates if not exists, skips if exists', () => {
  function makeMockAdapter(fileExists: boolean) {
    return {
      mkdir: vi.fn(async () => {}),
      exists: vi.fn(async () => fileExists),
      writeFile: vi.fn(async () => {}),
    } as any;
  }

  it('creates playground.yaml when it does not exist', async () => {
    const adapter = makeMockAdapter(false);
    const step = makeInitFsStep();
    const ctx = { adapter } as any;
    const result = await step.run(ctx);

    expect(result.ok).toBe(true);
    expect(adapter.exists).toHaveBeenCalledWith('/home/user/playground.yaml');
    expect(adapter.writeFile).toHaveBeenCalledWith(
      '/home/user/playground.yaml',
      expect.stringContaining('steps:'),
    );
  });

  it('does not overwrite existing playground.yaml', async () => {
    const adapter = makeMockAdapter(true);
    const step = makeInitFsStep();
    const ctx = { adapter } as any;
    const result = await step.run(ctx);

    expect(result.ok).toBe(true);
    expect(adapter.exists).toHaveBeenCalledWith('/home/user/playground.yaml');
    expect(adapter.writeFile).not.toHaveBeenCalled();
  });
});
