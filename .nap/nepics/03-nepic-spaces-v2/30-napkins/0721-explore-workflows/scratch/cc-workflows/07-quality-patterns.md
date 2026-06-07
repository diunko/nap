# Chapter 7 — Quality Patterns: Making Agents Trustworthy

A single agent's answer is plausible. Plausible is not the same as correct, and the gap between them is where workflows earn their keep. This chapter is the toolkit for closing that gap. Each pattern is a small, composable shape; the skill is knowing which one a task needs and stacking them.

The thread running through all of them: **the agent that produces an answer should not be the only one that judges it.** Separation of producer and judge is the whole idea. Everything below is a variation on it.

## Pattern 1: Adversarial verify

The confidence wall from Chapter 1: an agent finds a bug, you ask "is it real?", and it says yes because it's defending its own work. The fix is to spawn *skeptics whose only job is to refute*, and to bias them toward disbelief:

```js
// N independent agents, each TRYING to kill the claim. Bias toward "refuted" so
// a finding only survives if it's robust enough to beat skeptics who want it dead.
const votes = (await parallel(
  [1, 2, 3].map(() => () =>
    agent(`Try to REFUTE this claim: ${claim}. If you cannot clearly refute it, that's fine — but default
           to refuted=true when uncertain.`, {schema: VERDICT_SCHEMA}),
  ),
)).filter(Boolean)

const survives = votes.filter((v) => !v.refuted).length >= 2   // needs a majority of survivals
```

Two things make this work. The skeptics are *independent* (they don't see each other's votes), and they're *adversarial* (prompted to disbelieve). A finding that survives three hostile reviewers is one you can ship. This single pattern eliminates most "plausible but wrong" output.

## Pattern 2: Perspective-diverse verify

Three identical skeptics catch the same class of error three times. If a finding can be wrong in *more than one way*, give each verifier a *different lens* instead of cloning one:

```js
// Each verifier attacks a different failure mode. Diversity catches what
// redundancy can't — a correctness check won't notice a security hole.
const lenses = ['correctness', 'security', 'does-it-actually-reproduce']
const verdicts = (await parallel(
  lenses.map((lens) => () => agent(`Judge "${finding}" through the ${lens} lens. Is it real?`, {schema: VERDICT_SCHEMA})),
)).filter(Boolean)

const real = verdicts.filter((v) => v.isReal).length >= 2
```

Use redundant skeptics (Pattern 1) when a finding has one way to be wrong; use diverse lenses when it has several. Most real findings have several.

## Pattern 3: Judge panel

For *generative* tasks — design a system, write a function, pick an approach — there's no single answer to refute. Instead, generate several *independent attempts from different angles*, score them with parallel judges, and synthesize from the winner while grafting the best ideas from the runners-up:

```js
// Generate from genuinely different starting points — not the same prompt thrice.
const angles = ['optimize for simplicity', 'optimize for performance', 'optimize for extensibility']
const drafts = (await parallel(angles.map((angle) => () => agent(`Design the cache layer; ${angle}.`)))).filter(Boolean)

// Independent judges score every draft. (Barrier is correct here: synthesis needs all scores.)
const scored = await parallel(drafts.map((draft) => () =>
  agent(`Score this design 1-10 on correctness, simplicity, risk. Justify: ${draft}`, {schema: SCORE_SCHEMA}),
))

const winner = drafts[scored.indexOf(scored.filter(Boolean).sort((a, b) => b.total - a.total)[0])]
const final = await agent(`Refine the winning design, grafting the best ideas from the others.
                           Winner: ${winner}\nOthers: ${JSON.stringify(drafts)}`)
```

This beats "one attempt, then iterate" whenever the solution space is wide — because iteration polishes one idea, while a panel explores several and *then* polishes.

## Pattern 4: Loop-until-dry

When you don't know *how many* things there are to find — bugs, edge cases, broken links — a fixed `for` loop either stops too early (misses the tail) or wastes rounds. Instead, keep spawning finders until *K consecutive rounds turn up nothing new*:

```js
const seen = new Set()
const confirmed = []
let dryRounds = 0

while (dryRounds < 2) {                              // stop after 2 empty rounds in a row
  const found = (await parallel(FINDERS.map((f) => () => agent(f.prompt, {schema: BUGS_SCHEMA}))))
    .filter(Boolean).flatMap((r) => r.bugs)

  const fresh = found.filter((bug) => !seen.has(key(bug)))   // dedup against everything ever seen
  if (!fresh.length) { dryRounds++; continue }
  dryRounds = 0
  fresh.forEach((bug) => seen.add(key(bug)))
  confirmed.push(...fresh)
}
```

