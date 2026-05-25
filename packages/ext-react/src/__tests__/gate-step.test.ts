import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type StepDef } from '../pipeline';
import { makeGateStep, type GateStepDef } from '../pipeline-steps';
import {
  parsePlaygroundYaml,
  yamlToSteps,
  extractConditionState,
} from '../playground';

function fakeStep(name: string, opts?: { sideEffect?: () => void }): StepDef {
  return {
    name,
    run: async () => { opts?.sideEffect?.(); return { ok: true }; },
  };
}

// ── Layer 1: Gate step — pure logic ──

describe('RS-S01: gate step autoStart=true — resolves immediately', () => {
  it('step 0 done, pipeline continues to step 1', async () => {
    const gate = makeGateStep(true);
    const step1Run = vi.fn();
    const pipeline = createPipeline([gate, fakeStep('step1', { sideEffect: step1Run })]);
    await pipeline.run();

    const state = pipeline.getState();
    expect(state.steps[0].status).toBe('done');
    expect(state.steps[1].status).toBe('done');
    expect(state.overall).toBe('done');
    expect(step1Run).toHaveBeenCalled();
  });
});

describe('RS-S02: gate step autoStart=false — blocks pipeline', () => {
  it('step 0 running, step 1 pending, overall running', async () => {
    const gate = makeGateStep(false);
    const step1Run = vi.fn();
    const pipeline = createPipeline([gate, fakeStep('step1', { sideEffect: step1Run })]);

    // Start pipeline but don't await — gate blocks
    const runPromise = pipeline.run();

    // Allow microtask to settle (gate's run() enters the promise)
    await new Promise((r) => setTimeout(r, 10));

    const state = pipeline.getState();
    expect(state.steps[0].status).toBe('running');
    expect(state.steps[1].status).toBe('pending');
    expect(state.overall).toBe('running');
    expect(step1Run).not.toHaveBeenCalled();

    // Unblock to clean up
    gate.triggerStart();
    await runPromise;
  });
});

describe('RS-S03: gate step triggerStart() — unblocks pipeline', () => {
  it('after trigger, all steps done', async () => {
    const gate = makeGateStep(false);
    const step1Run = vi.fn();
    const step2Run = vi.fn();
    const pipeline = createPipeline([
      gate,
      fakeStep('step1', { sideEffect: step1Run }),
      fakeStep('step2', { sideEffect: step2Run }),
    ]);

    const runPromise = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));

    expect(pipeline.getState().steps[0].status).toBe('running');

    gate.triggerStart();
    await runPromise;

    const state = pipeline.getState();
    expect(state.steps[0].status).toBe('done');
    expect(state.steps[1].status).toBe('done');
    expect(state.steps[2].status).toBe('done');
    expect(state.overall).toBe('done');
    expect(step1Run).toHaveBeenCalled();
    expect(step2Run).toHaveBeenCalled();
  });
});

describe('RS-S04: gate step triggerStart() before run — no crash', () => {
  it('triggerStart before run is a no-op, step still blocks on run', async () => {
    const gate = makeGateStep(false);

    // Call triggerStart before run — startResolve is null, should not crash
    expect(() => gate.triggerStart()).not.toThrow();

    const pipeline = createPipeline([gate, fakeStep('step1')]);
    const runPromise = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));

    // Step should still be blocking (pre-run trigger was lost)
    expect(pipeline.getState().steps[0].status).toBe('running');

    // Now trigger properly
    gate.triggerStart();
    await runPromise;
    expect(pipeline.getState().steps[0].status).toBe('done');
  });
});

describe('RS-S05: gate step name is "ready"', () => {
  it('name matches LoadingGate detection', () => {
    const gate = makeGateStep(false);
    expect(gate.name).toBe('ready');

    const gateTrue = makeGateStep(true);
    expect(gateTrue.name).toBe('ready');
  });
});

describe('RS-S06: gate step is just a step — retryAll resets it', () => {
  it('after retryAll, gate step blocks again, needs fresh triggerStart', async () => {
    const gate = makeGateStep(false);
    const step1Calls: number[] = [];
    let runCount = 0;
    const pipeline = createPipeline([
      gate,
      fakeStep('step1', { sideEffect: () => step1Calls.push(++runCount) }),
    ]);

    // First run: trigger → all done
    const run1 = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));
    gate.triggerStart();
    await run1;
    expect(pipeline.getState().overall).toBe('done');
    expect(step1Calls).toEqual([1]);

    // retryAll → gate should block again
    const retryPromise = pipeline.retryAll();
    await new Promise((r) => setTimeout(r, 10));

    expect(pipeline.getState().steps[0].status).toBe('running');
    expect(pipeline.getState().steps[1].status).toBe('pending');

    // Need fresh trigger
    gate.triggerStart();
    await retryPromise;
    expect(pipeline.getState().overall).toBe('done');
    expect(step1Calls).toEqual([1, 2]);
  });
});

describe('RS-S07: pipeline with gate step — subscriber receives running for step 0', () => {
  it('subscriber fires with step 0 running', async () => {
    const gate = makeGateStep(false);
    const states: Array<{ step0Status: string }> = [];
    const pipeline = createPipeline([gate, fakeStep('step1')]);

    pipeline.subscribe((state) => {
      states.push({ step0Status: state.steps[0].status });
    });

    const runPromise = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));

    expect(states.length).toBeGreaterThan(0);
    expect(states[0].step0Status).toBe('running');

    gate.triggerStart();
    await runPromise;
  });
});

