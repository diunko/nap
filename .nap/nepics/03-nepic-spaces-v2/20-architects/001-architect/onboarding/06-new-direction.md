# New Direction

The previous architect (Nova, nepic 02) and the human spent a long session reflecting on what worked, what didn't, and what the architecture should look like for nepic 03. The result is a mega napkin that covers everything: the model layer, persistence model, testing approach, monorepo structure, and milestones.

## Where to read it

All the thinking lives in **Nova's architect directory** (not yours):

```
.nap/nepics/02-nepic-spaces/20-architects/001-architect/
```

### Start here — the mega napkin:

**`scratch/80-nepic03-mega-napkin.nap.md`** — the authoritative design for nepic 03. Read this first, cover to cover. It has pointers to everything else.

### The thinking that led to it (in order):

These are in Nova's `scratch/` directory at the path above:

1. **`scratch/70-reflection-and-new-direction.nap.md`** — reflection on nepic 02 with inline discussion between human (`//` comments) and Nova (`//AN:` comments). This is where the key insights emerged. Read the comments — they're the real content.

2. **`scratch/72-reflection-and-new-direction.nap.md`** — thinking exercises: journey testing approach + the 2-state model (stopped/running). Also has human comments.

3. **`scratch/73-reflection-and-new-direction.nap.md`** — deeper dive on s→r transition as a testable concept, JSON fixtures for testing. Also has human comments.

### Reference materials (also in Nova's directory):

These are in Nova's `reference/` directory at the same path:

- **`reference/main-flows.nap.md`** — every key action traced step by step (agent launch, click, done, file write, quit). Shows exactly what happens at each stage.
- **`reference/architecture-diagram.html`** — visual diagram of all actors and communication channels. Open in browser.
- **`reference/t3code-testing-patterns-catalog.md`** — testing patterns from another project. Patterns 1, 4, and 5 directly apply.

### Design and stories (also in nepic 02):

- **`stories/00-journeys.nap.md`** — the designer's emotional journey (J1-J5)
- **`stories/01-core-stories.nap.md`** — PM user stories with Nova's `//A:` review comments flagging issues

### Still-valid design from nepic 02:

- **`scratch/63-agent-lifecycle.nap.md`** — agent lifecycle system design (concepts carry forward, implementation changes)
- **`scratch/64-agent-lifecycle-roadmap.nap.md`** — roadmap (sequencing lessons apply)

## The key ideas (preview)

- **Model layer**: two models (main + renderer) connected by a typed bridge. Testable with fakes. No dual-truth sync.
- **2-state persistence**: stopped (data on disk) ↔ running (data in memory). Marker files (.agent.nap.json) on filesystem. Ephemeral state dies on stop, rebuilt on start.
- **Journey-first testing**: test the model with fake sources. Journey tests as acceptance criteria, written before implementation.
- **Monorepo**: v2 and v3 side by side in packages/, both runnable.

Read the mega napkin for the full picture. Then brainstorm with the human.
