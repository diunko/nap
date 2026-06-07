# Chapter 11 — A Worked Example: The Book-Writing Workflow

Everything in this book was learned by building one workflow — the one that wrote a *different* book, a tour of the Coda codebase, while you read this. It's worth dissecting in full, because it uses nearly every concept from the previous ten chapters in anger: `meta`, schemas, a five-stage `pipeline`, specialized `agentType`s, conditional stages, `args` override, and a final aggregation. Let's read it the way you'd read any program you want to learn from — top to bottom, asking "why this and not something else" at each step.

## The job

Write a multi-chapter book about a codebase. For *each* chapter: research it (with verified line numbers), draft editorial notes, write the chapter, verify every code link points at the right line, and fix the ones that don't. Then write a table-of-contents index. Twelve chapters, five stages each, plus an index — around sixty agents.

That sentence already tells you the shape: it's per-item multi-stage work, which from Chapter 5 means **pipeline**, not barrier. No stage needs all chapters together — chapter 3 can be verifying while chapter 7 is still researching. The only thing that needs everything-at-once is the final index, and that runs *after* the pipeline, in plain JS.

## The `meta` block

```js
export const meta = {
  name: 'write-book',
  description: 'Research, write, verify, and index a multi-chapter mini-book about the Coda codebase',
  whenToUse: 'Run to generate the whole-codebase-tour mini-book...',
  phases: [
    {title: 'Research', detail: '...'}, {title: 'Editorial', detail: '...'},
    {title: 'Write', detail: '...'},    {title: 'Verify', detail: '...'},
    {title: 'Fix', detail: '...'},      {title: 'Index', detail: '...'},
  ],
}
```

A pure literal, as Chapter 3 demands — every value spelled out, nothing computed. The six `phases` mirror the five pipeline stages plus the index, and their `title` strings are the *exact* strings the body passes to `phase:` on each agent, so the progress tree groups cleanly. `whenToUse` shows up in the workflow list — it's documentation for the next person (or the next you).

## Parameterization via `args`

```js
const DEFAULT_CHAPTERS = [
  {num: '01', slug: 'monorepo-map', title: 'The Monorepo Map', topic: '...', notes: '...'},
  // ... 11 more
]
const chapters = Array.isArray(args) && args.length ? args : DEFAULT_CHAPTERS
```

This is Chapter 10's lesson applied: a built-in default table of contents, *overridable* by passing an array as `args`. Want a single pilot chapter to judge quality before committing to twelve? Pass a one-element array. Want a different book entirely? Pass a different list. The script didn't change; the input did. And note `Array.isArray(args)` — we trust `args` to be a real array (passed as JSON, not a stringified blob), exactly the edge from Chapter 10.

## The schemas — the seams between stages

```js
const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    researchFile: {type: 'string'},
    oneLineSummary: {type: 'string'},   // ← the index stage will read this
    keyConcepts: {type: 'array', items: {type: 'string'}},
    keyFiles: {type: 'array', items: {type: 'string'}},
  },
  required: ['researchFile', 'oneLineSummary', 'keyConcepts', 'keyFiles'],
}

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    allCorrect: {type: 'boolean'},       // ← the fix stage will branch on this
    mismatches: {type: 'array', items: {/* link, statedLine, correctLine, note */}},
  },
  required: ['allCorrect', 'mismatches'],
}
```