// ── Properties ──

describe('RS-S40: gate step is idempotent — multiple triggerStart calls', () => {
  it('3 calls to triggerStart do not throw or double-resolve', async () => {
    const gate = makeGateStep(false);
    const pipeline = createPipeline([gate, fakeStep('step1')]);

    const runPromise = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));

    // Call triggerStart 3 times — should not throw
    expect(() => gate.triggerStart()).not.toThrow();
    expect(() => gate.triggerStart()).not.toThrow();
    expect(() => gate.triggerStart()).not.toThrow();

    await runPromise;

    const state = pipeline.getState();
    expect(state.steps[0].status).toBe('done');
    expect(state.overall).toBe('done');
  });
});

describe('RS-S41: reset + normal boot distinguishable', () => {
  it('gate(true) completes instantly, gate(false) blocks', async () => {
    // Normal boot: gate(true) → instant
    const gateTrue = makeGateStep(true);
    const p1 = createPipeline([gateTrue, fakeStep('s1')]);
    await p1.run();
    expect(p1.getState().overall).toBe('done');

    // Reset: gate(false) → blocks
    const gateFalse = makeGateStep(false);
    const p2 = createPipeline([gateFalse, fakeStep('s1')]);
    const run2 = p2.run();
    await new Promise((r) => setTimeout(r, 10));
    expect(p2.getState().steps[0].status).toBe('running');
    expect(p2.getState().overall).toBe('running');

    gateFalse.triggerStart();
    await run2;
  });
});

// ── Layer 4: Playground auto_start ──

describe('RS-S30: parsePlaygroundYaml parses auto_start field', () => {
  it('auto_start: false parsed on first step', () => {
    const yaml = `
steps:
  - name: ready
    auto_start: false
  - name: clone repo
    delay: 1000
`;
    const result = parsePlaygroundYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.steps[0].auto_start).toBe(false);
    expect(result.config.steps[1].auto_start).toBeUndefined();
  });
});

describe('RS-S31: yamlToSteps with auto_start=false creates blocking step', () => {
  it('step 0 blocks pipeline', async () => {
    const yaml = `
steps:
  - name: ready
    auto_start: false
  - name: do work
    delay: 0
`;
    const result = parsePlaygroundYaml(yaml);
    if (!result.ok) throw new Error('parse failed');
    const condState = extractConditionState(result.config);
    const { steps, gateStep } = yamlToSteps(result.config, condState);

    expect(gateStep).not.toBeNull();

    const pipeline = createPipeline(steps);
    const runPromise = pipeline.run();
    await new Promise((r) => setTimeout(r, 10));

    expect(pipeline.getState().steps[0].status).toBe('running');
    expect(pipeline.getState().steps[1].status).toBe('pending');

    gateStep!.triggerStart();
    await runPromise;
    expect(pipeline.getState().overall).toBe('done');
  });
});

describe('RS-S32: yamlToSteps without auto_start — step runs normally', () => {
  it('step 0 resolves immediately', async () => {
    const yaml = `
steps:
  - name: first step
  - name: second step
`;
    const result = parsePlaygroundYaml(yaml);
    if (!result.ok) throw new Error('parse failed');
    const condState = extractConditionState(result.config);
    const { steps, gateStep } = yamlToSteps(result.config, condState);

    expect(gateStep).toBeNull();

    const pipeline = createPipeline(steps);
    await pipeline.run();
    expect(pipeline.getState().steps[0].status).toBe('done');
    expect(pipeline.getState().overall).toBe('done');
  });
});

describe('RS-S33: yamlToSteps auto_start=true — step runs normally', () => {
  it('auto_start true is treated same as absent', async () => {
    const yaml = `
steps:
  - name: ready
    auto_start: true
  - name: work
`;
    const result = parsePlaygroundYaml(yaml);
    if (!result.ok) throw new Error('parse failed');
    const condState = extractConditionState(result.config);
    const { steps, gateStep } = yamlToSteps(result.config, condState);

    // auto_start: true → normal step, not a gate step
    expect(gateStep).toBeNull();

    const pipeline = createPipeline(steps);
    await pipeline.run();
    expect(pipeline.getState().overall).toBe('done');
  });
});

describe('RS-S34: playground default YAML — existing steps unchanged', () => {
  it('default YAML parses with all expected step names', async () => {
    const { DEFAULT_PLAYGROUND_YAML } = await import('../playground');
    const result = parsePlaygroundYaml(DEFAULT_PLAYGROUND_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const names = result.config.steps.map((s) => s.name);
    expect(names).toContain('parse URL');
    expect(names).toContain('create session');
    expect(names).toContain('clone repo');
    expect(names).toContain('scan repo');
    expect(names).toContain('load navigation');
    expect(names).toContain('fetch PR diff');

    // Conditions still present on clone repo
    const cloneStep = result.config.steps.find((s) => s.name === 'clone repo');
    expect(cloneStep?.conditions?.token_present).toBe(false);
    expect(cloneStep?.conditions?.network_available).toBe(true);
  });
});
