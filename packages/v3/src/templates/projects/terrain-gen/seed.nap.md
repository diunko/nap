* terrain-gen — procedural terrain generator: mega napkin

* what this is
  * browser-based 3D terrain generated from layered Perlin noise
  * fly over mountains, oceans, forests — all from math, no assets
  * tweak parameters in real time: watch continents reshape, seas rise, forests grow
  * the fun: every parameter combination is a new planet

* why it's interesting
  * procedural generation is endlessly surprising — same algorithm, infinite worlds
  * the mapping from noise → terrain → biomes is a beautiful pipeline
  * Three.js makes it look gorgeous with minimal effort
  * real game dev technique — simplified for learning and play
  * the sliders create a "god game" feel — raise sea level, drown civilizations

* tech stack
  * React + TypeScript
  * Three.js for 3D rendering
  * simplex-noise (or hand-rolled Perlin noise)
  * dat.gui or custom React controls for parameter tweaking
  * Vite for build


* nepic 01 — v1: core terrain

  * napkin 0010 — heightmap + mesh generation
    * what: Perlin noise → heightmap → 3D mesh
    * noise generation
      * 2D grid (e.g., 256×256)
      * layered octaves: base terrain + hills + micro-detail
      * controls: octaves (1-8), persistence (amplitude decay), lacunarity (frequency growth)
      * seed input: type a number or word, get a deterministic world
    * mesh construction
      * PlaneGeometry with vertex displacement from heightmap
      * vertex colors or texture based on height
      * normals recalculated for proper lighting
    * camera
      * orbit controls: rotate, zoom, pan
      * fly mode: WASD + mouse look, fly over the terrain
      * minimap: top-down 2D view in corner showing camera position
    * lighting
      * directional light (sun) with shadows
      * ambient light for fill
      * sky gradient: blue above, haze at horizon
    * real-time parameter updates
      * change a slider → heightmap regenerates → mesh updates
      * smooth enough to feel interactive, not just "click and wait"

  * napkin 0020 — biomes + water
    * what: height and moisture → biome coloring, water plane
    * sea level
      * flat water plane at adjustable height
      * transparent blue with fresnel-like edge effect
      * everything below sea level is underwater — color shifts to sandy/deep blue
    * biome assignment by height bands
      * deep water → shallow water → beach → grass → forest → rock → snow
      * each band has a color palette (not a single color — slight noise variation)
      * band thresholds adjustable via sliders
    * moisture map
      * second noise layer: moisture
      * height × moisture → biome type
        * low + dry = desert, low + wet = swamp
        * mid + dry = savanna, mid + wet = forest
        * high = rock/snow regardless of moisture
    * vegetation
      * instanced meshes: simple cone trees, flat grass billboards
      * placement: random within forest/grass biomes
      * density slider: barren wasteland → dense forest
      * trees respect slope — no trees on cliffs
    * atmosphere
      * fog: distance fog colored to match sky
      * fog density slider

  * napkin 0030 — export + presets
    * what: save worlds, share them, try curated starting points
    * world presets
      * "archipelago" — high sea level, many small islands
      * "pangaea" — low sea level, one massive continent
      * "alps" — high persistence, dramatic peaks
      * "plains" — low octaves, gentle rolling hills
      * "alien" — weird lacunarity, non-Earth colors
    * export
      * screenshot: download current view as PNG
      * heightmap: download raw heightmap as grayscale PNG
      * mesh: export as OBJ or GLB for use in other tools
      * settings: export all parameters as JSON
    * share: encode seed + parameters in URL hash
    * comparison mode: split screen, two terrains, linked camera


* nepic 02 — v2: simulation + time

  * napkin 0040 — erosion simulation
    * what: hydraulic and thermal erosion over time
    * hydraulic erosion
      * rain: spawn water droplets across terrain
      * each droplet flows downhill, picks up sediment, deposits when slowing
      * repeated passes carve river valleys and deltas
      * iterations slider: 0 (pristine) → 10000 (deeply eroded)
    * thermal erosion
      * steep slopes shed material to neighbors
      * creates scree slopes and gentler profiles
      * talus angle parameter
    * the visual: watch mountains soften, valleys deepen, rivers form
    * erosion as animation: step through iterations, see terrain evolve
    * before/after toggle: wireframe overlay of original heightmap

  * napkin 0050 — day/night cycle + weather
    * what: time of day changes lighting, sky, and mood
    * sun path
      * directional light orbits the scene
      * dawn: warm orange from horizon
      * noon: harsh white from above
      * dusk: purple/red from opposite horizon
      * night: dim blue moonlight + stars
    * sky rendering
      * gradient sky that shifts with sun position
      * stars appear at night (particle layer or skybox)
      * clouds: scrolling noise-based cloud layer (semi-transparent plane above terrain)
    * time controls
      * time-of-day slider
      * play/pause: auto-advance time
      * speed: seconds per day-cycle
    * weather
      * rain: particle system, darkened sky, wet ground (shininess up)
      * snow: particles + accumulation (raise white biome threshold over time)
      * fog: thickens in valleys at dawn
    * screenshots across times: "golden hour" preset, "midnight" preset

  * napkin 0060 — infinite terrain + LOD
    * what: terrain extends as you fly, detail adapts to distance
    * chunked terrain
      * world divided into chunks (e.g., 64×64 vertex tiles)
      * chunks around camera generated, far chunks culled
      * as camera moves, new chunks stream in, old ones drop
      * seamless: chunk edges match via shared noise seed
    * level of detail (LOD)
      * nearby chunks: full resolution
      * distant chunks: fewer vertices, simplified mesh
      * transition: smooth morph between LOD levels
    * the feeling: endless exploration, always more terrain ahead
    * performance budget: maintain 60fps while streaming
    * compass + coordinates: show position in world space
    * bookmarks: save camera positions, teleport between them
