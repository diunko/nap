# playground — spec

## Reuses existing infrastructure

* pipeline runner from 0660 — `createPipeline(steps, ctx)`, same interface
* LoadingGate component from 0660 — reused for rendering step states
* Monaco editor — playground.yaml opened as a regular file
* LFS adapter — file read/write, change events

## YAML → fake steps

Parse playground.yaml into step definitions. Each YAML step becomes a `StepDef`:

```typescript
function yamlToSteps(config: PlaygroundConfig): StepDef[] {
  return config.steps.map(step => ({
    name: step.name,
    run: async () => {
      await sleep(step.delay ?? 0);
      // check conditions (live, not from YAML — read from condition state)
      for (const [key, value] of Object.entries(conditionState[step.name] ?? {})) {
        if (!value && step.on_fail?.[key]) {
          return { ok: false, ...step.on_fail[key] };
        }
      }
      return { ok: true };
    },
    cleanup: async () => {},  // playground steps have no real side effects
  }));
}
```

The `conditionState` is separate from the YAML — it's the live checkbox values. YAML provides initial values. Checkboxes override.

## Condition state lifecycle

* YAML parsed → initial condition values extracted per step
* User toggles checkbox → condition state updated (in memory, not written to YAML)
* "run" clicks → steps read from live condition state at execution time
* "retry" → step re-reads live condition state (may have changed since failure)
* new "run" after YAML change → re-parse YAML → reset condition state to new initial values

## Playground tab surface

Third surface: `activeSurface: 'editor' | 'terminal' | 'playground'`

Store gets:
* `activeSurface` extended to include `'playground'`
* no other playground state in the store — it's all local to the PlaygroundPane component

## PlaygroundPane component

* on mount / on LFS change for playground.yaml: read + parse
* renders: LoadingGate (reused) + condition checkboxes per step + [run] button
* condition checkboxes: inline next to each step, before the status indicator
* [run] creates a new pipeline from `yamlToSteps`, runs it
* LoadingGate subscribes to the pipeline and renders live

## File seeding

In pipeline step 3 (init-fs in pipeline-steps.ts):
```typescript
const playgroundExists = await adapter.exists('/home/user/playground.yaml');
if (!playgroundExists) {
  await adapter.writeFile('/home/user/playground.yaml', DEFAULT_PLAYGROUND_YAML);
}
```

Default YAML mirrors the real boot pipeline with some conditions set to false.

## js-yaml dependency

Add `js-yaml` to package.json. ~30KB. Well-maintained. Used only by PlaygroundPane — not in the critical boot path.

## What "done" looks like

* Playground tab visible in tab bar
* Default playground.yaml seeded on first boot
* Open playground.yaml in editor → edit → switch to Playground → see updated steps
* Click run → steps progress with delays → some fail based on conditions
* Toggle checkbox → retry → step passes
* Invalid YAML → parse error shown, no crash
