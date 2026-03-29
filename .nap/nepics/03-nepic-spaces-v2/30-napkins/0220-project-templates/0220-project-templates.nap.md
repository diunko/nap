* 0220 — project templates
  * nap3 init --template <name> sets up a project with a seed mega-napkin
  * the architect boots, reads prompt.md (same as always), finds the mega-napkin, brainstorms with the human
  * templates are fun, visual, browser-based projects that exercise the full NAP pipeline

* how it works
  * nap3 init --template raft-viz
    * standard scaffold (same as plain nap3 init)
    * copies seed mega-napkin from template into 10-docs/01-inputs.nap.md
    * architect prompt.md stays generic: "read prompt.md and follow its instructions"
    * prompt.md points to the mega-napkin: "there's a seed napkin at 10-docs/01-inputs.nap.md — read it, brainstorm with the human, refine it together"
  * nap3 init --list-templates
    * lists available templates with one-line descriptions
  * nap3 init --template random
    * picks a random template — for when you just want to play
  * nap3 init (no --template)
    * same as today — empty project, architect with generic prompt, no seed napkin

* template structure
  * src/templates/projects/
    * raft-viz/
      * seed.nap.md — the mega-napkin for a Raft consensus visualizer
      * description.txt — one-liner for --list-templates
    * particle-life/
      * seed.nap.md
      * description.txt
    * terrain-gen/
      * seed.nap.md
      * description.txt
    * (more templates...)

* the seed mega-napkins
  * each is a real mega-napkin: vision, features, two versions (nepics), 3 napkins each
  * written in napkin format: bullets, nesting, labels not sentences
  * good enough to start building from — not a spec, a brainstorming seed
  * the architect and human refine it together before launching agents

* template ideas (all browser-based, visual, fun)
  * raft-viz — Raft consensus algorithm visualizer. nodes, leader election, log replication, network partitions. v2 adds membership changes + scenario menu.
  * particle-life — colored particles with attraction/repulsion rules. emergent behavior. rule matrix editor. v2 adds 3D mode + species presets.
  * terrain-gen — Three.js heightmap from Perlin noise. sliders for octaves, sea level, vegetation. v2 adds erosion + day/night cycle.
  * git-graph — 3D force-directed graph of git history. commits as nodes, branches as colors. v2 adds time-travel slider + diff viewer.
  * sorting-theater — 3D blocks on a stage, sorting algorithms perform live. side-by-side race mode. v2 adds audience reactions.
  * event-loop-viz — JavaScript event loop visualizer. call stack, microtask queue, macrotask queue. paste code, watch execution step by step.
  * load-balancer — 50 servers, requests as particles. switch algorithms live. kill servers, watch redistribution.
  * crdt-playground — multiple editors, network lag slider, partition button. CRDTs merge in real time.
  * molecule-viewer — 3D ball-and-stick from SMILES strings. rotate, zoom. element colors.
  * fractal-garden — L-system procedural plants. editable grammar, animation, wind.

* what to build
  * --template and --list-templates flags in nap3 init CLI
  * template directory structure in src/templates/projects/
  * at least 5 seed mega-napkins (the fun part)
  * updated prompt.md template that points architect to seed napkin when present

* testing
  * small: nap3 init --template raft-viz creates correct files in correct locations
  * small: nap3 init --list-templates outputs all available templates
  * small: nap3 init --template nonexistent gives helpful error
  * small: nap3 init (no template) still works as before
  * medium: nap3 init --template → nap3 open → architect finds and reads seed napkin

* done criteria
  * nap3 init --template <name> creates project with seed mega-napkin
  * nap3 init --list-templates shows available templates
  * at least 5 templates with real, interesting seed mega-napkins
  * architect boots up and finds the seed napkin
  * all existing tests still pass
