# Chapter 2 — The Mental Model: A Deterministic Shell Around Judgment

The single most useful sentence about workflows is this:

> A workflow is deterministic control flow wrapped around non-deterministic work.

Everything good about workflows, and every workflow bug you'll ever write, comes from where you draw that line. So let's make it sharp.

## Two kinds of decisions

Imagine you're triaging flaky tests. There are two completely different kinds of thinking involved.

The first kind: *"For each test in the list, run the analyzer, and if it found a fix, apply it."* That's a loop, a function call, and an if-statement. There is exactly one correct way to execute it. You would be annoyed if it executed differently on Tuesday. This is **control flow**, and a model is the wrong tool for it — not because a model *can't* loop, but because a model loops *unreliably*. It might skip an item, lose count, or decide halfway through that it's done.

The second kind: *"Is this test actually flaky, or is it failing for a real reason?"* There is no algorithm for that. It requires reading code, weighing evidence, judgment. This is **work**, and it's exactly what a model is for.

The art of workflows is putting the first kind in JavaScript and the second kind in `agent()`. When a workflow misbehaves, nine times out of ten it's because a piece of control flow leaked into an agent's prompt ("...and remember to do all of them") or a piece of judgment leaked into the script (a regex pretending to understand code).

## The atom: `agent()`

The smallest unit of *work* is one call:

```js
const summary = await agent('Summarize the architecture of the auth module.')
//    ^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//    its final text         a fresh agent, clean context, does the task, returns
```

`agent(prompt)` spawns a brand-new subagent with an empty context window, hands it the prompt, lets it run (it can use tools — read files, search, run commands), and gives you back its final message as a string. That's the atom. Every workflow is just `agent()` calls arranged in time.

Three things about that atom matter enormously, and they're easy to miss:

**Each agent starts fresh.** Agent #2 knows nothing about what agent #1 did unless you put it in agent #2's prompt. There is no shared memory. This is a feature: it's *why* the context wall falls. But it means **the only channel between agents is the data you thread through the script.** If agent B needs agent A's output, you write `agent(promptUsing(await agent(...)))`. The script is the wiring.

**The return value is data, not conversation.** A subagent is told its final message *is* the return value — not a human-facing reply. So it returns raw results, not "Sure! Here's what I found...". You consume that return value in code. (And when you want it perfectly structured, you use a schema — Chapter 6.)

**It can fail to null.** If an agent dies on a terminal error after retries, or the user skips it mid-run, `agent()` returns `null` rather than throwing. So when you fan out, you `.filter(Boolean)` before trusting the results. Plan for the null.

## The shell: control flow you can trust

Around that atom you wrap ordinary JavaScript. The runtime gives you a handful of hooks, and they're all about *arranging agents in time*:

| Hook | What it arranges |
| --- | --- |
| `agent(prompt, opts)` | one unit of work |
| `pipeline(items, ...stages)` | each item flows through all stages, independently |
| `parallel(thunks)` | run many at once, **wait for all** (a barrier) |
| `phase(title)` / `log(msg)` | progress reporting to the user |
| `workflow(name, args)` | run another whole workflow as a step |

And plain JS for everything else: `for`, `while`, `if`, `.map`, `.filter`, `Set`, `Array`. The branching, the accumulation, the dedup, the "stop when we've found ten" — that's all just code, and it runs exactly as written.

Here's the shape, with the two halves labeled:

```js
const seen = new Set()          // ── shell: state the script owns
let dry = 0
while (dry < 2) {               // ── shell: loop until two empty rounds
  const found = await agent('Find a bug we haven't seen.')   // ── work: judgment
  if (seen.has(found.id)) { dry++; continue }   // ── shell: dedup + bookkeeping
  dry = 0
  seen.add(found.id)
}
```

The `while`, the `Set`, the counter, the `continue` — none of that is delegated to a model, so none of it is flaky. The one thing that needs intelligence, "find a bug," is the one thing that's an agent. That division is the entire game.

## Why deterministic matters more than it sounds

"Deterministic control flow" sounds like a nice-to-have. It's actually the thing that makes workflows *composable and resumable*.

Because the script is mechanical, the runtime can do something a pure agent could never do: **re-run it and get the same structure.** If a workflow dies halfway, the runtime replays the script, hands back cached results for the `agent()` calls that already completed, and only re-runs the ones that didn't. (That's Chapter 9.) This is only possible because the script's behavior doesn't drift — same script, same inputs, same call sequence.

This is also why the runtime forbids `Date.now()`, `Math.random()`, and `new Date()` inside a script: they'd make the script non-deterministic, and resume would break. If you need a timestamp, you pass it in from outside. If you need variety across N agents, you vary their prompts by index. The constraint isn't arbitrary; it's the price of replayability, and replayability is worth it.

## The one-sentence test

Before you write any workflow, you can sanity-check the design with one question:

> *Which parts need judgment, and which parts are just bookkeeping?*

Judgment → `agent()`. Bookkeeping → JavaScript. If you find yourself writing a prompt that says "do these things in order and don't forget any," you've put bookkeeping in an agent — pull it out into a loop. If you find yourself writing a regex to extract meaning from prose, you've put judgment in the script — push it into a schema'd agent.

Get this division right and the rest of the book is just vocabulary. Get it wrong and no amount of clever orchestration will save you.

Next, we build a complete workflow from an empty file, so the vocabulary has something to attach to.
