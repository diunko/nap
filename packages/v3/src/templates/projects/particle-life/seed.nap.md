* particle-life — emergent life from simple rules: mega napkin

* what this is
  * hundreds of colored particles on a 2D canvas
  * each color has attraction/repulsion rules toward every other color
  * simple rules → emergent behavior: clustering, orbiting, chasing, fleeing
  * the fun: tweak one number in the rule matrix, watch entirely new "organisms" appear
  * inspired by Particle Life / Lenia / Primordial Soup simulations

* why it's interesting
  * emergence from simplicity — the core idea of artificial life
  * every rule matrix produces different behavior — infinite replay value
  * visually hypnotic — particles self-organize into structures
  * the rule matrix is the genome — "species" emerge from numbers
  * accessible: no physics degree needed, just sliders and colors

* tech stack
  * React + TypeScript
  * HTML Canvas 2D (with offscreen canvas for perf if needed)
  * no physics engine — the simulation is ~30 lines of math
  * requestAnimationFrame loop
  * Vite for build


* nepic 01 — v1: core simulation

  * napkin 0010 — particle engine + canvas renderer
    * what: N particles, M colors, attraction/repulsion force model
    * each particle: position (x, y), velocity (vx, vy), color (index)
    * force between particles: f(distance, attraction_strength)
      * attraction_strength from rule matrix: colors × colors → float [-1, 1]
      * -1 = strong repulsion, 0 = ignore, 1 = strong attraction
      * force falls off with distance — zero beyond a radius
      * small repulsion zone at very close range (prevents clumping to singularity)
    * Euler integration: velocity += force * dt, position += velocity * dt
    * friction/damping: velocity *= 0.95 each frame (prevents runaway energy)
    * wrapping: particles wrap around canvas edges (toroidal space)
    * rendering: filled circles, color-coded, slight transparency for overlap
    * initial state: random positions, zero velocity
    * performance target: 1000 particles at 60fps on modern hardware
    * spatial optimization: grid-based neighbor lookup (not O(n²) for large N)

  * napkin 0020 — rule matrix editor + controls
    * what: interactive matrix for tuning inter-species rules
    * rule matrix UI: grid of cells, rows = "this color", columns = "attracted to"
      * each cell: colored slider from -1 to +1
      * color gradient in cell: red (repel) → gray (neutral) → green (attract)
    * quick presets
      * "random" — randomize all values
      * "symmetric" — if A→B = x, then B→A = x
      * "predator-prey" — A chases B, B chases C, C chases A (cyclic)
      * "tribes" — strong self-attraction, mild cross-repulsion
      * "orbits" — asymmetric attraction creates orbital patterns
    * global controls
      * particle count slider: 100 → 3000
      * friction slider: 0.8 → 1.0 (1.0 = no damping, chaotic)
      * force radius slider: how far particles sense each other
      * force strength multiplier
    * reset button: re-randomize positions, keep rules
    * randomize button: new rules + new positions

  * napkin 0030 — species presets + save/share
    * what: curated rule sets that produce interesting behaviors
    * preset library
      * "amoeba" — blobs that split and merge
      * "solar system" — one color orbits another
      * "ecosystem" — 4 species, predator-prey-plant dynamics
      * "crystals" — particles lock into geometric lattices
      * "swarm" — all colors form a single moving flock
    * save/load: export rule matrix as JSON
    * share: encode rules in URL hash (compact format)
    * screenshot button: download current frame as PNG
    * show trails toggle: particles leave fading paths (shows motion patterns)
    * info overlay: particle count, fps, energy level, cluster count


* nepic 02 — v2: depth + 3D

  * napkin 0040 — 3D mode
    * what: same simulation, rendered in 3D with Three.js
    * particles as small spheres (instanced mesh for performance)
    * orbiting camera with mouse drag
    * depth cues: particles further from camera are dimmer
    * toggle between 2D and 3D views — same simulation, different renderer
    * 3D-specific controls
      * camera auto-orbit: slow rotation for screensaver mode
      * depth of field: focus on one cluster, blur others
      * particle trails as ribbon geometry
    * performance: instanced rendering, spatial hashing in 3D

  * napkin 0050 — species editor + evolution
    * what: define species with more than just attraction rules
    * species properties
      * color (HSL picker)
      * size (visual + collision radius)
      * speed (max velocity)
      * perception radius (how far they sense)
      * reproduction threshold (cluster size triggers splitting)
    * evolution mode
      * time-based mutation: rules drift slightly each generation
      * survival pressure: species with too few members go extinct
      * new species can emerge (random mutation introduces new color)
      * population graph: line chart showing species counts over time
    * the fun: set up initial conditions, let it run, come back to surprises

  * napkin 0060 — interaction + multi-canvas
    * what: user becomes part of the simulation
    * mouse interaction: cursor is a particle — attract or repel nearby particles
      * left click: attract (be a food source)
      * right click: repel (be a predator)
      * middle click: spawn new particles at cursor
    * multi-canvas: split view showing two simulations side by side
      * same rules, different initial conditions — how different do they diverge?
      * or different rules, same initial conditions — isolate the rule's effect
    * recording: capture simulation as video (MediaRecorder API)
    * sound: map particle density/velocity to ambient tones (Web Audio)
      * each species has a frequency band
      * clustering creates harmonics
      * the simulation becomes a generative instrument
