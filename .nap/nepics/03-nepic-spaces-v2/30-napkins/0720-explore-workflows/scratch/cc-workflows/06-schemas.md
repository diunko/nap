# Chapter 6 — Structured Output: Schemas as Contracts

In a single-agent task you read the agent's prose and move on. In a workflow, one agent's output is another agent's input — or a JavaScript filter's input, or a loop's condition. Prose is a terrible interface for that. Schemas are the fix, and they're the difference between a workflow that *mostly* works and one that *reliably* works.

## The problem schemas solve

Without a schema, an agent returns a string. Suppose you ask it for bugs:

```js
const reply = await agent('Find bugs in auth.ts.')
// reply === "I found 2 issues. First, the token check on line 40 is missing...
//            Second, there's a race in the refresh logic around line 80..."
```

Now what? You need the *count* to decide whether to verify. You need each bug's *file and line* to route it. To get those out of that paragraph you'd write a regex or — worse — spawn *another* agent to parse the first agent's prose. Both are fragile. The agent might say "a couple of issues" instead of "2." It might format line numbers three different ways. You're parsing natural language, which is exactly the thing that has no stable format.

## The fix: declare the shape, get it guaranteed

Pass a JSON Schema and the contract flips. The runtime *forces* the agent to emit data matching the schema, validates it **at the tool-call layer**, and makes the agent retry if it doesn't match. By the time `agent()` resolves, you have a validated object — no parsing, no regex, no second agent:

```js
const BUGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,   // reject stray fields — keeps the agent honest
  properties: {
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: {type: 'string'},
          file: {type: 'string'},
          line: {type: 'integer'},
          severity: {type: 'string', enum: ['low', 'medium', 'high']},  // constrain to known values
        },
        required: ['title', 'file', 'line', 'severity'],
      },
    },
  },
  required: ['bugs'],
}

const found = await agent('Find bugs in auth.ts.', {schema: BUGS_SCHEMA})
// found.bugs is GUARANTEED to be an array of {title, file, line, severity}.
if (found.bugs.length > 3) { /* ... */ }                 // count: just works
found.bugs.filter((b) => b.severity === 'high')          // routing: just works
```

The key phrase is **validation happens at the tool-call layer.** It isn't your code checking the agent's homework after the fact — the runtime won't *let* the agent return a non-conforming object. The retry loop is upstream of you. So inside your script, `found.bugs` is not "probably an array" — it *is* an array. That certainty is what lets you build stage 2 on top of stage 1 without defensive code everywhere.

## Schemas as the seam between stages

This is why schemas matter so much more in workflows than in single-agent work: **they're the typed interface between stages.** Stage 1 promises a shape; stage 2 consumes that shape. The pipeline from Chapter 5 only reads cleanly because each stage's output is structured:

```js
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {isReal: {type: 'boolean'}, confidence: {type: 'number'}, reason: {type: 'string'}},
  required: ['isReal', 'confidence', 'reason'],
}

const confirmed = (await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, {schema: BUGS_SCHEMA}),                          // stage 1 promises {bugs: [...]}
  (review) => parallel(review.bugs.map((bug) => () =>                     // stage 2 consumes it cleanly
    agent(`Verify: ${bug.title} at ${bug.file}:${bug.line}`, {schema: VERDICT_SCHEMA})
      .then((verdict) => ({...bug, verdict})),                            // graft the verdict onto the bug
  )),
)).flat().filter(Boolean).filter((bug) => bug.verdict?.isReal && bug.verdict.confidence > 0.7)
```

Every `.bugs`, `.verdict.isReal`, `.confidence` in that last line is safe *because* the schemas guaranteed them. Take the schemas away and that one-liner becomes fifty lines of "if the agent happened to include a confidence field, and if it's a number, and if..."

## Designing good schemas

A few habits separate schemas that help from schemas that fight you:

**Set `additionalProperties: false`.** It tells the agent "these fields and no others," which sharpens its output and catches drift. Without it, agents tend to bolt on extra commentary fields.

**Use `enum` for closed sets.** `severity: {enum: ['low','medium','high']}` is far better than `severity: {type: 'string'}` — you get one of three known values instead of "high", "High", "critical-ish", "🔴".

**Mark the fields you'll actually read as `required`.** If your script does `found.bugs.length`, then `bugs` must be required, or `found.bugs` might be `undefined` and you're back to defensive code.

**Don't over-specify.** Ask for the fields you'll *use*. A schema with thirty optional fields the agent must consider is a worse prompt than one with the four that matter. The schema is also a *spec the agent reads* — keep it focused and you focus the agent.

**Push small judgments into the schema.** Want a confidence score? A boolean "is this actionable"? A one-line reason? Adding those fields makes the agent *commit* to a judgment in a machine-readable way, which your script can then branch on. That's often cleaner than a follow-up agent.

## When to skip the schema

Not every agent needs one. If an agent's output is *consumed by another agent as prose* — say, an editorial-notes step whose text gets pasted into the next agent's prompt — a schema just adds friction. The rule mirrors Chapter 2: **schema when JavaScript will branch on the output; prose when another agent will read it.** Counts, flags, routing keys, lists you'll iterate → schema. Narrative one agent hands to another → string.

## The mental shift

The instinct from chatting with a model is "ask, then read the answer." The workflow instinct is "**declare the data you need, then consume it.**" You stop thinking of an agent as something that *replies* and start thinking of it as something that *returns a typed value*. Once that click happens, multi-stage workflows stop feeling like duct-taping prose together and start feeling like calling functions that happen to be intelligent.

Next we use these typed atoms to build the patterns that make agent output *trustworthy* — adversarial verification, judge panels, and the rest of the quality toolkit.
