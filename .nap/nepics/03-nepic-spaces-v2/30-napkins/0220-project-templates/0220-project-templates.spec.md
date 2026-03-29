## 0220 — project templates: spec

This spec gives you direction and constraints. Before writing any code, read the existing `nap3 init` implementation in `packages/v3/src/cli/nap.ts` and the template directory at `packages/v3/src/templates/`.

### CLI changes

Add to `nap3 init`:
- `--template <name>` — use a project template. Copies seed mega-napkin into the project.
- `--template random` — picks a random template.
- `--list-templates` — prints available templates with descriptions, then exits.

When `--template` is given:
1. Run normal init (scaffold .nap/, 00-org/, nepic structure, architect stub, ui-state.json)
2. Copy `seed.nap.md` from the template dir into `.nap/nepics/01-v1/10-docs/01-inputs.nap.md`
3. That's it. The architect prompt.md already says "read prompt.md" — update the prompt template to also mention: "if there's a seed napkin at 10-docs/01-inputs.nap.md, read it and brainstorm with the human about it"

### Template directory

```
src/templates/projects/
  raft-viz/
    seed.nap.md       ← the mega-napkin
    description.txt   ← one line, for --list-templates
  particle-life/
    seed.nap.md
    description.txt
  ...
```

### The seed mega-napkins — this is the main deliverable

Each seed.nap.md must be a REAL mega-napkin. Not a placeholder. Not three bullets. A proper napkin with:
- Vision: what this project is, why it's fun, what makes it interesting
- Two versions (nepics): v1 is the core, v2 adds depth
- 3 napkins per version: each self-contained, implementable
- Tech stack: what libraries to use (Three.js, D3, Canvas, Web Audio, etc.)
- The "fun twist" — what makes each run different or surprising

Write them in napkin format: asterisk bullets, nesting, labels not sentences. They should be good enough that an architect reading them could start breaking them into napkins immediately.

Write at least 5 templates. The napkin lists 10 ideas — pick the best 5 (or more if you're on a roll).

### Prompt template update

Update `src/templates/nepic/20-architects/001-architect/prompt.md` to include a line like:

```
If there's a seed napkin at `10-docs/01-inputs.nap.md`, read it — it's a project idea to brainstorm about with the human. Refine it together before starting to build.
```

### What NOT to do

- Don't change the default (no --template) behavior
- Don't add dependencies — seed napkins describe what to use, the architect's agents install them
- Don't build the template projects — just write the napkins
- Don't break existing tests
