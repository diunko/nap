import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type StepDef, type PipelineState } from '../pipeline';
import {
  makeCloneStep,
  makeScanRepoStep,
  makeValidateStep,
  makeSessionStep,
  makeFetchDiffStep,
  type PipelineCtx,
  type CloneFn,
  type FindRootFn,
} from '../pipeline-steps';
import type { NapConfig } from '../url-config';

// ── Test harness ──

function fakeStep(
  name: string,
  options?: {
    fail?: { error: string; hint: string };
    cleanup?: () => Promise<void>;
    sideEffect?: () => void;
    skip?: (ctx: any) => boolean;
  },
): StepDef {
  return {
    name,
    run: async () => {
      options?.sideEffect?.();
      if (options?.fail) return { ok: false, ...options.fail };
      return { ok: true };
    },
    cleanup: options?.cleanup,
    skip: options?.skip,
  };
}

// ── Layer 1: Pipeline runner — pure logic ──

describe('LP-S01: sequential execution — all succeed', () => {
  it('executes 5 steps in order, all done', async () => {
    const order: number[] = [];
    const steps = Array.from({ length: 5 }, (_, i) =>
      fakeStep(`step${i}`, { sideEffect: () => order.push(i) }),
    );
    const pipeline = createPipeline(steps);
    await pipeline.run();

    const state = pipeline.getState();
    expect(state.steps.every((s) => s.status === 'done')).toBe(true);
    expect(state.overall).toBe('done');
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('LP-S02: failure stops the pipeline', () => {
  it('step 2 fails, steps 3-4 stay pending', async () => {
    const ran: number[] = [];
    const steps = [
      fakeStep('step0', { sideEffect: () => ran.push(0) }),
      fakeStep('step1', { sideEffect: () => ran.push(1) }),
      fakeStep('step2', {
        sideEffect: () => ran.push(2),
        fail: { error: 'boom', hint: 'fix it' },
      }),
      fakeStep('step3', { sideEffect: () => ran.push(3) }),
      fakeStep('step4', { sideEffect: () => ran.push(4) }),
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();

    const state = pipeline.getState();
    expect(state.steps[0].status).toBe('done');
    expect(state.steps[1].status).toBe('done');
    expect(state.steps[2].status).toBe('error');
    expect(state.steps[2].error).toBe('boom');
    expect(state.steps[2].hint).toBe('fix it');
    expect(state.steps[3].status).toBe('pending');
    expect(state.steps[4].status).toBe('pending');
    expect(state.overall).toBe('error');
    expect(ran).toEqual([0, 1, 2]); // steps 3-4 never called
  });
});

describe('LP-S03: retry from failed step — succeeds', () => {
  it('retry re-runs failed step, then continues forward', async () => {
    let failStep2 = true;
    const calls: string[] = [];
    const steps = [
      fakeStep('step0', { sideEffect: () => calls.push('run0') }),
      fakeStep('step1', { sideEffect: () => calls.push('run1') }),
      {
        name: 'step2',
        run: async () => {
          calls.push('run2');
          if (failStep2) return { ok: false as const, error: 'e', hint: 'h' };
          return { ok: true as const };
        },
      },
      fakeStep('step3', { sideEffect: () => calls.push('run3') }),
      fakeStep('step4', { sideEffect: () => calls.push('run4') }),
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();

    expect(pipeline.getState().steps[2].status).toBe('error');

    // Fix step 2 and retry
    failStep2 = false;
    await pipeline.retry(2);

    const state = pipeline.getState();
    expect(state.steps[2].status).toBe('done');
    expect(state.steps[3].status).toBe('done');
    expect(state.steps[4].status).toBe('done');
    expect(state.overall).toBe('done');
    // step2 sideEffect called twice (fail + success), steps 3-4 called once
    expect(calls.filter((c) => c === 'run2').length).toBe(2);
    expect(calls.filter((c) => c === 'run3').length).toBe(1);
    expect(calls.filter((c) => c === 'run4').length).toBe(1);
  });
});

describe('LP-S04: retry from failed step — fails again', () => {
  it('step stays in error after retry fails', async () => {
    const steps = [
      fakeStep('step0'),
      fakeStep('step1'),
      fakeStep('step2', { fail: { error: 'e', hint: 'h' } }),
      fakeStep('step3'),
      fakeStep('step4'),
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();

    const before = pipeline.getState();
    await pipeline.retry(2);
    const after = pipeline.getState();

    expect(after.steps[2].status).toBe('error');
    expect(after.steps[3].status).toBe('pending');
    expect(after.steps[4].status).toBe('pending');
    expect(after.overall).toBe('error');
    // State after second failure matches first
    expect(after.steps[2].error).toBe(before.steps[2].error);
  });
});

describe('LP-S05: retry-all with cleanup', () => {
  it('cleanup called for done steps (reverse), not for failed step', async () => {
    const cleanupOrder: number[] = [];
    const runOrder: number[] = [];
    const steps = [
      fakeStep('step0', {
        sideEffect: () => runOrder.push(0),
        cleanup: async () => { cleanupOrder.push(0); },
      }),
      fakeStep('step1', {
        sideEffect: () => runOrder.push(1),
        cleanup: async () => { cleanupOrder.push(1); },
      }),
      fakeStep('step2', {
        sideEffect: () => runOrder.push(2),
        fail: { error: 'e', hint: 'h' },
        cleanup: async () => { cleanupOrder.push(2); },
      }),
      fakeStep('step3', { sideEffect: () => runOrder.push(3) }),
      fakeStep('step4', { sideEffect: () => runOrder.push(4) }),
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();

    expect(pipeline.getState().overall).toBe('error');
    cleanupOrder.length = 0;
    runOrder.length = 0;

    // retryAll — should cleanup done steps only (1, 0 in reverse)
    // Make step2 succeed this time
    steps[2] = fakeStep('step2', {
      sideEffect: () => runOrder.push(2),
      cleanup: async () => { cleanupOrder.push(2); },
    });
    await pipeline.retryAll();

    // Cleanup was called for steps 1, 0 (reverse order of done steps)
    // Step 2 was 'error', so its cleanup was NOT called
    expect(cleanupOrder).toEqual([1, 0]);
    // All steps re-ran from 0
    expect(runOrder).toEqual([0, 1, 2, 3, 4]);
    expect(pipeline.getState().overall).toBe('done');
  });
});

describe('LP-S06: cleanup reverse order', () => {
  it('all 4 steps succeed, retryAll → cleanup in reverse', async () => {
    const cleanupOrder: number[] = [];
    const steps = Array.from({ length: 4 }, (_, i) =>
      fakeStep(`step${i}`, {
        cleanup: async () => { cleanupOrder.push(i); },
      }),
    );
    const pipeline = createPipeline(steps);
    await pipeline.run();
    expect(pipeline.getState().overall).toBe('done');

    await pipeline.retryAll();

    expect(cleanupOrder).toEqual([3, 2, 1, 0]);
  });
});

describe('LP-S07: skip logic', () => {
  it('skipped step is marked done without running', async () => {
    const step4Side = vi.fn();
    const step5Side = vi.fn();
    const steps = [
      fakeStep('step0'),
      fakeStep('step1'),
      fakeStep('step2'),
      fakeStep('step3'),
      fakeStep('step4', { sideEffect: step4Side, skip: () => true }),
      fakeStep('step5', { sideEffect: step5Side }),
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();

    const state = pipeline.getState();
    expect(state.steps[4].status).toBe('done');
    expect(step4Side).not.toHaveBeenCalled();
    expect(step5Side).toHaveBeenCalled();
    expect(state.overall).toBe('done');
  });
});

describe('LP-S08: state subscriber fires on every transition', () => {
  it('subscriber sees running→done for each step', async () => {
    const transitions: Array<{ step: number; status: string }> = [];
    const steps = [
      fakeStep('step0'),
      fakeStep('step1'),
      fakeStep('step2'),
    ];
    const pipeline = createPipeline(steps);
    pipeline.subscribe((state) => {
      // Record the current step's status transition
      const cs = state.currentStep;
      transitions.push({ step: cs, status: state.steps[cs].status });
    });
    await pipeline.run();

    // Each step should fire twice: running, then done
    expect(transitions).toEqual([
      { step: 0, status: 'running' },
      { step: 0, status: 'done' },
      { step: 1, status: 'running' },
      { step: 1, status: 'done' },
      { step: 2, status: 'running' },
      { step: 2, status: 'done' },
    ]);
  });
});

describe('LP-S09: destroyed pipeline doesn\'t continue', () => {
  it('step 1 never runs after destroy', async () => {
    const step1Side = vi.fn();
    const steps = [
      fakeStep('step0'),
      fakeStep('step1', { sideEffect: step1Side }),
    ];
    const pipeline = createPipeline(steps);

    // Destroy after step 0 completes
    pipeline.subscribe((state) => {
      if (state.steps[0].status === 'done') {
        pipeline.destroy();
      }
    });

    await pipeline.run();
    expect(step1Side).not.toHaveBeenCalled();
  });
});

describe('LP-S10: concurrent retry calls — only one wins', () => {
  it('step 2 runs exactly once per retry resolution', async () => {
    let runCount = 0;
    const steps = [
      fakeStep('step0'),
      fakeStep('step1'),
      {
        name: 'step2',
        run: async () => {
          runCount++;
          return { ok: false as const, error: 'e', hint: 'h' };
        },
      },
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();
    expect(runCount).toBe(1);

    // Call retry twice simultaneously
    const p1 = pipeline.retry(2);
    const p2 = pipeline.retry(2);
    await Promise.all([p1, p2]);

    // Step 2 should have run exactly once more (second retry rejected)
    expect(runCount).toBe(2);
  });
});

// ── Layer 3: Pipeline properties ──

describe('LP-S30: state consistency — structural property', () => {
  it('structural invariant holds after each state callback', async () => {
    // Random failure pattern: steps 0-7, step 3 fails
    const steps = Array.from({ length: 8 }, (_, i) =>
      i === 3
        ? fakeStep(`step${i}`, { fail: { error: 'e', hint: 'h' } })
        : fakeStep(`step${i}`),
    );
    const pipeline = createPipeline(steps);

    pipeline.subscribe((state) => {
      const { steps: ss, currentStep: cs, overall } = state;
      // At most one step running
      expect(ss.filter((s) => s.status === 'running').length).toBeLessThanOrEqual(1);

      // All steps before currentStep are done
      for (let i = 0; i < cs; i++) {
        expect(ss[i].status).toBe('done');
      }

      // All steps after currentStep are pending
      for (let i = cs + 1; i < ss.length; i++) {
        expect(ss[i].status).toBe('pending');
      }

      // Overall matches
      if (ss.some((s) => s.status === 'error')) {
        expect(overall).toBe('error');
      } else if (ss.every((s) => s.status === 'done')) {
        expect(overall).toBe('done');
      } else {
        expect(overall).toBe('running');
      }
    });

    await pipeline.run();
  });

  it('structural invariant holds across retry', async () => {
    let failOnce = true;
    const steps = [
      fakeStep('step0'),
      fakeStep('step1'),
      {
        name: 'step2',
        run: async () => {
          if (failOnce) { failOnce = false; return { ok: false as const, error: 'e', hint: 'h' }; }
          return { ok: true as const };
        },
      },
      fakeStep('step3'),
    ];
    const pipeline = createPipeline(steps);

    pipeline.subscribe((state) => {
      const { steps: ss, overall } = state;
      expect(ss.filter((s) => s.status === 'running').length).toBeLessThanOrEqual(1);
      if (ss.some((s) => s.status === 'error')) expect(overall).toBe('error');
      else if (ss.every((s) => s.status === 'done')) expect(overall).toBe('done');
      else expect(overall).toBe('running');
    });

    await pipeline.run();
    await pipeline.retry(2);
    expect(pipeline.getState().overall).toBe('done');
  });
});

describe('LP-S32: retry = fresh attempt — no carry-over', () => {
  it('ctx marker from failed attempt is absent on retry', async () => {
    let attemptCount = 0;
    const steps = [
      fakeStep('step0'),
      {
        name: 'step1',
        run: async (ctx: any) => {
          attemptCount++;
          if (attemptCount === 1) {
            // First attempt: write a marker, then fail
            ctx.marker = 'stale-data';
            return { ok: false as const, error: 'e', hint: 'h' };
          }
          // Second attempt: marker should be absent
          expect(ctx.marker).toBeUndefined();
          return { ok: true as const };
        },
      },
    ];
    const pipeline = createPipeline(steps);
    await pipeline.run();
    expect(pipeline.getState().steps[1].status).toBe('error');

    await pipeline.retry(1);
    expect(pipeline.getState().steps[1].status).toBe('done');
    expect(attemptCount).toBe(2);
  });
});

describe('LP-S33: ephemeral state — pipeline state not persisted', () => {
  it('pipeline state has no Zustand persist integration', () => {
    const pipeline = createPipeline([fakeStep('step0')]);
    // Pipeline is a plain object, not a Zustand store
    expect((pipeline as any).persist).toBeUndefined();
    expect((pipeline as any).getInitialState).toBeUndefined();
    // getState returns a plain object snapshot
    const state = pipeline.getState();
    expect(typeof state).toBe('object');
    expect(state.steps).toBeInstanceOf(Array);
  });
});

// ── Layer 2: Step failure injection ──

function makeConfig(overrides?: Partial<NapConfig>): NapConfig {
  return {
    provider: 'gitlab',
    cloneUrl: 'https://gitlab.grammarly.io/org/nap-repo.git',
    napBranch: 'main',
    napkinFocus: null,
    nepicSlug: null,
    mainOwner: 'org',
    mainRepo: 'main-repo',
    mainBranch: 'main',
    prNum: 0,
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<PipelineCtx>): PipelineCtx {
  return {
    config: makeConfig(),
    stateKey: 'test-key',
    session: null,
    lfs: null,
    adapter: null,
    store: null,
    model: null,
    nepicRoot: null,
    ...overrides,
  };
}

function makeMockStore() {
  const state = {
    githubToken: '',
    gitlabToken: '',
    prDiffRanges: null as any,
    setPrDiffRanges: vi.fn((v: any) => { state.prDiffRanges = v; }),
    expandCard: vi.fn(),
  };
  return { getState: () => state } as any;
}

function makeMockAdapter() {
  return {
    mkdir: vi.fn(async () => {}),
    rm: vi.fn(async () => {}),
    mv: vi.fn(async () => {}),
    readdir: vi.fn(async () => []),
    stat: vi.fn(async () => ({ isDirectory: true })),
    exists: vi.fn(async () => false),
  } as any;
}

describe('LP-S20: clone step — 401 (auth failure)', () => {
  it('returns auth error with provider hint', async () => {
    const mockClone: CloneFn = async () => {
      throw Object.assign(new Error('401'), { statusCode: 401 });
    };
    const config = makeConfig({ provider: 'gitlab' });
    const step = makeCloneStep(mockClone, config);

    const ctx = makeCtx({
      config,
      adapter: makeMockAdapter(),
      store: makeMockStore(),
      lfs: {},
    });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication failed');
      expect(result.hint).toContain('GitLab');
      expect(result.hint).toContain('token in settings');
    }
  });
});

describe('LP-S21: clone step — 404 (repo not found)', () => {
  it('returns repo not found error', async () => {
    const mockClone: CloneFn = async () => {
      throw Object.assign(new Error('404'), { statusCode: 404 });
    };
    const config = makeConfig();
    const step = makeCloneStep(mockClone, config);

    const ctx = makeCtx({ config, adapter: makeMockAdapter(), store: makeMockStore(), lfs: {} });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('repository not found');
      expect(result.hint).toContain('review link');
    }
  });
});

describe('LP-S22: clone step — network error', () => {
  it('returns network error with hostname', async () => {
    const mockClone: CloneFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    const config = makeConfig({ provider: 'gitlab' });
    const step = makeCloneStep(mockClone, config);

    const ctx = makeCtx({ config, adapter: makeMockAdapter(), store: makeMockStore(), lfs: {} });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('gitlab.grammarly.io');
      expect(result.hint).toContain('network');
    }
  });
});

describe('LP-S23: clone step — staging cleanup on retry', () => {
  it('cleanup removes staging dir, new run creates fresh', async () => {
    let callCount = 0;
    const mockClone: CloneFn = async () => {
      callCount++;
      if (callCount === 1) throw Object.assign(new Error('401'), { statusCode: 401 });
    };
    const config = makeConfig();
    const adapter = makeMockAdapter();
    const step = makeCloneStep(mockClone, config);

    const ctx = makeCtx({ config, adapter, store: makeMockStore(), lfs: {} });

    // First attempt — fails
    await step.run(ctx);

    // Cleanup should remove staging dir
    await step.cleanup!();
    expect(adapter.rm).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-'),
      expect.objectContaining({ recursive: true }),
    );

    // Second attempt — succeeds
    adapter.rm.mockClear();
    const result = await step.run(ctx);
    expect(result.ok).toBe(true);
    // mkdir called for fresh staging dir
    expect(adapter.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-'),
      expect.objectContaining({ recursive: true }),
    );
  });
});

describe('LP-S24: scan repo — no nepics/ directory', () => {
  it('returns error, not ok:true with null', async () => {
    const findRootFn: FindRootFn = async () => null;
    const config = makeConfig();
    const step = makeScanRepoStep(findRootFn, config);

    const ctx = makeCtx({ config, adapter: makeMockAdapter() });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('.nap structure');
      expect(result.hint).toContain('nap-repo');
    }
  });
});

describe('LP-S26: fetch PR diff — 403 forbidden', () => {
  it('returns error when PR exists but token fails', async () => {
    const mockFetch = vi.fn(async () => { throw Object.assign(new Error('403'), { status: 403 }); });
    const step = makeFetchDiffStep(mockFetch);

    const config = makeConfig({ prNum: 42 });
    const ctx = makeCtx({ config, store: makeMockStore() });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("can't read PR files");
      expect(result.hint).toContain('GitHub token');
    }
  });

  it('skips when prNum is 0', () => {
    const mockFetch = vi.fn(async () => null);
    const step = makeFetchDiffStep(mockFetch);
    const ctx = makeCtx({ config: makeConfig({ prNum: 0 }) });

    expect(step.skip!(ctx)).toBe(true);
  });
});

describe('LP-S27: validate step — malformed config', () => {
  it('returns error for missing cloneUrl', async () => {
    const step = makeValidateStep();
    const ctx = makeCtx({ config: makeConfig({ cloneUrl: '' }) });
    const result = await step.run(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid review link');
    }
  });
});