Two schemas, each placed exactly where a *later stage branches on the output* (Chapter 6's rule for when to use one). The research schema carries `oneLineSummary` because the index — three stages and a whole pipeline later — needs it. The verify schema carries `allCorrect` because the fix stage decides whether to even spawn an agent based on it. The editorial and write stages have *no* schema: their output is prose consumed by the next agent, not data branched on by JavaScript. That's the schema/prose split, made concrete.

## The pipeline — five stages, no barrier

```js
const results = await pipeline(
  chapters,

  // Stage 1 — Research: a specialist agent writes findings to disk, returns structured summary.
  (ch) => agent(researchPrompt(ch), {
    label: `research:${ch.slug}`, phase: 'Research',
    agentType: 'chapter-researcher',   // a specialist tuned for codebase research
    schema: RESEARCH_SCHEMA,
  }).then((research) => ({research})),

  // Stage 2 — Editorial: plain agent reads the research, returns prose notes (no schema).
  (prev, ch) => agent(editorialPrompt(ch, prev.research), {
    label: `editorial:${ch.slug}`, phase: 'Editorial',
  }).then((notes) => ({...prev, notes})),

  // Stage 3 — Write: the writer specialist consumes research + notes, writes the chapter file.
  (prev, ch) => agent(writePrompt(ch, prev.research, prev.notes), {
    label: `write:${ch.slug}`, phase: 'Write', agentType: 'chapter-writer',
  }).then(() => prev),   // returns prev unchanged — the side effect is the written file

  // Stage 4 — Verify: a checker specialist returns structured mismatches.
  (prev, ch) => agent(verifyPrompt(ch), {
    label: `verify:${ch.slug}`, phase: 'Verify', agentType: 'chapter-verifier', schema: VERIFY_SCHEMA,
  }).then((verdict) => ({...prev, verdict})),

  // Stage 5 — Fix: CONDITIONAL — skip the agent entirely when nothing's wrong.
  (prev, ch) => {
    if (prev.verdict.allCorrect || !prev.verdict.mismatches.length) {
      return {ch, research: prev.research, fixed: 0}   // no agent spawned — saves tokens
    }
    return agent(fixPrompt(ch, prev.verdict), {
      label: `fix:${ch.slug}`, phase: 'Fix', agentType: 'chapter-writer',
    }).then(() => ({ch, research: prev.research, fixed: prev.verdict.mismatches.length}))
  },
)
```

Several earlier lessons are visible at once here:

**Pipeline, not barrier (Ch. 5).** Each chapter flows through all five stages on its own clock. With twelve chapters and uneven research times, this finishes when the *slowest single chapter* finishes — not when the slowest research, *then* the slowest editorial, *then*... A barrier would have idled fast chapters at every stage boundary.

**`(prev, ch)` everywhere (Ch. 5).** Every stage takes the previous result *and* the original chapter spec. That's why stage 4 can write `label: verify:${ch.slug}` without anyone having threaded the slug through stages 1–3 — the original item is handed to every stage for free.

**Threading data through `prev` (Ch. 6).** Each stage returns an object that accumulates what later stages need: stage 1 produces `{research}`, stage 2 adds `notes`, stage 4 adds `verdict`. The `research` object rides all the way to the end because the index needs its `oneLineSummary`.

**Specialists via `agentType` (Ch. 4).** Research, writing, and verification each use a purpose-built agent (`chapter-researcher`, `chapter-writer`, `chapter-verifier`) rather than a generic one with a giant inline prompt. The editorial step uses the default agent — it's just "read this and plan," no specialist needed.

**The conditional stage (Ch. 2, control flow in JS).** Stage 5 is the cleanest illustration of the whole book's thesis. The *decision* "should we fix anything?" is a plain `if` on `prev.verdict.allCorrect` — bookkeeping, so it's JavaScript. The *work* "fix these specific mismatches" is an agent — judgment, so it's `agent()`. When a chapter's links are all correct, **no agent is spawned at all** — the stage returns synchronously and saves a few thousand tokens times however many chapters were clean.

**`phase:` on every agent (Ch. 4).** Because these run concurrently inside a pipeline, each agent sets its phase explicitly rather than relying on the global `phase()`. Twelve chapters × five stages all in flight, and the progress tree still groups every agent into the right box.

## The aggregation — plain JS, then one agent

```js
phase('Index')
const written = results.filter(Boolean)   // a dead stage dropped that chapter to null — drop it
const entries = written.map((r) => ({
  title: r.ch.title,
  file: `${r.ch.num}-${r.ch.slug}.md`,
  summary: r.research.oneLineSummary,      // the field we carried all the way from stage 1
}))

if (entries.length) {
  await agent(indexPrompt(entries), {label: 'book-index', phase: 'Index'})
}

return {chaptersWritten: written.length, chaptersRequested: chapters.length, /* ... */}
```

The `.filter(Boolean)` (Ch. 4) drops any chapter whose pipeline died, so a single failed chapter doesn't poison the index. The reshaping into `entries` is pure data manipulation — JavaScript, no agent — and only the actual *writing* of the index prose is an agent. Then we `return` structured data: counts and paths, not prose (Ch. 3). When this ran, that return was `{chaptersWritten: 12, chaptersRequested: 12, totalLinkFixes: 23, ...}` — the facts, for the launcher to narrate.

## What the run looked like

Twelve chapters, ~59 agents, ~4 million tokens, about fourteen minutes of wall-clock. The 23 link fixes are the verify→fix loop doing its job — 23 places where a chapter claimed a code element was on line N and the verifier found it on line M, corrected before the book was ever considered done. That's the confidence wall (Ch. 1) handled structurally: the agent that *wrote* the link never got to decide it was right; a separate verifier checked it against source, and a fix pass corrected it.

## Why this is a good workflow

Step back and notice what makes it clean, because these are the properties to aim for in your own:

- **Every stage is small and named.** Resume (Ch. 9) works beautifully — edit the writer prompt, re-run, and all the research comes back from cache.
- **The judgment/bookkeeping split is crisp.** Loops, conditionals, filtering, reshaping — all JS. Research, writing, verifying — all agents. Nothing leaks across.
- **It defaults useful but parameterizes fully.** Runs out of the box; takes an `args` override for pilots or different books.
- **It's honest about failure.** `.filter(Boolean)` at the aggregation, a conditional fix stage, structured return — a chapter can die without taking the book with it.

That's the whole craft, in one script: find the judgment, make it an agent; find the bookkeeping, make it code; arrange the agents in time with a pipeline; let schemas carry data across the seams; verify what you produce; and return facts. Everything in the preceding ten chapters was just teaching you to read this one file and know *why* every line is the way it is.

Go write one.
