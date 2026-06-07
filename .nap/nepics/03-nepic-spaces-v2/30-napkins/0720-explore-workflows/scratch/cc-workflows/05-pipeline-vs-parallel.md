# Chapter 5 — `pipeline` vs `parallel`: The Central Decision

You have many items and several stages of work to do on each. How do you arrange the agents in time? This is *the* design decision in workflows, and most people get it wrong the same way. So let's get it right, with the reasoning, not just the rule.

## Two ways to run multi-stage work

Say you're reviewing five files, and each file goes through two stages: **review it**, then **verify the findings**. Ten agents total. There are two ways to schedule them.

**The barrier way (`parallel` between stages):** run all five reviews at once; *wait for every review to finish*; then run all five verifications at once.

```
review:  [1][2][3][4][5]   ← all start together
                      ↓ WAIT for the slowest review
verify:  [1][2][3][4][5]   ← only now can any verification start
```

**The pipeline way (`pipeline`):** each file flows through both stages on its own, with *no waiting for siblings*. File 1's verification can start the instant file 1's review is done — even if file 4 is still being reviewed.

```
file 1: [review][verify]
file 2: [review][verify]
file 3:    [review][verify]
file 4:      [review][verify]
file 5: [review][verify]
        ← no horizontal line anyone waits on
```

Look at the wall-clock. The barrier finishes when *the slowest review* plus *the slowest verify* are both done — every fast file sits idle waiting for the slow one before *anything* moves to stage two. The pipeline finishes when *the slowest single end-to-end chain* is done. If review times vary at all, the pipeline wins, often by a lot.

## The rule: pipeline by default

```js
// THE DEFAULT. Each item runs all stages independently. No barrier.
const results = await pipeline(
  files,
  (file) => agent(`Review ${file} for bugs.`, {schema: FINDINGS}),       // stage 1
  (review, file) => agent(`Verify these findings in ${file}: ${review}`), // stage 2
)
```

`pipeline(items, stage1, stage2, ...)` runs each item through every stage as fast as that item can move. Wall-clock equals the slowest *chain*, not the sum of slowest-per-stage. **This is what you reach for unless you have a specific reason not to.**

Two details that make pipelines pleasant:

**Every stage gets the original item.** Each stage callback is called with `(prevResult, originalItem, index)`. So a late stage can label its work or reference the source without you threading context through every intermediate return value:

```js
pipeline(files,
  (file) => agent(`Review ${file}`, {schema: FINDINGS}),
  (review, file, i) => agent(`Verify ${review.count} findings`, {label: `verify:${file}`, phase: 'Verify'}),
  //                ^^^^^^^^^^^^ the original file and its index, free, in every stage
)
```

**A throwing stage drops just that item.** If stage 2 throws for file 3, file 3 becomes `null` in the results and skips its remaining stages — the other four files are unaffected. So, as always, `.filter(Boolean)` the results before using them.

## When a barrier is actually correct

`parallel(thunks)` is a **barrier**: it starts all the thunks, then waits for *all* of them before returning the array. (A thunk that throws resolves to `null` in that array — the call itself never rejects, so filter before use.)

A barrier is the right tool in exactly one situation: **stage N genuinely needs the combined results of all of stage N-1.** The cross-item dependency is the whole justification. Three honest cases:

```js
// 1. Dedup/merge across the FULL set before expensive downstream work.
const allFindings = (await parallel(dims.map((d) => () => agent(d.prompt, {schema: FINDINGS}))))
  .filter(Boolean).flatMap((r) => r.findings)
const deduped = dedupeByLocation(allFindings)   // ← needs every finding at once, by definition
const verified = await parallel(deduped.map((f) => () => agent(verifyPrompt(f))))
```

```js
// 2. Early-exit on the aggregate. "Zero findings total → skip verification entirely."
const found = (await parallel(finders.map((f) => () => agent(f.prompt, {schema: BUGS})))).filter(Boolean)
if (found.every((r) => r.bugs.length === 0)) return {bugs: []}   // ← decision needs the whole set
```

```js
// 3. Stage N's prompt literally references "the others" for comparison.
const drafts = await parallel(approaches.map((a) => () => agent(`Draft solution: ${a}`)))
const best = await agent(`Here are ${drafts.length} drafts. Pick the best and say why: ${JSON.stringify(drafts)}`)
```

In each, there is no way to proceed with *one* item's result — you need them *together*. That's a barrier.

## When a barrier is NOT justified (the common mistake)

Here's the trap. People reach for a barrier because the *code reads more cleanly* as "do all of stage 1, then transform, then do all of stage 2":

```js
// SMELLS WRONG — a barrier with no cross-item dependency
const reviews = await parallel(files.map((f) => () => agent(`Review ${f}`, {schema: FINDINGS})))
const flat = reviews.filter(Boolean).flatMap((r) => r.findings)   // just flattening — no cross-item need
const verified = await parallel(flat.map((f) => () => agent(verifyPrompt(f))))
```

That middle transform — flatten, map, filter — has **no cross-item dependency**. File 1's findings don't need file 5's findings to be flattened. So the barrier is pure wasted wall-clock: every fast file waits for the slowest review before *any* verification starts. Rewrite it as a pipeline and do the transform *inside a stage*:

```js
// RIGHT — same logic, no barrier. Each file verifies as soon as its review lands.
const verified = await pipeline(
  files,
  (f) => agent(`Review ${f}`, {schema: FINDINGS}),
  (review) => parallel(review.findings.map((find) => () => agent(verifyPrompt(find)))),
  //          ^ the per-item fan-out lives INSIDE the stage; no global barrier
)
```

## The smell test

Whenever you write this shape:

```js
const a = await parallel(...)
const b = transform(a)        // flatten / map / filter — operates per-item, no cross-item need
const c = await parallel(b.map(...))
```

stop and ask: *does that middle `transform` need all of `a` at once?* If it's just reshaping each element independently — flattening, mapping, filtering — then **no**, and you've left wall-clock on the floor. Rewrite as a pipeline with the transform inside a stage. The barrier is justified only when `transform` is a genuine *reduction across items*: a dedup, a merge, an aggregate decision, a "compare them to each other."

Three quick distinctions that are *not* good enough reasons for a barrier:

- *"I need to flatten first."* → do it inside a stage.
- *"The stages are conceptually separate."* → separate ≠ synchronized. `pipeline` models separate stages fine.
- *"It's cleaner code."* → barrier latency is real; a little extra threading is cheap by comparison.

## The mantra

When in doubt, **pipeline**. The barrier is the special case, and it has exactly one trigger: stage N needs all of stage N-1 *together*. If you can't point at the cross-item dependency, you don't have one, and you should be pipelining.

Next: the seam that makes multi-stage work clean in the first place — schemas, the contract between one agent's output and the next's input.
