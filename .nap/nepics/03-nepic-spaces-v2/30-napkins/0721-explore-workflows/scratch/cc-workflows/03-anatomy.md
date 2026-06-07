# Chapter 3 — Anatomy of a Workflow

Let's build one from nothing. By the end of this chapter you'll have a complete, runnable workflow and you'll understand every line of it. We'll write the smallest thing that's still real: find the TODO comments in a codebase and, for each one, judge whether it's stale.

## The skeleton

Every workflow has exactly two parts: a `meta` block that declares what it is, and a body that does the work.

```js
export const meta = {
  name: 'todo-triage',
  description: 'Find TODO comments and flag the stale ones',
}

// body starts here
log('starting')
```

That's a valid workflow. Two parts, in order, always. Let's understand each.

## Part 1: `meta` — the declaration

The `meta` object is how the workflow introduces itself to the runtime and to the user *before* it runs. It shows up in the permission dialog, in the progress UI, in the workflow list.

```js
export const meta = {
  name: 'todo-triage',                              // stable identifier
  description: 'Find TODO comments and flag stale ones',  // one line, shown in the permission dialog
  phases: [                                         // optional: one entry per phase() you'll call
    {title: 'Scan', detail: 'grep the tree for TODOs'},
    {title: 'Judge', detail: 'one agent per TODO'},
  ],
}
```

There is **one rule about `meta` that trips everyone up**: it must be a *pure literal*. No variables, no function calls, no spreads, no template strings. The runtime reads `meta` by parsing it statically — before it ever executes your script — so it can show the user what they're about to authorize. If `meta` depended on runtime values, there'd be nothing to show. So:

```js
// WRONG — the runtime can't evaluate this before running the script
export const meta = {name: `todo-${env}`, phases: buildPhases()}

// RIGHT — everything spelled out as literals
export const meta = {name: 'todo-triage', phases: [{title: 'Scan'}, {title: 'Judge'}]}
```

The `phases` array is optional but worth filling in: each entry becomes a labeled group in the live progress display, and the `title` strings are matched *by exact text* to your `phase()` calls in the body. Use the same strings in both places or they won't line up.

## Part 2: the body — the work

The body is async by default. You `await` directly; there's no `async function` wrapper to write. Here's the whole thing:

```js
phase('Scan')
// One agent does the discovery. Its job is judgment-free grepping, but it still
// needs a tool (grep), so it's an agent, not a JS call — the script has no
// filesystem access of its own.
const todos = await agent('Grep the codebase for "TODO" comments. Return each as {file, line, text}.', {
  schema: TODO_LIST_SCHEMA,   // force clean structured output — see Chapter 6
})

log(`found ${todos.items.length} TODOs`)

phase('Judge')
// One agent PER todo, all concurrent. Each gets a clean context and one question.
const verdicts = await parallel(
  todos.items.map((todo) => () =>
    agent(`Is this TODO stale (already done / no longer relevant)? ${todo.file}:${todo.line} — "${todo.text}"`, {
      label: `judge:${todo.file}:${todo.line}`,   // what the user sees in the progress tree
      schema: VERDICT_SCHEMA,
    }),
  ),
)

// Back to plain JS: combine, filter, return. No agent needed for bookkeeping.
const stale = todos.items
  .map((todo, i) => ({...todo, verdict: verdicts[i]}))
  .filter((todo) => todo.verdict?.isStale)   // verdicts[i] is null if that agent failed — optional-chain it

return {totalTodos: todos.items.length, staleCount: stale.length, stale}
```

Read that top to bottom and notice the rhythm: **`phase()` to mark where we are, `agent()`/`parallel()` to do model work, plain JS to wire it together, `return` to hand back data.** That rhythm is every workflow.

## The return value

Whatever you `return` from the body becomes the workflow's result — the thing handed back to whoever launched it. Return *data*, structured for the consumer: counts, lists, paths, verdicts. Don't return a prose summary; the launching context can write the prose. The workflow's job is to produce the facts.

If you return nothing, the workflow still "succeeds" — but you've thrown away the work product. Almost always you want to return the distilled result.

## A note on `parallel()` here

We used `parallel()` above, and it deserves a flag because it's a trap for the unwary. `parallel(thunks)` takes an array of **functions that return promises** — `() => agent(...)`, not `agent(...)`. The arrow matters:

```js
parallel(todos.map((t) => () => agent(...)))   // RIGHT: array of thunks, runtime starts them
parallel(todos.map((t) => agent(...)))         // WRONG: you already started them all yourself
```

If you drop the `() =>`, every `agent()` fires immediately when `.map` runs, *before* `parallel` can manage concurrency. The thunk is how you hand `parallel` the *recipe* for the work instead of the work already in progress. (And as Chapter 5 argues, `parallel` is often the wrong choice anyway — but when you do use it, thunks.)

## Running it

You launch a workflow by handing the runtime your script. It runs in the background and notifies you when done. While iterating, you don't resend the whole script each time — the runtime persists it to a file and gives you back a path; you edit that file and re-launch by path. (More in Chapter 9.)

## What you now have

A complete workflow: a `meta` literal, a body that scans then judges then returns. Eleven lines of real logic. Every piece is either a declaration, a unit of work, or bookkeeping — exactly the three things from Chapter 2.

But we leaned on two things we haven't explained: the `agent()` options (`schema`, `label`) and the choice between `parallel()` and `pipeline()`. The next two chapters are those, in depth — first the atom, then the central decision.
