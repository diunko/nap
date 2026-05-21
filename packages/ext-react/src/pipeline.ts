/**
 * Pipeline runner — sequential step execution with retry.
 *
 * Pure logic. No React, no browser APIs, no infrastructure.
 * Steps are an array parameter (FI-01). State is a plain observable (FI-03).
 * Cleanup functions per step, called in reverse order on retryAll (FI-05).
 */

export type StepResult =
  | { ok: true }
  | { ok: false; error: string; hint: string };

export interface StepDef {
  name: string;
  run: (ctx: any) => Promise<StepResult>;
  cleanup?: () => Promise<void>;
  skip?: (ctx: any) => boolean;
}

export interface StepState {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
  hint?: string;
}

export interface PipelineState {
  steps: StepState[];
  currentStep: number;
  overall: 'running' | 'done' | 'error';
}

export interface Pipeline {
  getState(): PipelineState;
  getCtx(): Record<string, any>;
  subscribe(fn: (state: PipelineState) => void): () => void;
  run(): Promise<void>;
  retry(stepIndex: number): Promise<void>;
  retryAll(): Promise<void>;
  destroy(): void;
}

export function createPipeline(
  steps: StepDef[],
  initialCtx?: Record<string, any>,
): Pipeline {
  const ctx: Record<string, any> = { ...(initialCtx ?? {}) };
  const initialSnapshot = { ...(initialCtx ?? {}) };
  const ctxSnapshots: Array<Record<string, any>> = [];
  const subscribers: Array<(state: PipelineState) => void> = [];
  let destroyed = false;
  let running = false;

  // Mutable internal state
  const stepStates: StepState[] = steps.map((s) => ({
    name: s.name,
    status: 'pending' as const,
  }));
  let currentStep = -1;
  let overall: PipelineState['overall'] = 'running';

  function snapshot(): PipelineState {
    return {
      steps: stepStates.map((s) => ({ ...s })),
      currentStep,
      overall,
    };
  }

  function notify(): void {
    const s = snapshot();
    for (const fn of subscribers) fn(s);
  }

  function computeOverall(): void {
    if (stepStates.some((s) => s.status === 'error')) {
      overall = 'error';
    } else if (stepStates.every((s) => s.status === 'done')) {
      overall = 'done';
    } else {
      overall = 'running';
    }
  }

  function setStep(
    i: number,
    status: StepState['status'],
    error?: string,
    hint?: string,
  ): void {
    stepStates[i] = {
      name: stepStates[i].name,
      status,
      ...(error !== undefined ? { error } : {}),
      ...(hint !== undefined ? { hint } : {}),
    };
  }

  function resetCtx(to: Record<string, any>): void {
    for (const k of Object.keys(ctx)) delete ctx[k];
    Object.assign(ctx, to);
  }

  async function exec(from: number): Promise<void> {
    for (let i = from; i < steps.length; i++) {
      if (destroyed) return;

      currentStep = i;

      // Skip check (FI-04: step can inspect ctx to decide)
      if (steps[i].skip?.(ctx)) {
        setStep(i, 'done');
        computeOverall();
        notify();
        continue;
      }

      // Snapshot ctx before running step (for retry restore)
      ctxSnapshots[i] = { ...ctx };

      setStep(i, 'running');
      computeOverall();
      notify();

      const result = await steps[i].run(ctx);

      if (destroyed) return;

      if (result.ok) {
        setStep(i, 'done');
      } else {
        setStep(i, 'error', result.error, result.hint);
      }
      computeOverall();
      notify();

      if (!result.ok) return; // Stop on failure
    }
  }

  const pipeline: Pipeline = {
    getState: snapshot,

    getCtx: () => ctx,

    subscribe(fn) {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    },

    async run() {
      if (running) return;
      running = true;
      await exec(0);
      running = false;
    },

    async retry(stepIndex) {
      if (running) return;
      running = true;

      // Cleanup the retried step's artifacts
      if (steps[stepIndex].cleanup) {
        await steps[stepIndex].cleanup!();
      }

      // Restore ctx to pre-step snapshot (LP-S32: no carry-over)
      if (ctxSnapshots[stepIndex]) {
        resetCtx({ ...ctxSnapshots[stepIndex] });
      }

      // Reset this step and all after it
      for (let j = stepIndex; j < steps.length; j++) {
        setStep(j, 'pending');
      }
      computeOverall();
      notify();

      await exec(stepIndex);
      running = false;
    },

    async retryAll() {
      if (running) return;
      running = true;

      // Cleanup completed steps in reverse order (FI-05)
      // Only 'done' steps — failed step's cleanup is NOT called
      for (let i = steps.length - 1; i >= 0; i--) {
        if (stepStates[i].status === 'done' && steps[i].cleanup) {
          await steps[i].cleanup!();
        }
      }

      // Reset ctx to initial state
      resetCtx({ ...initialSnapshot });
      ctxSnapshots.length = 0;

      // Reset all steps
      for (let j = 0; j < steps.length; j++) {
        setStep(j, 'pending');
      }
      overall = 'running';
      notify();

      await exec(0);
      running = false;
    },

    destroy() {
      destroyed = true;
      subscribers.length = 0;
    },
  };

  return pipeline;
}
