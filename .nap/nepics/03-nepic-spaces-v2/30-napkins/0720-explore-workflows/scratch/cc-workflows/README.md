# Coding Claude Code Workflows

A short, opinionated book about the `Workflow` tool — the thing that lets one agent orchestrate many. It teaches the mental model first, then each primitive, then the patterns that make multi-agent output *trustworthy*, and closes by dissecting a real workflow line by line.

Read it front to back. Each chapter assumes the ones before it. The whole thing is built around a single idea introduced in Chapter 2 and never abandoned: **a workflow is deterministic control flow wrapped around model judgment** — and almost every design decision, and every bug, comes down to which side of that line a piece of work landed on.

## Who this is for

Anyone who has felt one of the *three walls* — an agent's attention thinning across a huge task (context), independent work forced into a line (latency), or an agent confidently grading its own homework (confidence) — and wants the tool that knocks each one down.

## Chapters

1. **[Why Workflows Exist](./01-why-workflows.md)** — The three walls (context, latency, confidence), what a workflow actually is, and the hard rule that they run only on explicit opt-in.
2. **[The Mental Model](./02-mental-model.md)** — Deterministic shell around model judgment. What belongs in JavaScript, what belongs in `agent()`, and why putting work on the wrong side is the root of most bad workflows.
3. **[Anatomy of a Workflow](./03-anatomy.md)** — Build one from an empty file: the `meta` literal, the body, the `phase`/`agent`/JS/`return` rhythm, and the thunk trap in `parallel`.
4. **[`agent()`: The Atom](./04-the-agent-atom.md)** — Return semantics (string vs validated object vs `null`), every option (`label`, `phase`, `model`, `agentType`, `isolation`), and the two caps.
5. **[`pipeline` vs `parallel`](./05-pipeline-vs-parallel.md)** — The central decision. Why pipeline is the default, what a barrier costs, the one case a barrier is correct, and the smell test for spotting a wasted one.
6. **[Structured Output: Schemas as Contracts](./06-schemas.md)** — How schemas turn prose into typed data validated at the tool-call layer, why they're the seam between stages, and how to design good ones.
7. **[Quality Patterns](./07-quality-patterns.md)** — Adversarial verify, perspective-diverse verify, judge panels, loop-until-dry, multi-modal sweep, completeness critic — and how to compose them. Never cap silently.
8. **[Budgets, Concurrency, and Loops](./08-budgets-loops.md)** — The `budget` object, loop-until-budget (and the `budget.total` guard), static scaling, the two caps in practice, and why termination is your job.
9. **[Resume, Caching, and Iteration](./09-resume-iteration.md)** — The journal and `runId`, what determinism buys you (crash recovery + cheap iteration), and the edit-the-file-and-resume development loop.
10. **[Composition: Sub-workflows and Parameterization](./10-composition.md)** — `args` for one-script-many-jobs, `workflow()` for nesting, what a child shares with its parent, the one-level nesting limit, and when to compose vs inline.
11. **[A Worked Example: The Book-Writing Workflow](./11-worked-example.md)** — A real workflow dissected top to bottom, with every concept from the previous ten chapters pointed at in context.

## The one-paragraph version

If you read nothing else: find the parts of your task that need *judgment* and make each an `agent()`; find the parts that are *bookkeeping* (loops, conditionals, filtering, dedup) and make them plain JavaScript. Arrange the agents in time with `pipeline()` by default — reach for the `parallel()` barrier only when a stage genuinely needs all of the previous stage's results at once. Use `schema` wherever JavaScript will branch on an agent's output, so you receive typed data instead of parsing prose. Don't let the agent that *produced* an answer be the only one that *judges* it — spawn independent, adversarial verifiers. Bound your loops on a real termination condition, not on the runtime's crash rails. And lean on determinism: small, well-labeled stages crash, fix, and resume far better than one giant opaque step.
