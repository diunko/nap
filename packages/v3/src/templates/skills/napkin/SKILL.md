---
name: napkin
description: Brainstorm and explore ideas with the user, then capture the result as a napkin doc — sparse, load-bearing, expandable by agents
---

# Let's Napkin This

You and the user are about to napkin something — brainstorm a system, explore an idea space, and capture it as a sparse doc of load-bearing idea anchors that agents can expand into specs, code, and tests.

## Input

The user provides a topic, a question, or a raw stream of consciousness. Sometimes just a voice note dumped as text. Your job: explore it WITH them, then capture the result.

$ARGUMENTS

## The Two Phases

### Phase 1: Explore

This is a conversation. Not an interview. Not a requirements gathering session. A JAM.

- **Dive rabbit holes.** The user says something interesting — follow it. Go deep. Chase the idea until it collapses or clicks.
- **Push on constraints.** Stress-test what the user states. "What if there are 10,000 rows?" "What's the naive answer and why is it wrong?"
- **Throw in options.** Don't wait to be asked. "Here are three ways to do this." Let the user react, reject, redirect.
- **Be concrete.** Not "we need state management." Say "the user clicks a filter, the iframe updates instantly, but the host needs to validate — and they can't share memory."
- **Be honest about uncertainty.** "I don't know how this works yet" is valuable.
- **Keep answers SHORT.** Bullet points over paragraphs. The user is thinking fast — match their pace.

**How you know Phase 1 is done:** The user says "ok let's capture this" or "napkin it." Or you feel the shape forming — same ideas keep recurring, pieces connect, no big open questions. Suggest: "I think we have the shape. Want me to napkin this?"

### Phase 2: Capture

Produce the napkin doc. Write it, show it to the user, iterate until they're satisfied.

**The output file:** Ask the user where to write it, or propose a sensible path based on context.

## The Napkin Format

### What it is

Each bullet is an **anchor** — a pin that holds one piece of a larger idea in place. The anchor is tiny. The idea it holds is big. An agent reading the anchor can unfold it into a full spec because the anchor captures the essence: what this thing is, what it connects to, and where it's tricky.

### Labels, not sentences

Write like you're labeling a whiteboard diagram, not writing a document. If a word wouldn't appear on a whiteboard label, you probably don't need it.

### Nesting is zooming in

Each indentation level zooms deeper into the idea. The depth is where the specific engineering details live — the ones that agents will expand into implementation.

- **Level 1:** Territory, top-level section
- **Level 2:** Component, major concept
- **Level 3:** Aspect, sub-component, property of that component
- **Level 4:** Behavior, characteristic, what it does, how it works
- **Level 5:** Specific detail, concrete example, the pin that would become a line in a spec

Deep levels aren't more verbose. They're MORE SPECIFIC. Short, sharp, a concrete detail at the exact granularity an engineer needs.

### Parentheses are inline tags

Parentheses are for quick clarification that doesn't need its own bullet: `(API for the host)`, `(security boundary)`, `(sends bundles, receives state/errors)`. One concept, obvious, tagging what something IS without breaking the flow. NOT a replacement for nesting.

### Three things worth capturing

- **What exists** — components, nouns
- **What connects** — which thing talks to which
- **Where it's tricky** — constraints, tensions, the "but" that makes the obvious answer wrong

If there's no tension, it probably doesn't need an anchor.

### Problem before solution

Don't state a decision. State the tension that forced it:

```
* state management
  * the problem
    * app needs structured mutable state (filters, selections, UI model)
    * host needs the schema too — to validate writes, persist, detect bad mutations
    * but host can't run generated code (security boundary)
    * so: how does the host know the state shape if the LLM defines it inside the sandbox?
    * naive answer: just store a blob, don't validate → silent corruption, blank screens
    * real answer: LLM declares the shape as JSON data, not executable code
```

### Arrow pipelines for flows

```
* build: source → esbuild (~5ms, JS bundle) + tsc (background, ~500ms, diagnostics)
```

### Honest uncertainty

```
* app state persistence — in page metadata? in memory only? TBD
* key question: how aggressive is the iframe teardown?
```

## The Voice

**Feynman:** Start from the tension. Make the reader feel why the complexity is necessary. If there's no tension, there's no anchor.

**Paul Graham:** First principles. Cut through abstraction. If the obvious answer is wrong, say WHY it's wrong — then the right answer feels inevitable. One sharp example beats ten paragraphs.

Be concrete. Be honest. Admit what's uncertain. The voice stays sharp at every nesting level — deeper doesn't mean chattier, it means more precise.

## Examples

### Platform for building apps inside documents

