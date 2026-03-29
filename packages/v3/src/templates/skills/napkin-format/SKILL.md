---
name: napkin-format
description: Reformat a file into dry, scannable napkin format — labels over sentences, one-glance bullets, nested causation, with breathing room at pivot points
---

# Napkin Format

Reformat the given file (or selected text) into napkin format. Read the file, apply the principles below, write it back. Preserve all meaning — change only the form.

$ARGUMENTS — a file path, or "this" meaning the file currently being discussed.

## What This Format Is

A napkin reads like a whiteboard photo, not a document. You scan it. Your eyes land on a bullet, you get it, you move on. If a bullet needs you to stop and think — it earns that pause by being a real question, not by being long.

The goal: mind-to-mind transfer at the speed of scanning. Like a presentation — most slides are sparse labels. But the slide with the key question? That one gets a full sentence, because you need the room to stop and sit with it.

## The Rules

### 1. Dry the water

Drop articles (the, a), filler verbs (does, is, it's), "that" clauses, throat-clearing. Keep every noun and verb that carries meaning.

```
BEFORE: this is the riskiest UI bet
AFTER:  riskiest UI bet

BEFORE: M1 proves the UI concept with filesystem data
AFTER:  M1 proves UI concept with filesystem data

BEFORE: it's a view layer on top of data that already exists
AFTER:  view layer on data that already exists

BEFORE: each milestone answers a question whose answer shapes the next milestone
AFTER:  each milestone's answer shapes the next
```

### 2. One glance per bullet

If a bullet is 5–7 words, you get it instantly — one glance, it's in your head. Past 8 words, your eyes have to travel across the line, match the end with the beginning, parse the grammar. That's not scanning anymore, that's reading.

If you need more words, nest. Break the idea into a top-level anchor and a detail beneath it.

```
BEFORE: if M1's tree view doesn't work, we reshape before investing in persistence

AFTER:
* M1's tree view doesn't work?
  * reshape before investing in persistence
```

```
BEFORE: does the architect feel continuous or does it feel like a new conversation wearing the old one's clothes?

AFTER:
* does the architect feel continuous?
  * or like a new conversation with no continuity?
```

The top bullet is the glanceable hook. The nested bullet adds nuance for the reader who wants to go deeper. If you get it from the top bullet, you skip the rest.

### 3. Questions that breathe

Not everything gets dried. When a question is worth sitting with — when it's the real thing you want the reader to stop and feel — let it have its full form.

```
* persistence changes behavior?
  * do you use the app differently when closing it isn't death?
```

The first bullet is the label. The second is the real question — it makes you stop and actually think about what "persistence" means emotionally, not just technically. Don't compress this one. It's doing work.

How to tell the difference: if compressing the sentence loses the *feeling* of the question — if it stops making the reader pause — keep the long form. If it's just conveying information, dry it.

### 4. Voiceover at pivot points

Most of a napkin is labels. But at structural pivot points — where the reader needs to shift their thinking — articulate like a presentation voiceover. A short phrase that sets the mental rails.

```
WEAK:   * unproven assumptions
STRONG: * things we think we know, but haven't proven
```

The weak version is a label. The strong version puts you in a specific mindset: "oh, these aren't unknowns — we THINK we know them, but we might be wrong." It sets the rails for how to read the bullets beneath it.

Use this sparingly. If every section header is a voiceover, none of them land. Save it for the moments where you need the reader to shift gears.

### 5. Nest causation, don't inline it

When one thing causes or implies another, don't put both on one line with "if/then" or a dash. Split into parent (the condition) and child (the consequence). The nesting IS the causation.

```
BEFORE: if M1 reveals that the tree view is too noisy, M2's schema changes

AFTER:
* M1 reveals tree view too noisy?
  * → M2's schema changes
```

```
BEFORE: this is the second big shift, but it depends on everything above (UI, persistence, resume). if M1-M3 don't validate, nepic spaces might need a different shape

AFTER:
* second big shift, depends on everything above (UI, persistence, resume)
* M1-M3 don't validate?
  * nepic spaces might need different shape
```

The `→` arrow is optional — use it when the causal link needs emphasis. Nesting alone usually carries it.

### 6. Visual tags to invoke images

When describing something the reader should *see*, drop in concrete tags that invoke the visual. Don't describe the UI — tag it so the reader's mind assembles the picture. Nest has-relations (what contains what), sibling peers spatially (what's next to what). The nesting becomes a screenshot.

```
WEAK:
* question: does structured project view change how you see the work?
  * napkin cards, multiple agents inside one, agent terminal activation, file links to click

STRONG:
* question: does structured project view change how you see the work?
  * napkin cards:
    * file links to click
    * multiple agents
    * agent terminal activation
```

The weak version lists things inline — you have to parse the commas and hold them all in working memory. The strong version nests — the card contains these things, siblings are peers inside it. You see the card in your head, almost like a screenshot. Has-relations nest downward. Spatial peers sit as siblings.

Use this at moments where you want attention to go, not everywhere.

### 7. Parentheses for inline tags, not for asides

Parentheses tag what something IS — one concept, obvious, no flow break: `(security boundary)`, `(SQLite status, filesystem content)`, `(no SQLite yet)`.

Don't use parentheses for commentary, caveats, or multi-clause asides. Those become nested bullets.

```
WEAK:   * napkin browser reads filesystem (which means no SQLite dependency yet, so schema changes don't matter at this stage)
STRONG: * napkin browser reads filesystem (no SQLite yet)
```

### 8. Arrows for flows and pipelines

When something is a short sequence or data flow, use `→` inline. The arrow captures motion — but only if the whole chain fits in one glance (under 6–7 words). Past that, your eyes lose the chain and it becomes a sentence you have to parse.

```
GOOD (short, one glance):
* napkin → spec → test → code
* left gutter → nepic switcher
* features → artifacts → agents

BAD (too long, eyes lose the chain):
* user clicks filter → iframe updates → host validates → state persists → UI reflects new state

BETTER (nest the steps):
* filter flow
  * user clicks filter → iframe updates
  * host validates → state persists
  * UI reflects new state
```

## What NOT to Do

* Don't compress questions that need to breathe (rule 3)
* Don't make every header a voiceover — save it for pivot points (rule 4)
* Don't add visual tags to every bullet — use them where you want attention (rule 6)
* Don't change the meaning, the logic, or the structure of ideas — only the form
* Don't add content that wasn't there
* Don't remove content — if a bullet seems redundant, it might be doing work you don't see. Keep it, just dry it.
