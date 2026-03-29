## What was built

### CLI changes (`packages/v3/src/cli/nap.ts`)

- `nap3 init --template <name>` — runs normal init, then copies `seed.nap.md` from `src/templates/projects/<name>/` into `.nap/nepics/01-v1/10-docs/01-inputs.nap.md`
- `nap3 init --template random` — picks a random template, prints which one was chosen
- `nap3 init --list-templates` — prints all available templates with one-line descriptions, then exits
- Unknown template name: prints error message, cleans up the .nap/ directory that was created, exits 1
- No-template behavior unchanged — existing tests still pass

### Architect prompt update (`src/templates/nepic/20-architects/001-architect/prompt.md`)

Added: "If there's a seed napkin at `10-docs/01-inputs.nap.md`, read it — it's a project idea to brainstorm about with the human."

The original "talk to the human" flow is now the fallback when no seed napkin exists.

### 5 seed mega-napkins (`src/templates/projects/`)

Each has `seed.nap.md` (full mega-napkin) + `description.txt` (one-liner):

1. **raft-viz** — Raft consensus algorithm visualizer. v1: nodes, elections, log replication, partition tool. v2: membership changes, scenario editor, teaching mode.
2. **particle-life** — Emergent life from attraction/repulsion rules. v1: particle engine, rule matrix editor, presets. v2: 3D mode, evolution, sound/recording.
3. **terrain-gen** — Three.js procedural terrain. v1: Perlin noise heightmap, biomes, water, vegetation. v2: hydraulic erosion, day/night cycle, infinite terrain.
4. **git-graph** — 3D force-directed graph of git history. v1: parser, layout, branch colors, navigation. v2: time-travel slider, diff viewer, collaboration view.
5. **sorting-theater** — Sorting algorithms on a 3D stage. v1: blocks, 6 algorithms, race mode. v2: audience reactions, custom algorithm input, complexity analysis.

### Test results

- `tsc --noEmit`: 0 errors
- `vitest run` (small): 114 passed
- `playwright test` (medium): 21 passed
