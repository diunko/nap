# fixes-02 — spec

## Read the pipeline code first

Before building, read deeply:
- `packages/ext-react/src/pipeline.ts` — runner interface
- `packages/ext-react/src/pipeline-steps.ts` — existing step factories
- `packages/ext-react/src/LoadingGate.tsx` — step rendering, custom renderers
- `packages/ext-react/src/index.tsx` — session lifecycle, Panel key prop
- `packages/ext-react/src/playground.ts` — YAML parsing, yamlToSteps

## Gate step interface

```typescript
function makeGateStep(autoStart: boolean): StepDef {
  let startResolve: (() => void) | null = null;

  return {
    name: 'ready',
    run: async () => {
      if (autoStart) return { ok: true };
      return new Promise<StepResult>(resolve => {
        startResolve = () => resolve({ ok: true });
      });
    },
    // expose for LoadingGate to call
    triggerStart: () => startResolve?.(),
  };
}
```

The LoadingGate detects step 0 name === 'ready' + status === 'running' → renders [start] button. Button calls `step.triggerStart()`.

## Reset flow

1. User clicks "reset session" (settings or header)
2. Wipe: `indexedDB.deleteDatabase('nap-fs-' + sessionKey)` + `indexedDB.deleteDatabase('nap-state')` key removal
3. Increment `resetCount` state in App
4. Panel has `key={session.key + '-' + resetCount}` → React unmounts old, mounts new
5. New session created with `makeGateStep(false)` as step 0
6. Pipeline starts, gate step is "running" but waiting → loading gate shows [start]
7. User clicks [start] → gate resolves → pipeline continues

Normal boot: `resetCount` is 0, `makeGateStep(true)` — gate auto-resolves.

## __wipeCurrentSession__

```typescript
window.__wipeCurrentSession__ = async () => {
  // same as reset button handler
  await wipeSessionData(sessionKey);
  setResetCount(c => c + 1);
};
```

## Playground auto_start

YAML format:
```yaml
steps:
  - name: ready
    auto_start: false    # shows [start] button
  - name: clone repo
    delay: 3000
    ...
```

`yamlToSteps` checks `step.auto_start` — if present and false, wraps the step in the gate pattern (wait for trigger). The playground's [run] button creates the pipeline and calls `run()`. The gate step then waits for [start] in the loading gate.

## What "done" looks like

* Normal boot: gate step invisible, pipeline auto-runs as before
* Reset session: wipe → loading gate shows [start] → click → fresh clone
* Console: `__wipeCurrentSession__()` → same as reset button
* Tokens survive reset (global)
* Playground: gate step testable via `auto_start: false`
* No regressions on existing tests
