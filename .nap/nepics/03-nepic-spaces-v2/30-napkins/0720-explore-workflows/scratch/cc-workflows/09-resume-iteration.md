# Chapter 9 — Resume, Caching, and Iteration

A workflow that spawns fifty agents takes real time and real tokens. So two questions matter enormously in practice: *what happens when it dies at agent #38?* and *how do I iterate on the script without re-running the expensive parts every time?* Both have the same answer — the journal — and understanding it changes how you develop workflows.

## The journal and the runId

Every workflow run records each `agent()` call and its result to a journal, keyed by a `runId` the launch returns:

```
Run ID: wf_fe167de8-ab6
```

That ID is your handle on the run. With it, you can resume:

```js
// Re-launch the SAME script, resuming from the prior run.
Workflow({scriptPath: 'coda-book/write-book.workflow.js', resumeFromRunId: 'wf_fe167de8-ab6'})
```

On resume, the runtime replays your script from the top. For each `agent()` call, it checks the journal: **if the call's `(prompt, opts)` is unchanged from the prior run, it returns the cached result instantly** — no agent spawned, no tokens spent. The first call that *differs* (edited prompt, new call, changed options) runs live, and everything after it runs live too.

This is why Chapter 2 insisted on determinism. Replay only works if the script produces the *same sequence of calls* given the same inputs. That's the whole reason `Date.now()`, `Math.random()`, and `new Date()` are banned inside scripts — they'd make the replayed run diverge from the journal, and the cache would mismatch on every call. If you need a timestamp or a random seed, pass it in via `args` (Chapter 10) so it's stable across replays.

## Two things resume buys you

**Crash recovery.** A workflow dies at agent #38 of 50 — network blip, terminal error, you killed it. Resume, and agents #1–37 return from cache in seconds; #38 onward run live. You lose the failed call, not the whole run. For a workflow representing dollars of tokens, this is the difference between "annoying" and "catastrophic."

**Cheap iteration.** This is the one you'll use daily. You run a workflow, the last stage's prompt is slightly off, you want to fix *only that stage*. You don't rewrite and re-run from scratch:

```
1. The launch returned a scriptPath — the runtime persisted your script to a file.
2. Edit that file: fix only the final stage's prompt.
3. Re-launch with {scriptPath, resumeFromRunId}.
   → Every stage before your edit returns from cache, instantly.
   → Only the edited stage (and anything after it) runs live.
```

Same script + same args → 100% cache hit (nothing re-runs — useful to confirm a run is reproducible). Edit one stage → that stage and its dependents re-run, the rest is free. You iterate on the *tail* of a long workflow without paying for the *head* again.

## The iteration loop in practice

This reshapes how you *develop* a workflow. Don't write all 200 lines and run once hoping it's right. Instead:

1. Write the workflow. Launch it. It persists to a `scriptPath` and starts running.
2. Watch it. When a stage produces something wrong, let it finish (or stop it).
3. Edit the script file at that stage.
4. Re-launch with `resumeFromRunId` — the good prefix is cached, your fix runs live.
5. Repeat from step 2 until the tail is right.

You're effectively debugging a long computation by re-running only the part you changed, with everything upstream frozen. It feels like a REPL for multi-agent pipelines.

A practical note on editing: re-invoke with `{scriptPath}` (the path the launch gave you), not by pasting the whole script back into the tool call. The script lives in a file now; edit the file, point at the file. Resending the full text each time is both noisy and easy to get out of sync with the file the runtime is journaling against.

## Stop before you resume

One operational rule: if a run is still going, **stop it before resuming from it.** You don't want the old run and the resumed run both alive, both journaling, racing on the same outputs. Kill the prior run first, then re-launch with `resumeFromRunId`. Resume is same-session only — the journal lives with the session.

## When there's no journal

If you ever need to recover a run and the journal isn't available to the resume mechanism, the raw material is still on disk: the runtime writes per-agent transcript files (`agent-<id>.jsonl`) under the run's transcript directory. In a pinch you can read those to see what each agent returned and hand-author a continuation script that hard-codes the recovered results and proceeds from there. It's the manual version of resume — rarely needed, good to know exists.

## Watching a run

While a workflow runs in the background, the live progress view (the `phase` groups and `label`s you set in earlier chapters paying off) shows you where it is — which agents are in flight, which are done, which phase each belongs to. This is where the discipline of *good labels and explicit phases* stops being cosmetic: in a fifty-agent run, a clean progress tree is the difference between "I can see stage 3 is stuck on file 12" and "something is happening, somewhere."

## The takeaway

Determinism isn't a constraint the runtime imposes to annoy you — it's the thing that makes workflows *recoverable* and *iterable*. Every rule that flows from it (no `Date.now`, pass seeds via `args`, edit-the-file-and-resume) is in service of one payoff: a long, expensive computation you can crash, fix, and continue without starting over. Design your workflows to lean on it — small, well-labeled stages resume better than one giant opaque step.

Next: composing whole workflows together, and parameterizing them so one script serves many jobs.
