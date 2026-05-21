# loading pipeline — spec

## Read before building

- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/bugfixes/01-clone-pipeline-failures.nap.md` — every step, who owns it, what fails
- `.nap/nepics/05-extension/30-napkins/0660-loading-pipeline/principles.nap.md` — design + testing principles

## Pipeline runner interface

```typescript
interface StepDef {
  name: string;           // "cloning gitlab.grammarly.io/..."
  run: (ctx: PipelineCtx) => Promise<StepResult>;
  cleanup?: () => Promise<void>;  // for retry-all
}

type StepResult =
  | { ok: true }
  | { ok: false; error: string; hint: string };

interface PipelineState {
  steps: Array<{ name: string; status: 'pending' | 'running' | 'done' | 'error'; error?: string; hint?: string }>;
  currentStep: number;
  overall: 'running' | 'done' | 'error';
}
```

## Pipeline state is ephemeral

Not in Zustand. Not persisted. A plain object or ref. Panel close = gone. Reopen = fresh pipeline from step 0.

The loading gate UI subscribes via a callback (not React state — the pipeline runs before React is fully interactive).

## Staging pattern for clone

Clone step uses `.tmp-{repo-name}` directory:
1. `git clone url .tmp-{name}` into staging dir
2. On success: `mv .tmp-{name} {name}` — atomic rename
3. On failure: `.tmp-{name}` left behind, invisible to scanner (dotfile prefix)
4. On retry: new `.tmp-{name}` (cleanup removes the old one first)
5. On next boot: scanner skips dotfiles, fresh pipeline creates fresh staging

## Step skip logic

- "check existing repos" finds a repo → mark "clone" as skipped (status: done, no run)
- "fetch PR diff" only runs if prNum > 0
- Skipped steps show checkmark in UI, not spinner

## Error hints per step

| Step | Error pattern | Hint |
|---|---|---|
| clone | 401 | "authentication failed — enter your {provider} token in settings" |
| clone | 404 | "repository not found — check the review link" |
| clone | network error | "can't reach {hostname} — check your network or VPN" |
| scan repo | no nepics/ | "cloned {repo} but no .nap structure found" |
| fetch PR diff | 403/404 | "can't read PR files — check your GitHub token" |
| start terminal | wasm error | "terminal failed to start — try reloading" |

The step owns the error classification. The pipeline just displays what the step returns.

## Loading gate UI

A centered panel showing a vertical list of steps:
- ✓ step name (done — green checkmark)
- ⟳ step name... (running — spinner)
- ✗ step name (error — red, error message below, hint below that, [retry] button)
- ○ step name (pending — gray)

Replaces the current boot-gate component. After all steps succeed, the loading gate unmounts and the normal Panel renders.

## Retry behavior

- [retry] button on the failed step: `pipeline.retry(stepIndex)` — runs that step again, then continues forward
- [retry all] link at the bottom: cleanup all completed steps (reverse order), restart from step 0
- Retry = fresh attempt. New staging dir. No carry-over.

## What "done" looks like

- Fresh visit: user sees step list progressing, "cloning..." step with repo name, checkmarks appearing, then panel loads
- Auth failure: step list shows clone failed with "enter token" hint and retry button. User enters token, clicks retry, clone succeeds, pipeline continues.
- Return visit: steps fly through (scan finds repo, clone skipped), panel loads in under 1 second
- Mid-flight close + reopen: fresh pipeline, staging cleaned up, no partial state visible