**One subtle, critical detail:** dedup against `seen` (everything ever surfaced), *not* against `confirmed` (things that passed judging). If you dedup against `confirmed`, a finding the judges *rejected* reappears every round — it was never confirmed, so it's never "seen" — and the loop never goes dry. This bug is easy to write and maddening to diagnose. Dedup against the full sighting set.

## Pattern 5: Multi-modal sweep

One search angle has blind spots. Searching "by filename" misses things named differently than they're described; searching "by content" misses things referenced but not defined nearby. Run several *blind-to-each-other* searches, each using a different angle, then union:

```js
// Each agent searches a DIFFERENT way. None knows what the others found.
const angles = [
  'Find it by grepping for the symbol name across the tree.',
  'Find it by reading the module that conceptually owns this feature.',
  'Find it by following imports from the entry point.',
  'Find it by searching tests that exercise this behavior.',
]
const hits = (await parallel(angles.map((a) => () => agent(a, {schema: HITS_SCHEMA})))).filter(Boolean)
const union = dedupe(hits.flatMap((h) => h.locations))
```

Useful whenever "I searched and found nothing" might mean "I searched *one way* and found nothing." Coverage comes from angle diversity, not from searching harder along one axis.

## Pattern 6: Completeness critic

The capstone. After a round of work, spawn one agent whose entire job is to ask **"what's missing?"** — a modality not yet tried, a claim asserted but never verified, a source mentioned but never read. Its output becomes the *next* round of work:

```js
const gaps = await agent(`Here is everything found so far: ${JSON.stringify(confirmed)}.
                          What is MISSING? Name unrun searches, unverified claims, unread sources.`, {schema: GAPS_SCHEMA})
if (gaps.items.length) { /* feed gaps back into another round */ }
```

This is what turns a workflow from "did some work" into "covered the space." It's the agentic version of a checklist you didn't have to write in advance.

## Composing them

Real workflows stack these. Here's exhaustive review as a single composition — *find → dedup vs seen → diverse-lens panel → loop until dry*:

```js
const seen = new Set(), confirmed = []
let dry = 0
while (dry < 2) {
  const found = (await parallel(FINDERS.map((f) => () => agent(f.prompt, {phase: 'Find', schema: BUGS}))))
    .filter(Boolean).flatMap((r) => r.bugs)
  const fresh = found.filter((b) => !seen.has(key(b)))
  if (!fresh.length) { dry++; continue }
  dry = 0; fresh.forEach((b) => seen.add(key(b)))

  // each fresh bug judged by 3 distinct lenses concurrently
  const judged = await parallel(fresh.map((b) => () =>
    parallel(['correctness', 'security', 'repro'].map((lens) => () =>
      agent(`Judge "${b.desc}" via the ${lens} lens — real?`, {phase: 'Verify', schema: VERDICT})))
      .then((vs) => ({bug: b, real: vs.filter(Boolean).filter((v) => v.real).length >= 2}))))

  confirmed.push(...judged.filter((j) => j.real).map((j) => j.bug))
}
return confirmed
```

Loop-until-dry provides exhaustiveness; multi-finder fan-out provides coverage; diverse-lens judging provides trust. Each pattern handles one weakness, and stacked they cover the others' gaps.

## One discipline: never cap silently

A theme across these patterns is *coverage*. So if your workflow ever bounds coverage — takes the top N, samples, skips retries — **say so with `log()`.** A workflow that silently dropped 40 of 50 items *reads* like it covered everything, which is worse than covering ten and admitting it:

```js
if (items.length > CAP) log(`NOTE: capping at ${CAP} of ${items.length} items; ${items.length - CAP} not reviewed`)
```

Silent truncation is the one quality failure these patterns can't catch, because it hides itself. Surface every cap.

## Choosing

Scale the machinery to the request. "Find any obvious bugs" wants a couple of finders and single-vote verification. "Thoroughly audit this for security issues" wants a finder pool, three-to-five-vote adversarial verification, and a completeness critic. When unsure, lean thorough for *review/audit/research* and lean brief for *quick checks*. The patterns are the same; only the dial changes.

Next: how to power these loops and fan-outs sanely — budgets, the concurrency cap, and termination.
