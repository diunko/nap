# Chapter 4 — `agent()`: The Atom

Everything in a workflow is `agent()` calls arranged in time. So it's worth knowing the atom cold — not just the happy path, but its return semantics, its failure mode, and every dial on `opts`.

## The signature

```js
agent(prompt: string, opts?: {
  label?: string,        // display name in the progress tree
  phase?: string,        // which progress group this belongs to
  schema?: object,       // JSON Schema — forces structured output (Chapter 6)
  model?: string,        // model override — usually DON'T set this
  isolation?: 'worktree',// give the agent its own git worktree
  agentType?: string,    // use a custom subagent type instead of the default
}): Promise<string | object | null>
```

One required argument, the prompt. Everything else tunes behavior. Let's take the return type first, because it's the part people get wrong.

## What it returns

**Without a schema, you get the agent's final text as a string.**

```js
const answer = await agent('What database does the auth module use?')
// answer === "PostgreSQL, via the auth_storage layer."  (a string)
```

**With a schema, you get a validated object** — the runtime forces the agent to emit data matching your schema, validates it at the tool-call layer, and makes the agent retry if it doesn't match. By the time `agent()` resolves, the object is guaranteed to fit:

```js
const finding = await agent('Find the highest-severity bug.', {schema: BUG_SCHEMA})
// finding === {title: "...", file: "...", severity: "high"}  (a validated object — no parsing)
```

This is the difference between *parsing prose* and *receiving data*. With a schema you never write `JSON.parse` or a regex over the agent's reply; the structure is enforced upstream. We'll spend a whole chapter on schemas because they're the backbone of multi-stage workflows — the clean seam between one agent's output and the next agent's input.

**On failure, you get `null`.** If the agent hits a terminal API error after the runtime's retries, or the user skips it mid-run, the call resolves to `null` instead of throwing. This is deliberate: one dead agent in a fan-out of fifty shouldn't crash the whole workflow. But it means **you must plan for null**:

```js
const findings = await parallel(files.map((f) => () => agent(`Review ${f}`, {schema: BUG_SCHEMA})))
const real = findings.filter(Boolean)   // drop the nulls before you trust the array
```

Forget the `.filter(Boolean)` and you'll get a `Cannot read property of null` three stages later, far from the cause. Filter early.

## The options, one at a time

### `label` — what the user sees

By default the progress UI labels an agent with a truncation of its prompt. That's noise when you've spawned forty of them. `label` gives each a clean, scannable name:

```js
agent(reviewPrompt(file), {label: `review:${file}`})
// progress tree shows "review:src/auth.ts" instead of "Review the file src/auth.ts for..."
```

Make labels short and *distinct per item* — they're how you (and the user) tell forty concurrent agents apart at a glance.

### `phase` — which group it belongs to

`phase()` (the global hook) sets the current progress group, but inside `parallel()`/`pipeline()` many agents run at once and the global "current phase" becomes a race — agent A might land in the group agent B just switched to. So inside fan-out, set the phase *explicitly per agent*:

```js
parallel(items.map((it) => () => agent(p(it), {phase: 'Verify', label: `verify:${it.id}`})))
// every one of these lands in the "Verify" group, regardless of scheduling order
```

Same string → same group box. Use `opts.phase` inside any concurrent construct; use the global `phase()` only for sequential top-level transitions.

### `model` — the dial you usually leave alone

You can pin a specific model tier for one agent. **The default is to omit it** — the agent inherits the session's resolved model, which is almost always what you want. Set it only when you're highly confident a different tier fits: maybe a cheap mechanical extraction can run on a smaller model, or a subtle judgment deserves a bigger one. When unsure, don't set it. A workflow littered with `model:` overrides is usually someone second-guessing themselves.

### `agentType` — borrowing a specialist

By default `agent()` spawns the generic workflow subagent. But your environment may define *specialized* agents — a `code-reviewer` with a security-tuned system prompt, an `Explore` agent tuned for read-only search, a `chapter-writer`. `agentType` uses one of those instead:

```js
agent(prompt, {agentType: 'code-reviewer', schema: FINDINGS_SCHEMA})
// resolved from the same registry as the Agent tool; its system prompt applies,
// and the schema instruction is appended on top — they compose.
```

This is how a workflow plugs into purpose-built agents rather than reinventing their prompts inline. If a specialist already exists for the job, use it.

### `isolation: 'worktree'` — the expensive one

By default all agents share the same working directory. That's fine when they only *read*. But if multiple agents *write to files concurrently*, they'll clobber each other. `isolation: 'worktree'` gives an agent its own git worktree — an isolated checkout — so parallel mutations don't collide:

```js
// Migrating 20 files, each agent rewrites one file. Without isolation they'd
// race on the working tree. With it, each works on its own copy.
await parallel(files.map((f) => () => agent(`Migrate ${f} to the new API.`, {isolation: 'worktree'})))
```

It's **expensive** — hundreds of milliseconds and disk per agent to set up — so use it *only* when agents genuinely write in parallel and would otherwise conflict. Read-only fan-out? No isolation. Sequential writes? No isolation. Concurrent writes to the same tree? Now it earns its cost. (The worktree is auto-removed if the agent didn't change anything.)

## The two caps

Two limits bound every workflow, and knowing them prevents surprises.

**Concurrency cap:** at most `min(16, cpu_cores - 2)` agents run *at once*. You can still pass 500 items to `parallel()` — they all complete — but only ~10–16 are in flight at any moment; the rest queue and start as slots free. So fan-out is about *total throughput*, not *instantaneous parallelism*. Don't design as if 500 run simultaneously.

**Lifetime cap:** at most 1000 `agent()` calls across a workflow's entire run. This is a runaway-loop backstop, set far above any sane workflow. If you're approaching it, you have a bug — an unbounded loop — not a big job.

## A small but real example

Put it together — the atom with its real options, returning data:

```js
const SCHEMA = {
  type: 'object',
  properties: {risky: {type: 'boolean'}, reason: {type: 'string'}},
  required: ['risky', 'reason'],
}

// One agent per dependency, concurrent, each clearly labeled and phased,
// using a security specialist, forced to return structured data, null-safe.
const audits = await parallel(
  dependencies.map((dep) => () =>
    agent(`Does ${dep.name}@${dep.version} have known CVEs or supply-chain risk?`, {
      label: `audit:${dep.name}`,
      phase: 'Audit',
      agentType: 'code-reviewer',
      schema: SCHEMA,
    }),
  ),
)

const flagged = audits.filter(Boolean).filter((audit) => audit.risky)
```

Every dial here is doing a job: `label` and `phase` make the run legible, `agentType` borrows the right specialist, `schema` guarantees `.risky` exists, `.filter(Boolean)` survives a dead agent. That's the atom, fully dressed.

Now the central decision — how to arrange many of these atoms in time.
