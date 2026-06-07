# Chapter 1 — Why Workflows Exist

You have a capable agent. It can read files, run commands, search the web, edit code. For most tasks, you just ask it and it does the thing. So why would you ever want a *workflow* — a script that spawns other agents?

Start with the failure you've already felt.

## The three walls

You ask one agent to "review this 4,000-line diff for bugs." It starts strong. By the time it reaches file 30, the early files have scrolled out of its working memory, the analysis gets shallower, and it quietly starts pattern-matching instead of reading. You get a review that *looks* complete and isn't. That's the **context wall**: one agent has one context window, and attention thins as it fills.

You ask one agent to "research these eight libraries and compare them." It researches them one at a time, because it's one agent doing one thing at a time. Eight sequential deep-dives. You wait. That's the **latency wall**: independent work that *could* happen at once is forced into a line.

You ask one agent "is this security finding real?" and it says yes — confidently, plausibly, wrongly. It generated the finding and then evaluated its own finding, and a model grading its own homework tends to pass. That's the **confidence wall**: a single perspective can't catch its own blind spots.

A workflow is the tool for exactly these three walls, and you should reach for it when you feel one of them — not before.

## What a workflow actually is

A workflow is a **JavaScript script that orchestrates multiple subagents deterministically.** Two words in that sentence are load-bearing.

*Multiple subagents*: each `agent()` call spawns a fresh agent with its own clean context window. Ten agents reviewing ten files have ten times the effective attention of one agent reviewing ten files. The context wall falls because you stopped trying to hold everything in one head.

*Deterministically*: the control flow — the loops, the conditionals, the fan-out, the "do these five things at once and wait for all of them" — lives in plain code that runs exactly as written, every time. It does not depend on a model deciding to remember to do step 4. The orchestration is mechanical; only the work inside each agent is model-driven.

That second word is the whole philosophy, and it gets its own chapter. For now hold this: **the script is the part that must be reliable, so it isn't a model. The agents are the part that needs judgment, so they are.**

## The shape of relief

Here is the same review, as a workflow, in spirit:

```js
// Spawn one agent PER dimension, all at once. Each has a clean context window
// and one job — so none of them hits the context wall, and they run concurrently
// instead of in a line.
const findings = await parallel(
  ['correctness', 'security', 'performance', 'style'].map(
    (dimension) => () => agent(`Review the diff for ${dimension} issues.`),
  ),
)
```

Four agents, four perspectives, in the time of one. The context wall and the latency wall fall together, because they have the same cure: stop doing everything in one place.

The confidence wall needs a different move — not more parallelism, but *adversarial independence*:

```js
// For each finding, spawn skeptics whose ONLY job is to refute it. A claim that
// survives three independent attempts to kill it is one you can actually trust.
const survives = (await parallel(
  [1, 2, 3].map(() => () => agent(`Try to REFUTE this finding: ${finding}. Default to "refuted" if unsure.`)),
)).filter((verdict) => !verdict.refuted).length >= 2
```

The agent that *found* the bug never gets to vote on whether it's real. Different agents, prompted to disagree, do the judging. That's how you stop a model from grading its own homework.

## When NOT to write a workflow

A workflow spawns agents — sometimes dozens. That costs tokens and wall-clock setup. So the honest rule is the inverse of the three walls:

- **One fact you already know where to find?** Just read it. No workflow, not even a subagent.
- **A task that fits comfortably in one agent's context and doesn't need a second opinion?** Just ask the agent. A workflow would be ceremony.
- **Work that's genuinely big, genuinely parallel, or genuinely needs verification?** Now it earns its cost.

There's also a hard gate worth stating plainly: **workflows run only when the user has explicitly opted in.** A task that would *benefit* from orchestration is not the same as a user *asking* for it. The scale is the user's to authorize, because the bill is theirs to pay. When in doubt, describe what a workflow could do and roughly what it'd cost, and let them say go.

## What the rest of this book does

Everything from here builds on one idea: a workflow is a deterministic shell wrapped around model judgment. The next chapter makes that idea precise — what belongs in the shell, what belongs in the agents, and why putting things on the wrong side is the root of most bad workflows. After that we build one from nothing, then go deep on each tool the runtime gives you: `agent()`, `pipeline()`, `parallel()`, schemas, budgets, resume, and composition. We close by dissecting a real workflow line by line.

By the end you should be able to look at a task, feel which wall it's about to hit, and write the small amount of code that knocks the wall down.