```
* components and surfaces
  * container
    * external surface (API for the host)
    * internal surface (API for the app)
  * chat
    * ui: how user is seeing it
    * agent: how the agent is seeing it
    * voice assistant
      * sits on top of chat
      * keeps back-n-forth with you and posts some messages. not all of them.
        * when you call `next slide`, it uses `next slide` tool
        * translates consciousness flow into specific intent descriptions
    * possible modes (may overlap with agent):
      * planning / ideation
      * implementation
      * control
  * host
    * orchestrates everything: build, agent execution, state persistence, SDK proxying
    * talks to container via postMessage (sends bundles, receives state/errors)
    * talks to agent (provides tools, receives edits)
    * talks to chat (routes app→chat messages, dispatches chat→app commands)
    * in doc mode: runs in browser, on the Coda page
    * in local mode: runs as a dev server process
  * app (the project/artifact)
    * source files (tsx, ts, css)
    * state schema (schema.json)
    * dependency manifest (package.json + lockfile)
    * the thing the agent edits, the build consumes, and the container runs
    * moves between local and doc mode as a blob
  * agent
    * tools
      * edit/manage files
      * read/write/manage table data
      * manage state
    * subagents/modes
      * visual qa
      * develop idea into a plan
        * chat about an idea
      * implement a plan
```

### Food delivery platform

```
* order lifecycle
  * placed → confirmed → preparing → picked up → delivered → closed
  * any step can fail → refund flow (separate from main lifecycle)
  * problem: restaurant confirms but never prepares
    * need timeout per step (configurable per restaurant)
    * escalation: notify customer after 15min, auto-refund after 30min
    * but: some restaurants are just slow — don't penalize legit slow prep
      * so: learn average prep time per restaurant, timeout = 2x their average
* real-time tracking
  * driver location → customer map (WebSocket, 5s intervals)
  * but: driver app goes offline in tunnels/elevators
    * interpolate position based on route + last known speed
    * show "last seen X min ago" after 30s gap
    * if gap > 2min, switch to "driver is on the way" without position
  * customer-facing vs internal tracking
    * customer sees: smoothed path, ETA, "arriving" state
    * ops dashboard sees: raw GPS, signal quality, speed, deviation from route
      * deviation > 500m from route → flag for ops review
* pricing
  * base + distance + surge + service fee
  * surge: ratio of active orders to available drivers in a zone
    * zone = H3 hexagon, resolution 7 (~5km²)
    * recalculated every 30s
  * problem: surge displayed at order time can change by confirmation time
    * lock price at display for 5 minutes
    * if confirmation happens within window, honor displayed price
    * if not, re-quote — but show "price changed" not just new number
```

### Multiplayer game backend

```
* authority model
  * server is authoritative — client predicts, server corrects
  * but: correction causes visual snapping at high latency
    * client-side reconciliation: replay inputs after server correction
    * buffer 3 frames of server state for interpolation
  * what the client is allowed to do without server confirmation:
    * movement (predicted locally, corrected on mismatch)
    * animation triggers (cosmetic, no gameplay impact)
  * what requires server confirmation:
    * damage, item pickup, ability use
    * these feel laggy at >100ms — that's the latency budget
* rooms
  * matchmaking → room creation → player join → game loop → teardown
  * room lives on one server instance (no cross-server state)
  * player disconnect
    * hold slot for 30s, bot takes over
    * bot mimics player's last behavior pattern (defensive, not aggressive)
    * player can rejoin and resume — bot state transferred back
      * but: if bot died during disconnect, player respawns — feels bad
      * TBD: should we pause the bot? make it invulnerable? neither is great
  * key question: what happens when the server instance dies mid-game?
    * room state is checkpointed every 10s
    * new instance picks up from last checkpoint
    * players see a freeze, not a disconnect — "reconnecting..." for 2-3s
```

## The Manifesto

**1. The napkin is the product.** Not the byproduct. The napkin IS the spec. Everything downstream is derived. Napkin it out before you build anything.

**2. Dive the rabbit holes.** Chase ideas until they collapse or click. Come back with a tag — three words, five max. The tags are the napkin.

**3. Compress until it cracks.** If an arrow between two words captures it, that's your spec. Push constraints against each other in your head. The cracking is how you find the load-bearing ideas.

**4. Two players. Human imagination, AI expansion.** The human stress-tests systems in pure thought. The AI explores twenty paths while the human walks one. This isn't vibe coding. Vibe coding skips thinking. NDD is ONLY thinking — compressed to its seed.

**5. The napkin unfolds into a system.** Bullets become specs. Specs become user journeys. Journeys become tests — before any code exists. Tests define correct. Code is generated to pass them. Twelve bullets started the whole pipeline.

**6. The system self-heals because the napkin defined "right."** Tests fail. Agents read the error, the spec, the napkin. They know what was intended. They fix it. A vibed system breaks and nobody knows what correct means. A napkinned system breaks and rebuilds itself.

**7. Bug? Napkin it. New requirement? Napkin it. Contradiction? Napkin it.** Always the napkin. Sharpen the bullet. Agents rebuild downstream. Code is disposable. The napkin is the source of truth.

**8. Only your imagination is the bottleneck.** Everything else is automated. The most leveraged hour in software is an hour spent napkinning.

**9. The castle was always in the sky. You just wrote down the address.** When the bullets feel inevitable, hand them to the machines. The castle comes down, one agent at a time. It stands, because the napkin was right.
