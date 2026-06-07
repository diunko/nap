# Chapter 10 — Composition: Sub-workflows and Parameterization

So far each workflow has been a closed unit: write it, run it, get a result. But the best abstractions compose, and workflows are no exception. This chapter covers the two mechanisms that turn one-off scripts into reusable building blocks: `args` for parameterization, and `workflow()` for nesting one workflow inside another.

## `args`: one script, many jobs

A workflow that hard-codes its inputs runs one job. A workflow that reads `args` runs *any* job of that shape. The runtime exposes whatever the launcher passed as a global:

```js
// args is the value passed to Workflow's `args` input, verbatim — undefined if none.
const question = args?.question || 'default research question'
const targets = Array.isArray(args) ? args : DEFAULT_TARGETS
```

This is exactly how the book-writing workflow in the next chapter lets you override its table of contents without editing the script: it falls back to a built-in chapter list, but if you pass an array of chapter specs as `args`, it uses those instead. One script, default behavior built in, fully overridable per run.

**One sharp edge, and it bites people:** pass arrays and objects as *actual JSON values*, not as a JSON-encoded string.

```js
// RIGHT — args reaches the script as a real array
Workflow({scriptPath: '...', args: ['fileA.ts', 'fileB.ts']})
// inside the script: args.map(...) works

// WRONG — args reaches the script as the STRING "[\"fileA.ts\",\"fileB.ts\"]"
Workflow({scriptPath: '...', args: '["fileA.ts","fileB.ts"]'})
// inside the script: args.map(...) throws — strings don't have .map
```

The runtime hands `args` through verbatim. If you stringify it, the script receives a string, and `args.filter`/`args.map` blow up. Pass the structure as a structure.

## `workflow()`: running a workflow as a step

The bigger lever is calling one workflow from inside another. `workflow(nameOrRef, args)` runs another whole workflow inline and returns whatever it returns:

```js
// Run a saved workflow by name, with args, as one step of this larger workflow.
const reviewResult = await workflow('review-changes', {paths: changedFiles})

// Or run a script file you wrote earlier in the session.
const research = await workflow({scriptPath: 'coda-book/_research-pass.workflow.js'}, {topic})
```

Two forms: a **name** resolves a saved/built-in workflow from the same registry as `Workflow({name})`; a `{scriptPath}` runs a script file directly. Either way you get its return value, so a sub-workflow is just a function call that happens to orchestrate its own fleet of agents.

### What the child shares with the parent

This is the part to understand precisely. A sub-workflow is *not* an isolated universe — it shares the parent's run context:

- **The concurrency cap** — parent and child draw from the same `min(16, cores-2)` in-flight pool. A child fanning out 50 agents doesn't get its *own* 16 slots; it competes for the shared ones.
- **The agent counter** — the child's `agent()` calls count toward the parent's 1000-agent lifetime cap.
- **The token budget** — the child's tokens count toward `budget.spent()`. There's one pool, and the child spends from it.
- **The abort signal** — kill the parent, the child dies too.

In the progress UI, the child's agents appear under a `▸ name` group, so you can see the nesting. But under the hood it's one run with one set of limits, just structured into named sub-units.

### The one hard limit: nesting is one level deep

```js
// Parent workflow
const result = await workflow('child-workflow', args)   // ✓ allowed

// Inside child-workflow:
const grandchild = await workflow('another', args)      // ✗ THROWS — no nesting inside a child
```

You can call workflows from a top-level workflow, but a sub-workflow cannot itself call `workflow()`. One level. This keeps the run tree shallow and the limits easy to reason about. If you find yourself wanting grandchildren, flatten: have the parent call both the child and the would-be-grandchild as sequential steps.

### Failure modes

`workflow()` throws on an unknown name, an unreadable `scriptPath`, or a child with a syntax error. So if a sub-workflow is optional or might not exist, wrap it:

```js
let extra = null
try {
  extra = await workflow('optional-enrichment', {data})
} catch {
  log('enrichment workflow unavailable — proceeding without it')
}
```

## When to compose vs inline

Composition is powerful, which makes it tempting to over-apply. The honest guidance:

**Reach for `workflow()` when** there's a genuinely reusable, *named* unit of orchestration — a review pass, a research pass, a verification gauntlet — that several different parent workflows (or you, interactively) will invoke. The sub-workflow earns its existence by being called from more than one place.

**Stay inline when** the "sub-workflow" would only ever be called once, from one parent. Then it's not a reusable unit, it's just a section of the parent, and pulling it into a separate script adds indirection without payoff. A `pipeline()` or a helper that builds prompts is the right tool, not a nested workflow.

**Parameterize with `args` when** the *same* orchestration runs over different inputs — different file sets, different questions, different configs. That's the cheap, common form of reuse and you should default to it: write the workflow to read `args`, give it a sensible built-in default, and you've got a reusable tool for free.

## The mental model

Think of it this way. `agent()` is a function that returns intelligence. A `pipeline()`/`parallel()` block is a function that returns the result of *coordinated* intelligence. And a `workflow()` is just *naming* one of those blocks so it can be called from elsewhere with different `args`. It's the same composition you'd reach for in any codebase — small reusable units, parameterized, called from larger ones — applied to orchestration instead of plain functions. The limits (shared pool, one-level nesting) are the only things that make it different from ordinary function calls, and they exist to keep one run's resource accounting honest.

Next, the capstone: a real workflow — the one that wrote a book about *this codebase* — dissected line by line, every concept from the last nine chapters in one place.
