# Chapter 8 — Budgets, Concurrency, and Loops

The quality patterns in Chapter 7 have a dangerous property: several of them *loop*. Loop-until-dry, completeness critics, accumulate-to-target — they keep spawning agents until some condition holds. A condition that never holds spends tokens forever. This chapter is about powering those loops sanely: how to bound them by budget, how the concurrency cap actually behaves, and how to scale depth to what the user asked for.

## The budget object

The runtime exposes a `budget` object that reflects the token target the user set for the turn — the "+500k"-style directive:

```js
budget.total        // the turn's token target — or null if the user set none
budget.spent()      // output tokens spent THIS TURN across the main loop AND all workflows
budget.remaining()  // max(0, total - spent()), or Infinity if total is null
```

Three things about it are worth internalizing.

**The pool is shared.** `budget.spent()` counts tokens across the main conversation *and* every workflow running in it — not per-workflow. You're spending from one common pool, so a workflow can't reason about its budget in isolation.

**The target is a hard ceiling, not a suggestion.** Once `spent()` reaches `total`, further `agent()` calls *throw*. The budget doesn't politely slow down; it stops you. So a loop that ignores the budget will eventually crash rather than gracefully finish — which is why budget-aware loops guard explicitly.

**No target means infinity.** If the user set no budget, `budget.total` is `null` and `remaining()` is `Infinity`. This is the foot-gun: a `while (budget.remaining() > X)` loop with no target set will run straight to the 1000-agent lifetime cap. *Always guard on `budget.total` first.*

## Loop-until-budget

Here's the pattern done correctly — scale depth to the user's directive, and guard against the no-budget case:

```js
const bugs = []
// Guard on budget.total FIRST. Without a target, remaining() is Infinity and
// this loop would run to the agent cap. The 50k reserve leaves room to finish.
while (budget.total && budget.remaining() > 50_000) {
  const round = await agent('Find a bug we have not surfaced yet.', {schema: BUGS_SCHEMA})
  bugs.push(...round.bugs)
  log(`${bugs.length} found, ~${Math.round(budget.remaining() / 1000)}k tokens left`)
}
```

The `budget.total &&` is not optional politeness — it's the difference between "scale to the budget" and "run until the runaway backstop trips."

## Static scaling from budget

You don't have to loop to use the budget. You can size a one-shot fan-out to it:

```js
// More budget → more finders. No budget → a sensible default of 5.
const FLEET_SIZE = budget.total ? Math.floor(budget.total / 100_000) : 5
const findings = await parallel(
  Array.from({length: FLEET_SIZE}, (_, i) => () =>
    agent(`Find bugs — you are finder #${i + 1}, focus on a different area than the others.`, {schema: BUGS_SCHEMA})),
)
```

Note the `#${i + 1}` in the prompt: since `Math.random()` is banned, you create variety across otherwise-identical agents by *varying their prompt by index*. Finder #1 and finder #7 get different instructions, so they explore different areas instead of duplicating each other.

## Loop-until-count

Sometimes the target isn't budget but a quantity — "give me ten solid bugs":

```js
const bugs = []
while (bugs.length < 10) {
  const round = await agent('Find bugs in this codebase.', {schema: BUGS_SCHEMA})
  bugs.push(...round.bugs)
  log(`${bugs.length}/10`)
}
```

Simple, but notice it has no escape hatch if there *aren't* ten bugs — it'll loop forever (well, until the 1000-agent cap). In practice you'd combine it with a dry-round counter (Chapter 7) so "we've stopped finding new ones" can end the loop even short of the target. Pure count-loops are fine only when you're confident the target is reachable.

## The two caps, and how loops interact with them

From Chapter 4, restated because loops make them matter:

**Concurrency cap — `min(16, cores - 2)` in flight at once.** This is about *simultaneity*, not *total*. You can hand `parallel()` or `pipeline()` up to 4096 items and they'll *all* complete — but only ~10–16 run at any instant; the rest queue. The practical consequences:

- A fan-out of 100 isn't 100× faster than serial — it's ~12× faster, because that's how many run at once.
- You never need to manually batch to "respect the limit." Pass the whole array; the runtime schedules it.
- A single `parallel()`/`pipeline()` call accepts at most 4096 items — more is a hard error, not a silent truncation. If you have more than that, you have a chunking problem to solve in the script.

**Lifetime cap — 1000 `agent()` calls total, ever, per run.** This is a *backstop against runaway loops*, deliberately far above any real workflow. If you're bumping it, the diagnosis is almost never "my job is genuinely this big" — it's "my termination condition is broken." Treat hitting it as a bug report from the runtime.

## Termination is your job

The runtime gives you two safety nets — the budget ceiling and the agent cap — but both are *crash rails*, not graceful exits. A well-built loop terminates *itself*, well before either rail, on a condition that means "we're done": K dry rounds, count reached, budget reserve hit. The rails exist so a buggy loop fails loudly instead of silently spending forever; they are not the intended way to stop.

So every loop you write should answer one question explicitly: **what makes this stop?** If the answer is "it runs out of budget" or "it hits 1000 agents," rewrite it until the answer is a real, meaningful condition. Loops that lean on the rails are loops with a bug you haven't hit yet.

Next: what happens when a long workflow dies halfway — resume, caching, and the iteration loop that makes workflows pleasant to develop.
